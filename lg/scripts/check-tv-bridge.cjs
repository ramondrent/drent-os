'use strict';

var assert = require('assert');
var cp = require('child_process');
var fs = require('fs');
var http = require('http');
var os = require('os');
var path = require('path');

var bridge = require('../service/tv-bridge.cjs');
var stageHome = require('../service/stage-home.cjs');

function httpRequest(port, method, reqPath, body, extraHeaders) {
  return new Promise(function (resolve, reject) {
    var payload = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    var headers = payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {};
    Object.keys(extraHeaders || {}).forEach(function (name) { headers[name] = extraHeaders[name]; });
    var req = http.request({ hostname: '127.0.0.1', port: port, path: reqPath, method: method, headers: headers }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var raw = Buffer.concat(chunks).toString('utf8');
        var json = null;
        try { json = JSON.parse(raw); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, raw: raw, json: json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}
function read(file) { return fs.readFileSync(file, 'utf8'); }
function mode(file) { return fs.statSync(file).mode & 0o777; }

// 1. Test stage-home.cjs manifest conversion
var sampleOrig = {
  id: 'com.webos.app.home',
  type: 'flutter',
  main: 'libhome.so',
  title: 'Home',
  version: '1.0.0',
  trustLevel: 'trusted',
  splashBackground: 'splash.png'
};
var staged = stageHome.stageManifest(sampleOrig);
assert.strictEqual(staged.id, 'com.webos.app.home');
assert.strictEqual(staged.type, 'web');
assert.strictEqual(staged.main, 'index.html');
assert.strictEqual(staged.bgColor, '#000000');
assert.strictEqual(staged.transparent, false);
assert.strictEqual(staged.splashBackground, undefined);

// 2. Test tv-bridge.cjs HTTP endpoints + self-update + rollback
var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drent-tv-bridge-'));
var iconDir = path.join(tmpDir, 'netflix');
var tvRoot = path.join(tmpDir, 'drent-os');
var archiveSrc = path.join(tmpDir, 'archive-build', 'drent-os-abcdef1234567890abcdef1234567890abcdef12', 'lg');
cp.execFileSync('/bin/sh', ['-c', 'mkdir -p "$1" "$2/app/assets/private-fonts" "$3/app/assets" "$3/service"', 'sh', iconDir, tvRoot, archiveSrc]);

var iconPath = path.join(iconDir, 'icon.png');
fs.writeFileSync(iconPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

// Initial installed TV state (with a private font that must survive updates)
fs.writeFileSync(path.join(tvRoot, 'app/index.html'), '<!doctype html><title>Old</title>');
fs.writeFileSync(path.join(tvRoot, 'app/main.js'), '// v1-old');
fs.writeFileSync(path.join(tvRoot, 'app/style.css'), 'body{}');
fs.writeFileSync(path.join(tvRoot, 'app/device.js'), '// dev-v1');
fs.writeFileSync(path.join(tvRoot, 'app/continue.js'), '// cont-v1');
fs.writeFileSync(path.join(tvRoot, 'app/assets/private-fonts/PP.woff2'), 'PRIVATE-FONT-BYTES');
fs.writeFileSync(path.join(tvRoot, 'app/assets/font-catalog.js'), 'window.CleanFramePrivateFontIDs=["mori"];');
fs.writeFileSync(path.join(tvRoot, 'stage-home.cjs'), '// old-stage');
// Installed service and boot scripts. reload-home.sh is absent and must not be created.
fs.writeFileSync(path.join(tvRoot, 'tv-bridge.cjs'), '// old-bridge');
fs.writeFileSync(path.join(tvRoot, 'start-home.sh'), '# old-start');
fs.chmodSync(path.join(tvRoot, 'start-home.sh'), 0o755);
fs.writeFileSync(path.join(tvRoot, 'undo-home.sh'), '# old-undo');
fs.chmodSync(path.join(tvRoot, 'undo-home.sh'), 0o755);
// The staged copy that Home loads; the stage stub below mirrors stage-home.sh.
fs.mkdirSync(path.join(tvRoot, 'home-overlay'));
fs.writeFileSync(path.join(tvRoot, 'home-overlay/index.html'), '<!doctype html><title>Old</title>');
fs.writeFileSync(path.join(tvRoot, 'version.json'), JSON.stringify({
  version: '0.6.1',
  commit: '1111111111111111111111111111111111111111',
  shortCommit: '1111111',
  summary: 'Initial install'
}));
fs.writeFileSync(path.join(tvRoot, 'update-config.json'), JSON.stringify({
  githubToken: 'test-token-123'
}));

// Build mock GitHub tarball containing v2
var targetSha = 'abcdef1234567890abcdef1234567890abcdef12';
fs.writeFileSync(path.join(archiveSrc, 'package.json'), JSON.stringify({ version: '0.6.2' }));
// v2 is the first launcher that loads the token script; the archive carries an empty one.
var emptyTokenScript = "window.DrentBridgeToken = window.DrentBridgeToken || '';\n";
fs.writeFileSync(path.join(archiveSrc, 'app/index.html'), '<!doctype html><title>New</title><script src="bridge-token.js"></script><script src="main.js"></script>');
fs.writeFileSync(path.join(archiveSrc, 'app/bridge-token.js'), emptyTokenScript);
fs.writeFileSync(path.join(archiveSrc, 'app/main.js'), '// v2-new');
fs.writeFileSync(path.join(archiveSrc, 'app/style.css'), 'body{color:#fff}');
fs.writeFileSync(path.join(archiveSrc, 'app/device.js'), '// dev-v2');
fs.writeFileSync(path.join(archiveSrc, 'app/continue.js'), '// cont-v2');
fs.writeFileSync(path.join(archiveSrc, 'app/assets/font-catalog.js'), 'window.CleanFramePrivateFontIDs=["geist"];');
fs.writeFileSync(path.join(archiveSrc, 'service/stage-home.cjs'), '// new-stage');
fs.writeFileSync(path.join(archiveSrc, 'service/tv-bridge.cjs'), '// new-bridge');
fs.writeFileSync(path.join(archiveSrc, 'service/start-home.sh'), '# new-start');
fs.writeFileSync(path.join(archiveSrc, 'service/reload-home.sh'), '# new-reload');
fs.writeFileSync(path.join(archiveSrc, 'service/undo-home.sh'), '# new-undo');

var tarFile = path.join(tmpDir, 'mock-github.tgz');
cp.execFileSync('/bin/sh', ['-c', 'tar -czf "$1" -C "$2" .', 'sh', tarFile, path.join(tmpDir, 'archive-build')]);
var tarBuffer = fs.readFileSync(tarFile);

// A native-Home TV (older webOS) that began from the upstream backend: the service also runs
// as helper.js, the boot scripts are the backend's, and undo-home.sh is a wrapper.
var nativeRoot = path.join(tmpDir, 'native-home');
cp.execFileSync('/bin/sh', ['-c', 'mkdir -p "$1/app" "$1/home-overlay"', 'sh', nativeRoot]);
var undoWrapper = '# native wrapper\nexec sh "$L/undo-home-upstream.sh" "$@"\n';
var backendReload = '# backend reload: closes the Home stand-in in webapp-mgr';
var backendMarker = '{"version":"1.5.4","minService":"1.6.8"}';
var officeDefaults = '/* office defaults */';
fs.writeFileSync(path.join(nativeRoot, 'app/index.html'), '<!doctype html><title>Old</title>');
['main.js', 'style.css', 'device.js', 'continue.js'].forEach(function (name) {
  fs.writeFileSync(path.join(nativeRoot, 'app', name), '// old');
});
fs.writeFileSync(path.join(nativeRoot, 'app/office-defaults.js'), officeDefaults);
fs.writeFileSync(path.join(nativeRoot, 'app/version.json'), backendMarker);
fs.writeFileSync(path.join(nativeRoot, 'home-overlay/index.html'), '<!doctype html><title>Old</title>');
fs.writeFileSync(path.join(nativeRoot, 'tv-bridge.cjs'), '// old-bridge');
fs.writeFileSync(path.join(nativeRoot, 'helper.js'), '// old-bridge');
fs.writeFileSync(path.join(nativeRoot, 'reload-home.sh'), backendReload);
fs.writeFileSync(path.join(nativeRoot, 'undo-home.sh'), undoWrapper);
fs.writeFileSync(path.join(nativeRoot, 'undo-home-upstream.sh'), '# preserved original');
fs.writeFileSync(path.join(nativeRoot, 'home-full-webos-native.sh'), '# fullhome forwarder');
fs.writeFileSync(path.join(nativeRoot, 'version.json'), JSON.stringify({ version: '0.6.1', commit: '2222222222222222222222222222222222222222', shortCommit: '2222222' }));
fs.writeFileSync(path.join(nativeRoot, 'update-config.json'), JSON.stringify({ githubToken: 'test-token-123' }));

var launches = [];
var stageCalls = 0;
var reloadCalls = 0;

function bridgeFor(root) { return bridge.createTvBridge({
  rootDir: root,
  stage: function () {
    stageCalls++;
    cp.execFileSync('/bin/sh', ['-c', 'cp -R "$1/app/." "$1/home-overlay/"', 'sh', root]);
    return Promise.resolve();
  },
  reload: function () { reloadCalls++; return Promise.resolve(); },
  fetchUrl: function (urlStr, headers, binary) {
    assert.strictEqual(headers && headers.Authorization, 'Bearer test-token-123');
    if (binary) {
      assert(urlStr.indexOf(targetSha) >= 0, 'Expected tarball URL for target SHA');
      return Promise.resolve(tarBuffer);
    }
    return Promise.resolve({
      sha: targetSha,
      commit: {
        message: 'Add on-TV self-updater\n\nDetailed body',
        committer: { date: '2026-10-30T14:00:00Z' }
      }
    });
  },
  luna: async function (uri, payload) {
    if (uri === 'luna://com.webos.applicationManager/listApps') {
      return {
        returnValue: true,
        apps: [
          {
            id: 'netflix',
            title: 'Netflix',
            folderPath: iconDir,
            icon: 'icon.png',
            visible: true,
            type: 'web'
          },
          {
            id: 'com.webos.app.home',
            title: 'Home',
            folderPath: tmpDir,
            icon: 'missing.png',
            visible: true,
            type: 'web'
          }
        ]
      };
    }
    if (uri === 'luna://com.webos.service.eim/getAllInputStatus') {
      return {
        returnValue: true,
        devices: [
          { appId: 'com.webos.app.hdmi1', port: 1, label: 'Apple TV', subList: [{ osdName: 'Apple TV' }] }
        ]
      };
    }
    if (uri === 'luna://com.webos.applicationManager/getForegroundAppInfo') {
      return { returnValue: true, appId: 'com.webos.app.hdmi1' };
    }
    if (uri === 'luna://com.webos.applicationManager/launch') {
      launches.push(payload);
      return { returnValue: true };
    }
    throw new Error('Unexpected URI: ' + uri);
  }
}); }
var inst = bridgeFor(tvRoot);
var nativeInst = bridgeFor(nativeRoot);

function listen() { return new Promise(function (resolve) { inst.server.listen(0, '127.0.0.1', resolve); }); }

(async function () {
  await listen();
  var port = inst.server.address().port;
  var res;

  // A. Launcher without the token script (as installed before this change): open routes work.
  res = await httpRequest(port, 'GET', '/api/apps');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.json.returnValue, true);
  assert.strictEqual(res.json.apps.length, 1);
  assert.strictEqual(res.json.apps[0].id, 'netflix');
  assert.strictEqual(res.headers['access-control-allow-origin'], 'null');

  res = await httpRequest(port, 'GET', '/icon/netflix');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers['content-type'], 'image/png');

  res = await httpRequest(port, 'GET', '/api/inputs');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.json.devices[0].appId, 'com.webos.app.hdmi1');

  res = await httpRequest(port, 'POST', '/api/launch', { id: 'com.webos.app.hdmi1' }, { Origin: 'null' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.json.returnValue, true);
  assert.strictEqual(launches[0].id, 'com.webos.app.hdmi1');

  res = await httpRequest(port, 'POST', '/api/launch', { id: '../bad' });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.json.returnValue, false);

  // B. Request guards that apply to every launcher: web pages cannot use the service.
  var launch = { id: 'com.webos.app.browser', params: { target: 'https://evil.example' } };
  res = await httpRequest(port, 'POST', '/api/launch', launch, { Origin: 'https://evil.example' });
  assert.strictEqual(res.status, 403, 'a website origin is refused');
  assert.strictEqual(res.headers['access-control-allow-origin'], undefined);
  res = await httpRequest(port, 'OPTIONS', '/api/launch', null, { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' });
  assert.strictEqual(res.status, 403, 'a website preflight is refused');
  res = await httpRequest(port, 'POST', '/api/launch', launch, { Host: 'attacker.example:' + port });
  assert.strictEqual(res.status, 403, 'a rebinding hostname is refused');
  res = await httpRequest(port, 'GET', '/api/apps', null, { Host: 'attacker.example' });
  assert.strictEqual(res.status, 403);
  res = await httpRequest(port, 'POST', '/api/launch', JSON.stringify(launch), { 'Content-Type': 'text/plain' });
  assert.strictEqual(res.status, 415, 'a form-style POST is refused');
  res = await httpRequest(port, 'POST', '/api/update', '{}', { 'Content-Type': 'text/plain' });
  assert.strictEqual(res.status, 415);
  res = await httpRequest(port, 'POST', '/api/update/rollback', null, { Origin: 'https://evil.example' });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(launches.length, 1, 'refused requests launch nothing');
  assert.strictEqual(stageCalls, 0, 'refused requests change nothing');
  res = await httpRequest(port, 'GET', '/api/apps', null, { Origin: 'file://', Host: 'localhost:' + port });
  assert.strictEqual(res.status, 200, 'a local file origin is accepted');

  // C. Update status and installation.
  res = await httpRequest(port, 'GET', '/api/update?check=1');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.json.returnValue, true);
  assert.strictEqual(res.json.installed.shortCommit, '1111111');
  assert.strictEqual(res.json.latest.shortCommit, 'abcdef1');
  assert.strictEqual(res.json.latest.summary, 'Add on-TV self-updater');
  assert.strictEqual(res.json.updateAvailable, true);
  assert.strictEqual(res.json.canRollback, false);

  res = await httpRequest(port, 'POST', '/api/update', {});
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.json.returnValue, true);
  assert.strictEqual(res.json.updated, true);
  assert.strictEqual(res.json.installed.version, '0.6.2');
  assert.strictEqual(res.json.installed.shortCommit, 'abcdef1');
  assert.strictEqual(res.json.updateAvailable, false);
  assert.strictEqual(res.json.canRollback, true);
  assert.strictEqual(stageCalls, 1);

  // New frontend installed, private fonts kept, previous frontend backed up.
  assert.strictEqual(read(path.join(tvRoot, 'app/main.js')), '// v2-new');
  assert.strictEqual(read(path.join(tvRoot, 'app/assets/private-fonts/PP.woff2')), 'PRIVATE-FONT-BYTES');
  assert.strictEqual(read(path.join(tvRoot, 'app/assets/font-catalog.js')), 'window.CleanFramePrivateFontIDs=["mori"];');
  assert.strictEqual(read(path.join(tvRoot, 'backup/app.prev/main.js')), '// v1-old');

  // Replaced service and boot scripts are backed up exactly; absent ones are not created.
  assert.strictEqual(read(path.join(tvRoot, 'stage-home.cjs')), '// new-stage');
  assert.strictEqual(read(path.join(tvRoot, 'tv-bridge.cjs')), '// new-bridge');
  assert.strictEqual(read(path.join(tvRoot, 'start-home.sh')), '# new-start');
  assert.strictEqual(mode(path.join(tvRoot, 'start-home.sh')), 0o755);
  assert.strictEqual(read(path.join(tvRoot, 'backup/service.prev/stage-home.cjs')), '// old-stage');
  assert.strictEqual(read(path.join(tvRoot, 'backup/service.prev/tv-bridge.cjs')), '// old-bridge');
  assert.strictEqual(read(path.join(tvRoot, 'backup/service.prev/start-home.sh')), '# old-start');
  assert.strictEqual(mode(path.join(tvRoot, 'backup/service.prev/start-home.sh')), 0o755);
  assert(!fs.existsSync(path.join(tvRoot, 'reload-home.sh')));
  assert(!fs.existsSync(path.join(tvRoot, 'backup/service.prev/reload-home.sh')));
  assert.strictEqual(read(path.join(tvRoot, 'undo-home.sh')), '# new-undo');
  assert.strictEqual(read(path.join(tvRoot, 'backup/service.prev/undo-home.sh')), '# old-undo');
  assert(!fs.existsSync(path.join(tvRoot, 'app/version.json')), 'no backend marker is invented');

  // D. The installed launcher now loads the token script, so the token is required.
  var token = read(path.join(tvRoot, 'bridge-token')).trim();
  assert(/^[0-9a-f]{48}$/.test(token));
  assert.strictEqual(mode(path.join(tvRoot, 'bridge-token')), 0o600);
  var tokenScript = 'window.DrentBridgeToken = "' + token + '";\n';
  assert.strictEqual(read(path.join(tvRoot, 'app/bridge-token.js')), tokenScript, 'the archive placeholder is replaced before staging');
  assert.strictEqual(read(path.join(tvRoot, 'home-overlay/bridge-token.js')), tokenScript);
  assert.strictEqual(mode(path.join(tvRoot, 'home-overlay/bridge-token.js')), 0o644);
  var auth = '?t=' + token;

  // A stale staged script is rewritten when a request is rejected, so the launcher can reload it.
  fs.writeFileSync(path.join(tvRoot, 'home-overlay/bridge-token.js'), emptyTokenScript);
  res = await httpRequest(port, 'GET', '/api/apps', null, { Origin: 'null' });
  assert.strictEqual(res.status, 403, 'a sandboxed frame has the null origin but no token');
  assert.strictEqual(res.json.code, 'bridge-token');
  assert.strictEqual(res.headers['access-control-allow-origin'], 'null', 'the launcher can read the rejection');
  assert.strictEqual(read(path.join(tvRoot, 'home-overlay/bridge-token.js')), tokenScript);
  res = await httpRequest(port, 'GET', '/api/apps?t=' + token.replace(/./g, '0'));
  assert.strictEqual(res.status, 403);
  res = await httpRequest(port, 'POST', '/api/launch', launch, { Origin: 'null' });
  assert.strictEqual(res.status, 403);
  res = await httpRequest(port, 'POST', '/api/update', {}, { Origin: 'null' });
  assert.strictEqual(res.status, 403);
  res = await httpRequest(port, 'POST', '/api/update/rollback', {}, { Origin: 'null' });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(launches.length, 1);
  assert.strictEqual(stageCalls, 1);
  res = await httpRequest(port, 'GET', '/api/apps' + auth);
  assert.strictEqual(res.status, 200);
  res = await httpRequest(port, 'GET', '/api/update' + auth + '&check=1');
  assert.strictEqual(res.status, 200);
  res = await httpRequest(port, 'POST', '/api/launch' + auth, { id: 'netflix' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(launches[1].id, 'netflix');
  res = await httpRequest(port, 'GET', '/icon/netflix');
  assert.strictEqual(res.status, 200, 'icons load from <img> without the token');
  // Recovery switch for the owner.
  fs.writeFileSync(path.join(tvRoot, 'DISABLE_BRIDGE_AUTH'), '');
  res = await httpRequest(port, 'GET', '/api/apps');
  assert.strictEqual(res.status, 200);
  fs.unlinkSync(path.join(tvRoot, 'DISABLE_BRIDGE_AUTH'));
  res = await httpRequest(port, 'GET', '/api/apps');
  assert.strictEqual(res.status, 403);

  // E. Rollback restores the previous frontend and the service scripts that came with it.
  res = await httpRequest(port, 'POST', '/api/update/rollback' + auth, {});
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.json.returnValue, true);
  assert.strictEqual(res.json.rolledBack, true);
  assert.strictEqual(res.json.installed.shortCommit, '1111111');
  assert.strictEqual(res.json.updateAvailable, true);
  assert.strictEqual(res.json.canRollback, false);
  assert.strictEqual(stageCalls, 2);
  assert.strictEqual(read(path.join(tvRoot, 'app/main.js')), '// v1-old');
  assert.strictEqual(read(path.join(tvRoot, 'stage-home.cjs')), '// old-stage');
  assert.strictEqual(read(path.join(tvRoot, 'tv-bridge.cjs')), '// old-bridge');
  assert.strictEqual(read(path.join(tvRoot, 'start-home.sh')), '# old-start');
  assert.strictEqual(mode(path.join(tvRoot, 'start-home.sh')), 0o755);
  assert(!fs.existsSync(path.join(tvRoot, 'reload-home.sh')));
  assert(!fs.existsSync(path.join(tvRoot, 'backup/service.prev')));
  assert.strictEqual(read(path.join(tvRoot, 'undo-home.sh')), '# old-undo');
  assert.strictEqual(mode(path.join(tvRoot, 'undo-home.sh')), 0o755);

  // The restored launcher predates the token: it must keep working with this service.
  res = await httpRequest(port, 'GET', '/api/apps');
  assert.strictEqual(res.status, 200, 'an older launcher is never locked out');
  res = await httpRequest(port, 'POST', '/api/launch', launch, { Origin: 'https://evil.example' });
  assert.strictEqual(res.status, 403);

  await new Promise(function (resolve) { inst.server.close(resolve); });

  // F. A native-Home TV keeps the backend's boot scripts and its local frontend files.
  await new Promise(function (resolve) { nativeInst.server.listen(0, '127.0.0.1', resolve); });
  port = nativeInst.server.address().port;
  stageCalls = 0;
  res = await httpRequest(port, 'POST', '/api/update', {});
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.json.updated, true);
  assert.strictEqual(stageCalls, 1);
  assert.strictEqual(read(path.join(nativeRoot, 'app/main.js')), '// v2-new');
  assert.strictEqual(read(path.join(nativeRoot, 'tv-bridge.cjs')), '// new-bridge');
  assert.strictEqual(read(path.join(nativeRoot, 'helper.js')), '// new-bridge', 'the service file the boot script starts is updated too');
  assert.strictEqual(read(path.join(nativeRoot, 'backup/service.prev/helper.js')), '// old-bridge');
  assert.strictEqual(read(path.join(nativeRoot, 'reload-home.sh')), backendReload, 'the stand-in aware reload script is kept');
  assert.strictEqual(read(path.join(nativeRoot, 'undo-home.sh')), undoWrapper);
  assert.strictEqual(read(path.join(nativeRoot, 'undo-home-upstream.sh')), '# preserved original');
  assert(!fs.existsSync(path.join(nativeRoot, 'start-home.sh')));
  ['start-home.sh', 'reload-home.sh', 'undo-home.sh'].forEach(function (name) {
    assert(!fs.existsSync(path.join(nativeRoot, 'backup/service.prev', name)), name + ' was not replaced, so it is not backed up');
  });
  assert.strictEqual(read(path.join(nativeRoot, 'app/version.json')), backendMarker, 'the backend frontend marker survives');
  assert.strictEqual(read(path.join(nativeRoot, 'app/office-defaults.js')), officeDefaults);
  var nativeIndex = read(path.join(nativeRoot, 'app/index.html'));
  assert(nativeIndex.indexOf('<script src="office-defaults.js"></script>\n<script src="main.js"></script>') >= 0);
  assert.strictEqual(read(path.join(nativeRoot, 'home-overlay/index.html')), nativeIndex);
  var nativeToken = read(path.join(nativeRoot, 'bridge-token')).trim();
  assert.strictEqual(read(path.join(nativeRoot, 'home-overlay/bridge-token.js')), 'window.DrentBridgeToken = "' + nativeToken + '";\n');
  res = await httpRequest(port, 'POST', '/api/update/rollback?t=' + nativeToken, {});
  assert.strictEqual(res.status, 200);
  assert.strictEqual(read(path.join(nativeRoot, 'app/main.js')), '// old');
  assert.strictEqual(read(path.join(nativeRoot, 'helper.js')), '// old-bridge');
  assert.strictEqual(read(path.join(nativeRoot, 'reload-home.sh')), backendReload);
  assert.strictEqual(read(path.join(nativeRoot, 'undo-home.sh')), undoWrapper);
  assert.strictEqual(read(path.join(nativeRoot, 'app/version.json')), backendMarker);
  await new Promise(function (resolve) { nativeInst.server.close(resolve); });

  cp.execFileSync('/bin/sh', ['-c', 'rm -rf "$1"', 'sh', tmpDir]);
  console.log('PASS: tv-bridge request guards, launcher token, self-update, service backup, native-Home boot scripts, rollback and stage-home unit checks');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
