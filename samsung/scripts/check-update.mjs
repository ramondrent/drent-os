// On-TV updates: check, install, start-up from the download, revert, and every refusal.
// GitHub is mocked; the versions it serves are this checkout's own files with small edits.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openPreview, root } from './browser.mjs';

const KEY = 'drentos.update.v1';
const app = name => readFileSync(root + 'app/' + name, 'utf8');
const local = JSON.parse(app('update-manifest.js').replace(/^[^{]*/, '').replace(/;\s*$/, ''));
// The same fingerprint as tools/build-apps.py and app/update.js.
function fingerprint(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return [text.length, h.toString(16).padStart(8, '0')];
}
for (const name of Object.keys(local.files)) assert.deepEqual(fingerprint(app(name)), local.files[name], 'build manifest fingerprint: ' + name);

const sha = letter => letter.repeat(40);
// One version on "GitHub": local files plus edits. `served` can differ from what the manifest promises.
function version(letter, { edits = {}, assets = local.assets, served = {}, summary = 'Version ' + letter } = {}) {
  const files = {}, described = {};
  for (const name of Object.keys(local.files)) { files[name] = name in edits ? edits[name](app(name)) : app(name); described[name] = fingerprint(files[name]); }
  const manifest = { format: 1, version: local.version, code: 'code-' + (Object.keys(edits).length ? letter : 'local'), assets, files: described };
  if (!Object.keys(edits).length) manifest.code = local.code;
  return { commit: sha(letter), summary, manifest, files: Object.assign({}, files, served) };
}
const mark = value => text => text + '\nwindow.__UPDATED = ' + JSON.stringify(value) + ';\n';
const versions = {
  same: version('0'),
  one: version('a', { edits: { 'main.js': mark('one') } }),
  two: version('b', { edits: { 'main.js': mark('two'), 'style.css': css => css + '\n.update-probe{color:red}\n' } }),
  assets: version('c', { edits: { 'main.js': mark('assets') }, assets: 'different-assets' }),
  corrupt: version('d', { edits: { 'main.js': mark('corrupt') }, served: { 'main.js': 'window.__UPDATED = "truncated"' } }),
  broken: version('e', { edits: { 'main.js': () => 'this is not ( javascript' } }),
  legacy: Object.assign(version('f', { edits: { 'main.js': mark('legacy') } }), { manifest: null })
};

const preview = await openPreview({ publicFonts: true });
const cors = { 'Access-Control-Allow-Origin': '*' };
async function open({ tizen = true, head = 'same', storage = null, buildId = null } = {}) {
  const context = await preview.browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage(), errors = [], session = { page, errors, head, requests: [] };
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ tizen, storage, KEY }) => {
    window.__DRENT_BOOT_WATCHDOG_MS = 1500;
    window.launches = [];
    if (tizen) window.tizen = { application: {
      getAppsInfo(ok) { ok([{ id: 'kIciSQlYEM.plex', name: 'Plex', show: true }, { id: '9Ur5IzDKqV.TizenYouTube', name: 'YouTube', show: true }]); },
      launch(id, ok) { window.launches.push(id); ok(); }
    } };
    if (storage && !sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(KEY, JSON.stringify(storage)); }
  }, { tizen, storage, KEY });
  if (buildId) await page.route('**/home/build-info.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.DrentBuild = ' + JSON.stringify({ id: buildId, commit: null }) + ';' }));
  await page.route('https://api.github.com/**', route => {
    session.requests.push(route.request().url());
    const v = versions[session.head];
    return route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify({ sha: v.commit, commit: { message: v.summary + '\n\nBody' } }) });
  });
  await page.route('https://raw.githubusercontent.com/**', route => {
    const match = new URL(route.request().url()).pathname.match(/^\/ramondrent\/drent-os\/([0-9a-f]{40})\/samsung\/app\/(.+)$/);
    const v = match && Object.values(versions).find(candidate => candidate.commit === match[1]);
    session.requests.push(route.request().url());
    if (!v) return route.fulfill({ status: 404, headers: cors, body: 'Not Found' });
    if (match[2] === 'update-manifest.js' && !v.manifest) return route.fulfill({ status: 404, headers: cors, body: 'Not Found' });
    if (match[2] === 'update-manifest.js') return route.fulfill({ contentType: 'text/plain', headers: cors, body: '/* built */\nwindow.DrentUpdateManifest = ' + JSON.stringify(v.manifest) + ';\n' });
    if (!(match[2] in v.files)) return route.fulfill({ status: 404, headers: cors, body: 'Not Found' });
    return route.fulfill({ contentType: 'text/plain', headers: cors, body: v.files[match[2]] });
  });
  session.ready = () => page.waitForFunction(() => window.ShoreQA && ShoreQA.ready());
  session.stored = () => page.evaluate(KEY => JSON.parse(localStorage.getItem(KEY) || 'null'), KEY);
  session.update = () => page.evaluate(() => ShoreQA.state().update);
  // Opening Settings > TV checks GitHub; wait for that check to settle.
  session.openTv = async () => {
    await page.evaluate(() => { ShoreQA.scene('settings'); ShoreQA.activate('settings.group.samsung'); });
    await page.waitForFunction(() => { const u = ShoreQA.state().update; return u && !u.checking && (u.latest || u.error); });
  };
  session.labels = () => page.locator('.appearance .setting-choice .setting-name').allInnerTexts();
  // Installing ends with the launcher restarting itself; wait for the page that replaces this one.
  session.install = async () => {
    await page.evaluate(() => { window.__beforeRestart = true; });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !window.__beforeRestart && /\/home\/boot\.html$/.test(location.pathname) && window.ShoreQA && ShoreQA.ready());
  };
  session.close = () => context.close();
  await page.goto(preview.baseURL + '/home/boot.html');
  await page.waitForURL(/\/home\/(index|boot)\.html$/);
  await session.ready();
  return session;
}
const at = (session, file) => assert.match(session.page.url(), new RegExp('/home/' + file + '\\.html$'));

try {
  // Nothing downloaded: start-up opens the installed launcher, and the TV page offers a check.
  let s = await open();
  at(s, 'index');
  assert.equal(await s.stored(), null);
  await s.openTv();
  assert.equal(await s.page.evaluate(() => ShoreQA.where().focusAction), 'samsung.update');
  assert.deepEqual(await s.labels(), ['Check for updates', 'Samsung Home', 'TV settings']);
  assert.equal((await s.update()).updateAvailable, false);
  assert.equal((await s.update()).canRollback, false);
  assert.equal(await s.page.locator('.appearance.has-updater').count(), 1);
  assert.deepEqual(s.errors, []);

  // A code-only version: offered, downloaded, verified, and running after the launcher restarts itself.
  s.head = 'one';
  await s.page.keyboard.press('Enter');
  await s.page.waitForFunction(() => ShoreQA.state().update.updateAvailable === true);
  assert.equal((await s.labels())[0], 'Install update (aaaaaaa)');
  await s.install();
  at(s, 'boot');
  assert.equal(await s.page.evaluate(() => window.__UPDATED), 'one');
  assert.equal(await s.page.evaluate(() => window.DrentBoot.source), 'update');
  await s.page.waitForFunction(KEY => JSON.parse(localStorage.getItem(KEY)).active.confirmed === true, KEY);
  let stored = await s.stored();
  assert.equal(stored.active.commit, sha('a'));
  assert.equal(stored.active.tries, 0);
  assert.equal(stored.previous, null);
  assert.deepEqual(Object.keys(stored.active.files).sort(), Object.keys(local.files).sort());
  // The downloaded launcher still uses the package's own assets, config and device calls.
  assert.equal(await s.page.locator('.dock .tile').count(), 4);
  assert.equal(await s.page.locator('.dock .app-artwork img').evaluateAll(list => list.filter(img => img.complete && img.naturalWidth > 0).length), 4);
  assert.equal(await s.page.evaluate(() => typeof window.DrentConfig), 'object');
  await s.page.keyboard.press('Enter');
  await s.page.waitForFunction(() => window.launches.length === 1);
  assert.deepEqual(s.errors, []);
  await s.openTv();
  assert.equal((await s.update()).installed.shortCommit, 'aaaaaaa');
  assert.equal((await s.update()).updateAvailable, false);
  assert.deepEqual(await s.labels(), ['Check for updates', 'Revert to previous version', 'Samsung Home', 'TV settings']);

  // A second version keeps the first as the one to revert to; reverting twice ends at the installed package.
  s.head = 'two';
  await s.page.keyboard.press('Enter');
  await s.page.waitForFunction(() => ShoreQA.state().update.updateAvailable === true);
  await s.install();
  assert.equal(await s.page.evaluate(() => window.__UPDATED), 'two');
  assert.equal(await s.page.evaluate(() => Array.prototype.some.call(document.querySelectorAll('style'), el => el.textContent.indexOf('.update-probe') >= 0)), true);
  assert.equal((await s.stored()).previous.commit, sha('a'));
  await s.openTv();
  await s.page.keyboard.press('ArrowDown');
  assert.equal(await s.page.evaluate(() => ShoreQA.where().focusAction), 'samsung.rollback');
  await s.page.keyboard.press('Enter');
  await s.page.waitForFunction(() => window.__UPDATED === 'one' && window.ShoreQA && ShoreQA.ready());
  at(s, 'boot');
  assert.equal((await s.stored()).previous, null);
  await s.openTv();
  await s.page.keyboard.press('ArrowDown');
  await s.page.keyboard.press('Enter');
  await s.page.waitForURL(/\/home\/index\.html$/);
  await s.ready();
  assert.equal(await s.page.evaluate(() => window.__UPDATED), undefined);
  assert.equal((await s.stored()).active, null);
  assert.deepEqual(s.errors, []);
  await s.close();

  // A version that changes packaged files is named, not offered, and cannot be forced.
  s = await open({ head: 'assets' });
  await s.openTv();
  let update = await s.update();
  assert.equal(update.updateAvailable, false);
  assert.match(update.error, /Version ccccccc changes images, fonts or app settings\. Install it from the computer\./);
  assert.equal((await s.labels())[0], 'Check for updates');
  let refused = await s.page.evaluate(() => new Promise(resolve => FrameDevice.applyUpdate((err, data) => resolve({ err, data }))));
  assert.match(refused.err.message, /Install it from the computer/);
  assert.equal(await s.stored(), null);

  // A download that does not match its fingerprint is discarded.
  s.head = 'corrupt';
  refused = await s.page.evaluate(() => new Promise(resolve => FrameDevice.applyUpdate((err, data) => resolve({ err, data }))));
  assert.equal(refused.err.message, 'The download was incomplete. Try again.');
  assert.equal(await s.stored(), null);
  at(s, 'index');

  // A version from before on-TV updates existed has no manifest and is not offered.
  s.head = 'legacy';
  await s.openTv();
  await s.page.keyboard.press('Enter');
  await s.page.waitForFunction(() => { const u = ShoreQA.state().update; return !u.checking && u.latest && u.latest.shortCommit === 'fffffff'; });
  assert.equal((await s.update()).error, 'This version cannot be installed from the TV.');
  assert.equal((await s.update()).updateAvailable, false);
  await s.close();

  // A version whose code does not start is removed on its own and not offered again.
  s = await open({ head: 'broken' });
  await s.openTv();
  assert.equal((await s.labels())[0], 'Install update (eeeeeee)');
  await s.page.keyboard.press('Enter');
  await s.page.waitForURL(/\/home\/boot\.html$/);
  await s.page.waitForURL(/\/home\/index\.html$/, { timeout: 10000 });
  await s.ready();
  stored = await s.stored();
  assert.equal(stored.active, null);
  assert.equal(stored.failed.commit, sha('e'));
  await s.openTv();
  update = await s.update();
  assert.equal(update.updateAvailable, false);
  assert.match(update.error, /Version eeeeeee did not start on this TV and was removed\./);
  assert.equal((await s.labels())[0], 'Check for updates');
  await s.close();

  // A download made for another package (the app was reinstalled since) is dropped at start-up.
  const bundle = { commit: sha('a'), shortCommit: 'aaaaaaa', version: local.version, code: 'code-a', base: 'source', tries: 0, confirmed: true, files: versions.one.files };
  s = await open({ storage: { active: bundle, previous: null, failed: null }, buildId: 'reinstalled-package' });
  at(s, 'index');
  assert.equal(await s.page.evaluate(() => window.__UPDATED), undefined);
  assert.equal((await s.stored()).active, null);
  await s.close();

  // The same download starts normally on the package it was made for.
  s = await open({ storage: { active: bundle, previous: null, failed: null } });
  at(s, 'boot');
  assert.equal(await s.page.evaluate(() => window.__UPDATED), 'one');
  await s.close();

  // Two unconfirmed starts are the limit, also when the page never got far enough to time out.
  s = await open({ storage: { active: Object.assign({}, bundle, { tries: 2, confirmed: false }), previous: null, failed: null } });
  at(s, 'index');
  assert.equal((await s.stored()).failed.commit, sha('a'));
  await s.close();

  // Unreadable storage contents never block start-up.
  s = await open({ storage: 'not an update record' });
  at(s, 'index');
  await s.close();

  // Without the TV's own APIs (a browser preview) there is nothing to update and no update section.
  s = await open({ tizen: false });
  await s.page.evaluate(() => { ShoreQA.scene('settings'); ShoreQA.activate('settings.group.samsung'); });
  assert.equal(await s.page.evaluate(() => ShoreQA.where().focusAction), 'samsung.home');
  assert.deepEqual(await s.labels(), ['Samsung Home', 'TV settings']);
  assert.equal(await s.page.evaluate(() => 'update' in ShoreQA.state()), false);
  assert.deepEqual(s.requests, []);
  await s.close();

  console.log('PASS: update check, install, start from download, revert, asset/corrupt/legacy/broken refusals, reinstall reset, start-up limits, preview without updater');
} finally {
  await preview.close();
}
