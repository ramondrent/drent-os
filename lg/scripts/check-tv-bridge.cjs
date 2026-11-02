'use strict';

var assert = require('assert');
var cp = require('child_process');
var fs = require('fs');
var http = require('http');
var os = require('os');
var path = require('path');

var bridge = require('../service/tv-bridge.cjs');
var stageHome = require('../service/stage-home.cjs');

function httpRequest(port, method, reqPath, body, done) {
  var payload = body ? JSON.stringify(body) : null;
  var req = http.request({
    hostname: '127.0.0.1',
    port: port,
    path: reqPath,
    method: method,
    headers: payload ? {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    } : {}
  }, function (res) {
    var chunks = [];
    res.on('data', function (c) { chunks.push(c); });
    res.on('end', function () {
      var raw = Buffer.concat(chunks).toString('utf8');
      var json = null;
      try { json = JSON.parse(raw); } catch (e) {}
      done(null, { status: res.statusCode, headers: res.headers, raw: raw, json: json });
    });
  });
  req.on('error', done);
  if (payload) req.write(payload);
  req.end();
}

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
fs.writeFileSync(path.join(archiveSrc, 'app/index.html'), '<!doctype html><title>New</title>');
fs.writeFileSync(path.join(archiveSrc, 'app/main.js'), '// v2-new');
fs.writeFileSync(path.join(archiveSrc, 'app/style.css'), 'body{color:#fff}');
fs.writeFileSync(path.join(archiveSrc, 'app/device.js'), '// dev-v2');
fs.writeFileSync(path.join(archiveSrc, 'app/continue.js'), '// cont-v2');
fs.writeFileSync(path.join(archiveSrc, 'app/assets/font-catalog.js'), 'window.CleanFramePrivateFontIDs=["geist"];');
fs.writeFileSync(path.join(archiveSrc, 'service/stage-home.cjs'), '// new-stage');

var tarFile = path.join(tmpDir, 'mock-github.tgz');
cp.execFileSync('/bin/sh', ['-c', 'tar -czf "$1" -C "$2" .', 'sh', tarFile, path.join(tmpDir, 'archive-build')]);
var tarBuffer = fs.readFileSync(tarFile);

var launches = [];
var stageCalls = 0;
var reloadCalls = 0;

var inst = bridge.createTvBridge({
  rootDir: tvRoot,
  stage: function () { stageCalls++; return Promise.resolve(); },
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
});

inst.server.listen(0, '127.0.0.1', function () {
  var port = inst.server.address().port;

  httpRequest(port, 'GET', '/api/apps', null, function (err, res) {
    assert.ifError(err);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.returnValue, true);
    assert.strictEqual(res.json.apps.length, 1);
    assert.strictEqual(res.json.apps[0].id, 'netflix');

    httpRequest(port, 'GET', '/icon/netflix', null, function (err2, res2) {
      assert.ifError(err2);
      assert.strictEqual(res2.status, 200);
      assert.strictEqual(res2.headers['content-type'], 'image/png');

      httpRequest(port, 'GET', '/api/inputs', null, function (err3, res3) {
        assert.ifError(err3);
        assert.strictEqual(res3.status, 200);
        assert.strictEqual(res3.json.devices[0].appId, 'com.webos.app.hdmi1');

        httpRequest(port, 'POST', '/api/launch', { id: 'com.webos.app.hdmi1' }, function (err4, res4) {
          assert.ifError(err4);
          assert.strictEqual(res4.status, 200);
          assert.strictEqual(res4.json.returnValue, true);
          assert.strictEqual(launches[0].id, 'com.webos.app.hdmi1');

          httpRequest(port, 'POST', '/api/launch', { id: '../bad' }, function (err5, res5) {
            assert.ifError(err5);
            assert.strictEqual(res5.status, 400);
            assert.strictEqual(res5.json.returnValue, false);

            // Check update status with remote check
            httpRequest(port, 'GET', '/api/update?check=1', null, function (err6, res6) {
              assert.ifError(err6);
              assert.strictEqual(res6.status, 200);
              assert.strictEqual(res6.json.returnValue, true);
              assert.strictEqual(res6.json.installed.shortCommit, '1111111');
              assert.strictEqual(res6.json.latest.shortCommit, 'abcdef1');
              assert.strictEqual(res6.json.latest.summary, 'Add on-TV self-updater');
              assert.strictEqual(res6.json.updateAvailable, true);
              assert.strictEqual(res6.json.canRollback, false);

              // Apply update
              httpRequest(port, 'POST', '/api/update', {}, function (err7, res7) {
                assert.ifError(err7);
                assert.strictEqual(res7.status, 200);
                assert.strictEqual(res7.json.returnValue, true);
                assert.strictEqual(res7.json.updated, true);
                assert.strictEqual(res7.json.installed.version, '0.6.2');
                assert.strictEqual(res7.json.installed.shortCommit, 'abcdef1');
                assert.strictEqual(res7.json.updateAvailable, false);
                assert.strictEqual(res7.json.canRollback, true);
                assert.strictEqual(stageCalls, 1);

                // Verify new main.js is installed, private fonts survived, and backup/app.prev was kept
                assert.strictEqual(fs.readFileSync(path.join(tvRoot, 'app/main.js'), 'utf8'), '// v2-new');
                assert.strictEqual(fs.readFileSync(path.join(tvRoot, 'app/assets/private-fonts/PP.woff2'), 'utf8'), 'PRIVATE-FONT-BYTES');
                assert.strictEqual(fs.readFileSync(path.join(tvRoot, 'app/assets/font-catalog.js'), 'utf8'), 'window.CleanFramePrivateFontIDs=["mori"];');
                assert.strictEqual(fs.readFileSync(path.join(tvRoot, 'backup/app.prev/main.js'), 'utf8'), '// v1-old');
                assert.strictEqual(fs.readFileSync(path.join(tvRoot, 'stage-home.cjs'), 'utf8'), '// new-stage');

                // Rollback to previous version
                httpRequest(port, 'POST', '/api/update/rollback', {}, function (err8, res8) {
                  assert.ifError(err8);
                  assert.strictEqual(res8.status, 200);
                  assert.strictEqual(res8.json.returnValue, true);
                  assert.strictEqual(res8.json.rolledBack, true);
                  assert.strictEqual(res8.json.installed.shortCommit, '1111111');
                  assert.strictEqual(res8.json.updateAvailable, true);
                  assert.strictEqual(res8.json.canRollback, false);
                  assert.strictEqual(stageCalls, 2);
                  assert.strictEqual(fs.readFileSync(path.join(tvRoot, 'app/main.js'), 'utf8'), '// v1-old');

                  inst.server.close(function () {
                    cp.execFileSync('/bin/sh', ['-c', 'rm -rf "$1"', 'sh', tmpDir]);
                    console.log('PASS: tv-bridge, self-update, rollback and stage-home unit checks');
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});
