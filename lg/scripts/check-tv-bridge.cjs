'use strict';

var assert = require('assert');
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

// 2. Test tv-bridge.cjs HTTP endpoints
var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramon-tv-bridge-'));
var iconDir = path.join(tmpDir, 'netflix');
fs.mkdirSync(iconDir, { recursive: true });
var iconPath = path.join(iconDir, 'icon.png');
fs.writeFileSync(iconPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

var launches = [];

var inst = bridge.createTvBridge({
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

            inst.server.close(function () {
              fs.rmSync(tmpDir, { recursive: true, force: true });
              console.log('PASS: tv-bridge and stage-home unit checks');
            });
          });
        });
      });
    });
  });
});
