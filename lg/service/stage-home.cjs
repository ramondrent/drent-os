#!/usr/bin/env node
/* Prepare home-overlay/appinfo.json from the TV's stock Home manifest. Node 8.12+. */
'use strict';
var fs = require('fs');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function stageManifest(stockObj) {
  var h = Object.assign({}, stockObj || {});
  if (h.type !== 'web' && h.type !== 'flutter') {
    ['nativeLifeCycleInterfaceVersion', 'containerBasedApp', 'supportQuickStart', 'windowGroup', 'qmlIncludePath', 'qtModules'].forEach(function (k) {
      delete h[k];
    });
  }
  h.id = h.id || 'com.webos.app.home';
  h.type = 'web';
  h.main = 'index.html';
  delete h.splashBackground;
  delete h.noSplashOnLaunch;
  h.bgColor = '#000000';
  h.transparent = false;
  return h;
}

module.exports = { stageManifest: stageManifest };

if (require.main === module) {
  var args = process.argv.slice(2);
  var src = args[0];
  var out = args[1];
  if (!src || !out) {
    console.error('Usage: stage-home.cjs <stock-appinfo.json> <output-appinfo.json>');
    process.exit(2);
  }
  var staged = stageManifest(readJson(src, {}));
  fs.writeFileSync(out, JSON.stringify(staged, null, 1));
}
