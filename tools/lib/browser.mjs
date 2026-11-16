/**
 * Headless Chrome for the browser checks (WP-06): smoke.mjs and devices.mjs now, loadtime.mjs and profile.mjs later.
 *
 * - findBrowser(), launchBrowser(): BROWSER or CHROME_PATH, else Chrome, Edge or Chromium where Windows, macOS and
 *   Linux install them; puppeteer-core with software WebGL (SwiftShader), so no GPU is needed and every machine draws
 *   the same frames.
 * - collectErrors(): page errors, console errors and failed requests (HTTP 400 and up) as lines of text.
 * - The test contract in src/debug/hooks.ts: waitForHook(), snapshot(), callHook(); waitForBoot() for pages without
 *   the hooks (no ?debug or ?bot).
 * - Input as a player makes it: touchSwipe() and touchTap() through CDP Input.dispatchTouchEvent, which goes through
 *   Chrome's real input pipeline (touch and pointer events, a click after a tap); keyAction() through the keyboard.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

/** Chrome flags for every check: software WebGL with no GPU blocklist, and audio that starts without a gesture. */
export const BROWSER_ARGS = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--autoplay-policy=no-user-gesture-required',
];

/** Arrow keys for the four actions (WASD and Space work in the game too). */
export const KEYS = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };

/** Unit steps on screen for the four actions: screen y grows downwards, so up is −y. */
const DIRECTIONS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

/** Where browsers are usually installed, most likely first. */
function browserCandidates() {
  const env = process.env;
  const under = (base, rest) => (base ? path.join(base, rest) : null);
  const home = os.homedir();
  return [
    // Windows (the environment variables cover non-default drives).
    under(env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
    under(env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'),
    under(env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    under(env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe'),
    under(env.PROGRAMFILES, 'Microsoft/Edge/Application/msedge.exe'),
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    path.join(home, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable',
  ].filter(Boolean);
}

/**
 * The browser to drive: BROWSER or CHROME_PATH when set (an error if that file is missing, rather than quietly using
 * another browser), else the first Chrome, Edge or Chromium installed.
 * @returns {string}
 */
export function findBrowser() {
  for (const name of ['BROWSER', 'CHROME_PATH']) {
    const value = process.env[name];
    if (!value) continue;
    if (fs.existsSync(value)) return value;
    throw new Error(`${name}=${value}, but there is no such file.`);
  }
  const found = browserCandidates().find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error('No Chrome, Edge or Chromium found. Set BROWSER (or CHROME_PATH) to its executable.');
  return found;
}

/**
 * Launches the browser, headless unless asked otherwise.
 * @param {{ headless?: boolean, args?: string[] }} [options] `args` are added to BROWSER_ARGS.
 * @returns {Promise<import('puppeteer-core').Browser>}
 */
export async function launchBrowser({ headless = true, args = [] } = {}) {
  return puppeteer.launch({
    executablePath: findBrowser(),
    headless,
    args: [...BROWSER_ARGS, ...args],
    // Software WebGL on a busy machine can be slow to answer; a long wait beats a spurious failure.
    protocolTimeout: 180_000,
  });
}

/** @param {number} ms */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * True for puppeteer's timeout errors (waitForFunction, waitForSelector, goto).
 * @param {unknown} error
 */
export function isTimeout(error) {
  return error instanceof Error && error.name === 'TimeoutError';
}

/**
 * The first line of an error or message, at most `max` characters.
 * @param {unknown} value
 * @param {number} [max]
 */
export function firstLine(value, max = 300) {
  const text = value instanceof Error ? value.message : String(value);
  const line = text.split('\n')[0].trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/**
 * Starts listening to a page for problems: uncaught page errors, console.error calls, responses with status 400 and
 * up, and requests that failed outright. Warnings are kept apart: they are reported but are not failures.
 * @param {import('puppeteer-core').Page} page
 * @param {{ origin?: string }} [options] `origin` is cut from URLs to keep the lines short.
 * @returns {{ errors: string[], warnings: string[] }} Arrays that fill up as the page runs.
 */
export function collectErrors(page, { origin = '' } = {}) {
  const errors = [];
  const warnings = [];
  const base = origin.replace(/\/$/, '');
  const short = (url) => (base && url.startsWith(base) ? url.slice(base.length) || '/' : url);
  page.on('pageerror', (error) => {
    const at = error instanceof Error ? (error.stack ?? '').split('\n').find((line) => /^\s*at /.test(line)) : undefined;
    errors.push(`page error: ${firstLine(error)}${at ? ` (${short(at.trim().replace(/^at /, ''))})` : ''}`);
  });
  page.on('console', (message) => {
    const type = message.type();
    if (type !== 'error' && type !== 'warn' && type !== 'warning') return;
    const text = message.text();
    // A failed response says this too; the response handler below reports it with its URL.
    if (type === 'error' && text.startsWith('Failed to load resource')) return;
    const { url, lineNumber } = message.location() ?? {};
    const where = url ? ` (${short(url)}${typeof lineNumber === 'number' ? `:${lineNumber + 1}` : ''})` : '';
    if (type === 'error') errors.push(`console.error: ${firstLine(text)}${where}`);
    else warnings.push(`console.warn: ${firstLine(text)}${where}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${short(response.url())}`);
  });
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? 'failed';
    // A navigation or the page itself cancelled it: not a problem in the game.
    if (reason === 'net::ERR_ABORTED') return;
    errors.push(`request failed (${reason}): ${short(request.url())}`);
  });
  return { errors, warnings };
}

/** Why a page is not up yet: read from the boot screen (index.html) and the hooks. */
async function bootDiagnosis(page, waited) {
  const info = await page
    .evaluate(() => ({
      hooks: typeof window.__runshift === 'object' && window.__runshift !== null,
      done: window.done === true,
      failed: document.getElementById('boot')?.classList.contains('failed') ?? false,
      message: document.querySelector('#boot p')?.firstChild?.textContent ?? null,
    }))
    .catch((error) => ({ evalError: firstLine(error) }));
  const seconds = `${Math.round(waited / 1000)} s`;
  if ('evalError' in info) return `the page could not be read (${info.evalError})`;
  if (info.message) return `the boot screen says "${firstLine(info.message, 200)}"`;
  if (!info.hooks) {
    return info.done
      ? 'the game is up but window.__runshift was never installed (it needs ?debug or ?bot)'
      : `the game did not start within ${seconds}: no boot error shown, no window.__runshift`;
  }
  return `window.__runshift exists but its ready flag stayed false for ${seconds} (no frame drawn)`;
}

/**
 * Waits until window.__runshift.ready (the first frame is drawn). Throws an Error saying what went wrong: the boot
 * screen's message, missing hooks, or no first frame.
 * @param {import('puppeteer-core').Page} page
 * @param {{ timeout?: number }} [options]
 */
export async function waitForHook(page, { timeout = 30_000 } = {}) {
  try {
    await page.waitForFunction(() => window.__runshift?.ready === true, { timeout, polling: 100 });
  } catch (error) {
    if (!isTimeout(error)) throw error;
    throw new Error(await bootDiagnosis(page, timeout));
  }
}

/**
 * Waits until the game is up without the hooks: window.done, which src/app/boot.ts sets on the first frame.
 * @param {import('puppeteer-core').Page} page
 * @param {{ timeout?: number }} [options]
 */
export async function waitForBoot(page, { timeout = 30_000 } = {}) {
  try {
    await page.waitForFunction(() => window.done === true, { timeout, polling: 100 });
  } catch (error) {
    if (!isTimeout(error)) throw error;
    throw new Error(await bootDiagnosis(page, timeout));
  }
}

/**
 * Waits until `fn` returns something truthy in the page. False on timeout; other errors (a navigation) are thrown.
 * Polls every animation frame by default, so short states (a jump, a slide) are not missed.
 * @param {import('puppeteer-core').Page} page
 * @param {(...args: any[]) => unknown} fn Runs in the page: it may only use its arguments and the page's globals.
 * @param {{ timeout?: number, polling?: 'raf' | 'mutation' | number, args?: unknown[] }} [options]
 * @returns {Promise<boolean>}
 */
export async function waitInPage(page, fn, { timeout = 3000, polling = 'raf', args = [] } = {}) {
  try {
    await page.waitForFunction(fn, { timeout, polling }, ...args);
    return true;
  } catch (error) {
    if (isTimeout(error)) return false;
    throw error;
  }
}

/**
 * @typedef {object} HookSnapshot
 * @property {'menu' | 'run' | 'results'} screen
 * @property {boolean} paused
 * @property {Record<string, any>} state window.__runshift.state() (DebugState in src/debug/hooks.ts).
 */

/**
 * The screen, pause flag and run state from the hooks, or null when window.__runshift is missing.
 * @param {import('puppeteer-core').Page} page
 * @returns {Promise<HookSnapshot | null>}
 */
export async function snapshot(page) {
  return page.evaluate(() => {
    const hooks = window.__runshift;
    if (!hooks) return null;
    return { screen: hooks.screen(), paused: hooks.paused(), state: hooks.state() };
  });
}

/**
 * Calls a window.__runshift method (play, retry, toMenu, act, events, save...) and returns its result.
 * @param {import('puppeteer-core').Page} page
 * @param {string} method
 * @param {...unknown} args
 */
export async function callHook(page, method, ...args) {
  return page.evaluate(
    (name, list) => {
      const hooks = window.__runshift;
      if (!hooks) throw new Error('window.__runshift is missing');
      return hooks[name](...list);
    },
    method,
    args,
  );
}

/**
 * Is any element matching `selector` showing? Runs in the page: a box of at least 1×1 px on screen, no display none,
 * no visibility hidden, and no element on the way up faded below 5% opacity.
 * @param {string} selector
 */
function anyShown(selector) {
  for (const el of document.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) continue;
    let shown = true;
    for (let e = el; e; e = e.parentElement) {
      const style = getComputedStyle(e);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.05) {
        shown = false;
        break;
      }
    }
    if (shown) return true;
  }
  return false;
}

/**
 * Whether any element matching `selector` is showing now.
 * @param {import('puppeteer-core').Page} page
 * @param {string} selector
 */
export async function isVisible(page, selector) {
  return page.evaluate(anyShown, selector);
}

/**
 * Waits until an element matching `selector` shows. False on timeout.
 * @param {import('puppeteer-core').Page} page
 * @param {string} selector
 * @param {{ timeout?: number }} [options]
 */
export async function waitVisible(page, selector, { timeout = 3000 } = {}) {
  return waitInPage(page, anyShown, { timeout, polling: 100, args: [selector] });
}

/**
 * Taps (touch) or clicks (mouse) the first showing element that matches `selector`, the way a player would.
 * Returns false when none shows.
 * @param {import('puppeteer-core').Page} page
 * @param {string} selector
 * @param {{ touch?: boolean }} [options]
 */
export async function activate(page, selector, { touch = false } = {}) {
  for (const handle of await page.$$(selector)) {
    if (!(await handle.isVisible())) continue;
    if (touch) await handle.tap();
    else await handle.click();
    return true;
  }
  return false;
}

const sessions = new WeakMap();

/**
 * One CDP session per page, for the touch input and the emulation commands puppeteer does not wrap.
 * @param {import('puppeteer-core').Page} page
 * @returns {Promise<import('puppeteer-core').CDPSession>}
 */
export async function cdpSession(page) {
  let session = sessions.get(page);
  if (!session) {
    session = await page.createCDPSession();
    sessions.set(page, session);
  }
  return session;
}

/**
 * How far touchSwipe() moves by default: 10% of the short side of the screen, 40 to 72 CSS px. That is 1.5 to 1.7
 * times the game's swipe threshold (INPUT.swipe in src/balance.ts: 6% of the short side, clamped to 24-48 px), so it
 * is a clear swipe but can only ever count as one, even for a detector that starts a new swipe where one fired.
 * @param {number} width CSS px
 * @param {number} height CSS px
 */
export function swipeLength(width, height) {
  return Math.min(72, Math.max(40, 0.1 * Math.min(width, height)));
}

/**
 * A one-finger swipe through CDP Input.dispatchTouchEvent: touchStart, six touchMoves over about 120 ms, touchEnd.
 * Centred on the screen unless `from` gives the midpoint.
 * @param {import('puppeteer-core').Page} page
 * @param {'left' | 'right' | 'up' | 'down'} dir
 * @param {{ distance?: number, from?: { x: number, y: number }, steps?: number, duration?: number }} [options]
 * @returns {Promise<{ start: [number, number], end: [number, number], distance: number }>}
 */
export async function touchSwipe(page, dir, { distance, from, steps = 6, duration = 120 } = {}) {
  const unit = DIRECTIONS[dir];
  if (!unit) throw new Error(`touchSwipe: unknown direction ${dir}`);
  const { width, height } = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const length = distance ?? swipeLength(width, height);
  const cx = from?.x ?? width / 2;
  const cy = from?.y ?? height / 2;
  const x0 = cx - (unit[0] * length) / 2;
  const y0 = cy - (unit[1] * length) / 2;
  const at = (k) => [{ x: x0 + (unit[0] * length * k) / steps, y: y0 + (unit[1] * length * k) / steps, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  const cdp = await cdpSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let k = 1; k <= steps; k++) {
    await sleep(duration / steps);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(k) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  return { start: [x0, y0], end: [x0 + unit[0] * length, y0 + unit[1] * length], distance: length };
}

/**
 * A short tap through CDP Input.dispatchTouchEvent.
 * @param {import('puppeteer-core').Page} page
 * @param {number} x CSS px
 * @param {number} y CSS px
 */
export async function touchTap(page, x, y) {
  const cdp = await cdpSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await sleep(50);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/**
 * Presses and releases the arrow key for an action, held for `hold` ms like a quick real press.
 * @param {import('puppeteer-core').Page} page
 * @param {'left' | 'right' | 'up' | 'down'} dir
 * @param {{ hold?: number }} [options]
 */
export async function keyAction(page, dir, { hold = 40 } = {}) {
  const key = KEYS[dir];
  if (!key) throw new Error(`keyAction: unknown direction ${dir}`);
  await page.keyboard.down(key);
  await sleep(hold);
  await page.keyboard.up(key);
}

/**
 * Saves a screenshot of the viewport, making the folder if needed. Never throws: a failed screenshot must not end a
 * check run. Returns whether the file was written.
 * @param {import('puppeteer-core').Page} page
 * @param {string} file
 */
export async function screenshot(page, file) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file });
    return true;
  } catch {
    return false;
  }
}

/**
 * Empties a tool's output folder of the files a previous run left (by extension), so no stale screenshot is mistaken
 * for a new one. Makes the folder if needed.
 * @param {string} dir
 * @param {string[]} extensions e.g. ['.png', '.json']
 */
export function cleanOutput(dir, extensions) {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of fs.readdirSync(dir)) {
    if (extensions.includes(path.extname(name).toLowerCase())) fs.rmSync(path.join(dir, name), { force: true });
  }
}
