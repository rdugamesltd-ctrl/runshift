/** Browser smoke checks for the grey-box runner: desktop, landscape touch and portrait touch. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './lib/server.mjs';
import { activate, collectErrors, keyAction, launchBrowser, screenshot, snapshot, touchSwipe, waitForHook, waitInPage } from './lib/browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'smoke');
const server = await startServer({ dist: process.argv.includes('--dist') });
let browser;
try {
  browser = await launchBrowser();
  for (const target of [
    { name: 'desktop', width: 1280, height: 720, touch: false },
    { name: 'landscape', width: 844, height: 390, touch: true },
    { name: 'portrait', width: 390, height: 844, touch: true },
  ]) {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: target.width, height: target.height, deviceScaleFactor: 1, hasTouch: target.touch, isMobile: target.touch });
      const problems = collectErrors(page, { origin: server.url });
      await page.goto(server.url + '?debug&seed=7', { waitUntil: 'domcontentloaded' });
      await waitForHook(page);
      assert.equal((await snapshot(page)).screen, 'menu', `${target.name}: menu first`);
      assert.equal(await activate(page, '[data-act="play"]', { touch: target.touch }), true, `${target.name}: play button`);
      assert.equal(await waitInPage(page, () => window.__runshift?.state().phase === 'running', { timeout: 5000 }), true, `${target.name}: run starts`);
      if (target.touch) await touchSwipe(page, 'right', { steps: 2, duration: 60 });
      else await keyAction(page, 'right');
      assert.equal(await waitInPage(page, () => window.__runshift?.state().lane === 1, { timeout: 1500 }), true, `${target.name}: lane input`);
      if (target.touch) await touchSwipe(page, 'up', { steps: 2, duration: 60 });
      else await keyAction(page, 'up');
      assert.equal(await waitInPage(page, () => window.__runshift?.state().mode === 'jump', { timeout: 1500 }), true, `${target.name}: jump input`);
      assert.equal(await waitInPage(page, () => window.__runshift?.state().mode === 'run', { timeout: 1500 }), true, `${target.name}: jump lands`);
      if (target.touch) await touchSwipe(page, 'down', { steps: 2, duration: 60 });
      else await keyAction(page, 'down');
      assert.equal(await waitInPage(page, () => window.__runshift?.state().mode === 'slide', { timeout: 1500 }), true, `${target.name}: slide input`);
      assert.equal(await activate(page, '[data-act="pause"]', { touch: target.touch }), true, `${target.name}: pause button`);
      assert.equal((await snapshot(page)).paused, true, `${target.name}: paused`);
      assert.equal(await activate(page, '[data-act="resume"]', { touch: target.touch }), true, `${target.name}: resume button`);
      assert.equal(await waitInPage(page, () => window.__runshift?.paused() === false, { timeout: 5000 }), true, `${target.name}: countdown resumes`);
      await screenshot(page, path.join(out, `${target.name}.png`));
      assert.equal(problems.errors.length, 0, `${target.name}: ${problems.errors.join('; ')}`);
      const stats = await page.evaluate(() => window.__runshift.stats());
      assert.ok(stats.calls <= 100, `${target.name}: ${stats.calls} draw calls`);
      console.log(`${target.name}: menu, input, pause and resume OK; ${stats.calls} calls`);
    } finally {
      await page.close();
    }
  }

  const page = await browser.newPage();
  try {
    const problems = collectErrors(page, { origin: server.url });
    await page.goto(server.url + '?debug&pattern=jump-low&d=40&speed=4', { waitUntil: 'domcontentloaded' });
    await waitForHook(page);
    assert.equal(await activate(page, '[data-act="play"]'), true);
    assert.equal(await waitInPage(page, () => window.__runshift?.screen() === 'results', { timeout: 12_000 }), true, 'crash leads to results');
    assert.equal(await activate(page, '[data-act="retry"]'), true);
    assert.equal((await snapshot(page)).screen, 'run', 'retry starts a new run');
    assert.equal(await waitInPage(page, () => window.__runshift?.screen() === 'results', { timeout: 12_000 }), true, 'retry can finish');
    assert.equal(await activate(page, '[data-act="menu"]'), true);
    assert.equal((await snapshot(page)).screen, 'menu', 'results return to menu');
    assert.equal(problems.errors.length, 0, problems.errors.join('; '));
    console.log('results: crash, retry and menu OK');
  } finally {
    await page.close();
  }

  const botPage = await browser.newPage();
  try {
    const problems = collectErrors(botPage, { origin: server.url });
    await botPage.goto(server.url + '?bot=perfect&seed=7&speed=4', { waitUntil: 'domcontentloaded' });
    await waitForHook(botPage);
    assert.equal(await waitInPage(botPage, () => window.__runshift?.state().d >= 600 || window.__runshift?.screen() === 'results', { timeout: 30_000 }), true, 'perfect bot reaches a verdict');
    const bot = await snapshot(botPage);
    assert.ok(bot.state.d >= 600, `perfect bot stopped at ${bot.state.d.toFixed(1)} m`);
    assert.equal(bot.screen, 'run');
    assert.equal(problems.errors.length, 0, problems.errors.join('; '));
    console.log(`bot: reached ${bot.state.d.toFixed(1)} m`);
  } finally {
    await botPage.close();
  }

  for (const pattern of ['wall-right-swap', 'wall-left-swap']) {
    const wallPage = await browser.newPage();
    try {
      const problems = collectErrors(wallPage, { origin: server.url });
      await wallPage.goto(server.url + `?bot=perfect&pattern=${pattern}&seed=7&speed=2`, { waitUntil: 'domcontentloaded' });
      await waitForHook(wallPage);
      assert.equal(await waitInPage(wallPage, () => window.__runshift?.state().mode === 'wallRun', { timeout: 8000 }), true, `${pattern}: attaches`);
      assert.equal(await waitInPage(wallPage, () => !document.getElementById('boot'), { timeout: 2000 }), true, `${pattern}: boot clears`);
      assert.equal(await waitInPage(wallPage, () => window.__runshift?.state().mode === 'wallRun', { timeout: 6000 }), true, `${pattern}: running on wall after boot`);
      await screenshot(wallPage, path.join(out, `${pattern}.png`));
      assert.equal(await waitInPage(wallPage, () => window.__runshift?.state().d >= 160 || window.__runshift?.screen() === 'results', { timeout: 20_000 }), true, `${pattern}: reaches a verdict`);
      const state = await snapshot(wallPage);
      const events = await wallPage.evaluate(() => window.__runshift.events());
      assert.ok(state.state.d >= 160, `${pattern}: stopped at ${state.state.d.toFixed(1)} m`);
      assert.ok(events.filter(event => event.type === 'wallAttach').length >= 3, `${pattern}: wall attaches`);
      assert.ok(events.filter(event => event.type === 'wallJump').length >= 1, `${pattern}: wall jump`);
      assert.equal(problems.errors.length, 0, problems.errors.join('; '));
      console.log(`${pattern}: ${events.filter(event => event.type === 'wallAttach').length} attaches, ${events.filter(event => event.type === 'wallJump').length} jumps`);
    } finally {
      await wallPage.close();
    }
  }

  const greyPage = await browser.newPage();
  try {
    await greyPage.goto(server.url + '?debug&greybox&seed=7', { waitUntil: 'domcontentloaded' });
    await waitForHook(greyPage);
    const stats = await greyPage.evaluate(() => window.__runshift.stats());
    const loadedModels = await greyPage.evaluate(() => performance.getEntriesByType('resource').some(entry => /\/(world-kit|hero|thief)\.glb/.test(entry.name)));
    // The yard (ballast, sleepers, rails, painted walls) and liveried trains add a few batches over the M0 grey box.
    assert.ok(stats.calls <= 20, `greybox uses ${stats.calls} calls`);
    assert.equal(loadedModels, false, 'greybox skips model downloads');
    console.log('greybox: capsules retained and model downloads skipped');
  } finally {
    await greyPage.close();
  }

  const tutorialPage = await browser.newPage();
  try {
    const problems = collectErrors(tutorialPage, { origin: server.url });
    await tutorialPage.goto(server.url + '?debug&tutorial&speed=4', { waitUntil: 'domcontentloaded' });
    await waitForHook(tutorialPage);
    assert.equal(await activate(tutorialPage, '[data-act="play"]'), true);
    const card = () => {
      const node = document.querySelector('.coach-card');
      return node && !node.classList.contains('hidden') ? `${node.dataset.tip}:${node.dataset.action}` : null;
    };
    const stops = [];
    let sawWall = false;
    for (let i = 0; i < 7; i++) {
      assert.equal(await waitInPage(tutorialPage, card, { timeout: 15_000 }), true, `lesson ${i + 1} appears`);
      const stop = await tutorialPage.evaluate(card);
      stops.push(stop);
      const frozenD = (await snapshot(tutorialPage)).state.d;
      if (i === 0) {
        await new Promise(resolve => setTimeout(resolve, 450));
        await keyAction(tutorialPage, 'right');
        assert.equal(await waitInPage(tutorialPage, () => document.querySelector('.coach-card')?.classList.contains('is-wrong'), { timeout: 1000 }), true, 'wrong press shakes the card');
        await new Promise(resolve => setTimeout(resolve, 300));
        assert.ok(Math.abs((await snapshot(tutorialPage)).state.d - frozenD) < 0.01, 'wrong press leaves run frozen');
        await screenshot(tutorialPage, path.join(out, 'tutorial-lanes.png'));
      } else await new Promise(resolve => setTimeout(resolve, 400));
      if (stop.startsWith('wall:')) await screenshot(tutorialPage, path.join(out, 'tutorial-wall.png'));
      await keyAction(tutorialPage, stop.split(':')[1]);
      assert.equal(await waitInPage(tutorialPage, () => document.querySelector('.coach-card')?.classList.contains('hidden'), { timeout: 3000 }), true, `${stop}: right press lets the run go`);
      if (stop.startsWith('wall:')) sawWall = await waitInPage(tutorialPage, () => window.__runshift?.state().mode === 'wallRun', { timeout: 3000 });
    }
    assert.deepEqual(stops, ['lanes:left', 'lanes:right', 'jump:up', 'slide:down', 'wall:right', 'band:up', 'wallJump:left'], 'lessons in order');
    assert.equal(sawWall, true, 'wall lesson attaches to the wall');
    assert.equal(await waitInPage(tutorialPage, () => document.querySelector('.coach-pill')?.classList.contains('hidden'), { timeout: 8000 }), true, 'lesson pill goes once done');
    const tutorialState = await snapshot(tutorialPage);
    assert.equal(tutorialState.screen, 'run', 'tutorial survived');
    assert.deepEqual((await tutorialPage.evaluate(() => window.__runshift.save())).tips, ['lanes', 'jump', 'slide', 'wall', 'band', 'wallJump'], 'every tip saved');
    const events = await tutorialPage.evaluate(() => window.__runshift.events());
    assert.ok(events.some(event => event.type === 'thiefDemo' && event.act === 'wall'), 'thief demonstrated wall run');
    assert.ok(events.some(event => event.type === 'wallJump'), 'player wall-jumped');
    assert.equal(problems.errors.length, 0, problems.errors.join('; '));
    console.log('tutorial: seven lessons, freeze, wrong press, right presses, wall run and wall jump OK');
  } finally {
    await tutorialPage.close();
  }

  const savedPage = await browser.newPage();
  try {
    await savedPage.evaluateOnNewDocument(() => { Math.random = () => 7 / 0x7fffffff; });
    const problems = collectErrors(savedPage, { origin: server.url });
    await savedPage.goto(server.url + '?debug&speed=4', { waitUntil: 'domcontentloaded' });
    await waitForHook(savedPage);
    assert.equal(await activate(savedPage, '[data-act="play"]'), true);
    // A new player's first run starts with the tutorial; SKIP ends it and saves every tip.
    assert.equal(await waitInPage(savedPage, () => document.querySelector('.coach-card')?.dataset.tip === 'lanes', { timeout: 15_000 }), true, 'first run starts the tutorial');
    assert.equal(await activate(savedPage, '[data-ui="skip-tutorial"]'), true, 'skip button shows');
    assert.equal(await waitInPage(savedPage, () => document.querySelector('.coach-pill')?.classList.contains('hidden') && document.querySelector('.coach-card')?.classList.contains('hidden'), { timeout: 3000 }), true, 'skip hides the tutorial');
    assert.equal(await waitInPage(savedPage, () => window.__runshift?.screen() === 'results', { timeout: 30_000 }), true, 'ordinary run finishes');
    const saved = await savedPage.evaluate(() => window.__runshift.save());
    assert.equal(saved.totals.runs, 1, 'finished run banked');
    assert.equal(saved.tips.length, 6, 'skipped tutorial saved every tip');
    assert.ok(saved.gold > 0, 'gold banked');
    await savedPage.reload({ waitUntil: 'domcontentloaded' });
    await waitForHook(savedPage);
    assert.equal((await snapshot(savedPage)).screen, 'menu');
    assert.deepEqual(await savedPage.evaluate(() => window.__runshift.save()), saved, 'save survives reload');
    assert.equal(problems.errors.length, 0, problems.errors.join('; '));
    console.log(`save: ${saved.gold} gold and best ${saved.highScore} persisted after reload`);
  } finally {
    await savedPage.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
