/* Samsung start-up. Runs the launcher code this TV downloaded with Settings > TV > update, or
   opens the installed launcher (index.html) when there is none or it cannot be trusted.
   This file ships only inside the installed package and is never replaced by a download,
   so every failure here ends at the installed launcher. */
(function () {
  'use strict';
  var KEY = 'drentos.update.v1', build = window.DrentBuild || {}, state = null, bundle, html;
  function installed() { window.location.replace('index.html'); }
  function save() { window.localStorage.setItem(KEY, JSON.stringify(state)); }
  function has(files, name) { return Object.prototype.hasOwnProperty.call(files, name) && typeof files[name] === 'string'; }
  /* Remove a download that did not start, remember which one, and use the installed launcher. */
  function reject(reason) {
    try {
      state = JSON.parse(window.localStorage.getItem(KEY) || 'null') || {};
      if (state.active) state.failed = { commit: state.active.commit, shortCommit: state.active.shortCommit, reason: reason };
      state.active = null; state.previous = null;
      save();
    } catch (e) {}
    installed();
  }
  /* The downloaded page keeps its packaged scripts and assets by address; its own code goes inline. */
  function compose(files) {
    return files['index.html'].replace(/^[\s\S]*?<head[^>]*>/i, '')
      .replace(/<link rel="stylesheet" href="([^"]+)">/g, function (tag, name) {
        return has(files, name) ? '<style>' + files[name].replace(/<\/style/gi, '<\\/style') + '</style>' : tag;
      })
      .replace(/<script src="([^"]+)"><\/script>/g, function (tag, name) {
        return has(files, name) ? '<script>' + files[name].replace(/<\/script/gi, '<\\/script') + '</' + 'script>' : tag;
      });
  }
  try {
    state = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    bundle = state && state.active;
    if (!bundle || !bundle.files || !has(bundle.files, 'index.html')) { installed(); return; }
    /* A download belongs to the package it was made for. After a new install the package wins. */
    if (!build.id || bundle.base !== build.id) { state.active = null; state.previous = null; save(); installed(); return; }
    if (!bundle.confirmed) {
      if (bundle.tries >= 2) { reject('It did not start.'); return; }
      bundle.tries = (bundle.tries || 0) + 1;
      save();
    }
    html = compose(bundle.files);
    window.DrentBoot = { source: 'update', commit: bundle.commit, confirmed: !!bundle.confirmed };
    /* A first run must report that Home appeared (update.js: started). Otherwise fall back unasked. */
    if (!bundle.confirmed) setTimeout(function () {
      if (!window.DrentBoot.confirmed) reject('It did not start.');
    }, window.__DRENT_BOOT_WATCHDOG_MS || 30000);
    document.write(html);
  } catch (e) {
    installed();
  }
}());
