/** Screen geometry and screenshots at the three M0 device viewports. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './lib/server.mjs';
import { activate, collectErrors, launchBrowser, screenshot, waitForHook, waitInPage } from './lib/browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await startServer({ dist: process.argv.includes('--dist') });
let browser;
const targets = [
  { name: 'desktop', width: 1280, height: 720, touch: false },
  { name: 'landscape', width: 844, height: 390, touch: true },
  { name: 'portrait', width: 390, height: 844, touch: true },
];

function inside(box, width, height) {
  return box && box.width >= 1 && box.height >= 1 && box.left >= 0 && box.top >= 0 && box.right <= width && box.bottom <= height;
}

function crosses(a, b) {
  return a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

try {
  browser = await launchBrowser();
  for (const target of targets) {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: target.width, height: target.height, deviceScaleFactor: 1, hasTouch: target.touch, isMobile: target.touch });
      const problems = collectErrors(page, { origin: server.url });
      await page.goto(server.url + '?debug&seed=7', { waitUntil: 'domcontentloaded' });
      await waitForHook(page);
      assert.equal(await waitInPage(page, () => !document.getElementById('boot'), { timeout: 2000 }), true, `${target.name}: boot screen clears`);
      const menu = await page.evaluate(() => {
        const rect = selector => {
          const node = document.querySelector(selector);
          if (!node) return null;
          const r = node.getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
        };
        return { sign: rect('.menu-sign'), tools: rect('.menu-tools'), play: rect('[data-act="play"]') };
      });
      await screenshot(page, path.join(root, 'artifacts', 'devices', `${target.name}-menu.png`));
      for (const [name, box] of Object.entries(menu)) assert.ok(inside(box, target.width, target.height), `${target.name}: ${name} outside viewport`);
      assert.equal(crosses(menu.sign, menu.tools), false, `${target.name}: menu tools cover sign`);
      assert.ok(menu.play.height >= 44, `${target.name}: play target too small`);

      await activate(page, '[data-act="play"]', { touch: target.touch });
      const hud = await page.evaluate(() => {
        const rect = selector => {
          const node = document.querySelector(selector);
          if (!node) return null;
          const r = node.getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
        };
        return { pause: rect('.hud-pause'), score: rect('.hud-stack') };
      });
      for (const [name, box] of Object.entries(hud)) assert.ok(inside(box, target.width, target.height), `${target.name}: ${name} outside viewport`);
      assert.equal(crosses(hud.pause, hud.score), false, `${target.name}: pause covers score`);
      assert.ok(hud.pause.width >= 44 && hud.pause.height >= 44, `${target.name}: pause target too small`);
      await screenshot(page, path.join(root, 'artifacts', 'devices', `${target.name}-run.png`));
      assert.equal(problems.errors.length, 0, `${target.name}: ${problems.errors.join('; ')}`);
      console.log(`${target.name}: menu and HUD fit, controls separated`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
