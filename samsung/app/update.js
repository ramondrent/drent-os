/* Samsung on-TV updates. A signed Tizen package cannot replace itself, so this downloads the
   launcher's code from the public repository into this app's own storage; boot.js runs it at
   the next start. Images, fonts and the manifest stay in the package: an update that changes
   them is refused and needs a full install. Nothing here touches Home/startup settings. */
(function () {
  'use strict';
  var KEY = 'drentos.update.v1', APP = 'samsung/app/';
  var config = (window.DrentConfig || window.RamonConfig || {}).update || {};
  var repo = /^[\w.-]+\/[\w.-]+$/.test(config.repo || '') ? config.repo : 'ramondrent/drent-os';
  var branch = /^[\w./-]+$/.test(config.branch || '') ? config.branch : 'main';
  var build = window.DrentBuild || {}, local = window.DrentUpdateManifest || null;
  var latest = null, available = false, busy = false, confirmTimer = null;

  function own(table, key) { return !!table && Object.prototype.hasOwnProperty.call(table, key); }
  function read() {
    try { return JSON.parse(window.localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; }
  }
  function write(state) { window.localStorage.setItem(KEY, JSON.stringify(state)); }
  function storageWorks() {
    try { window.localStorage.setItem(KEY + '.probe', '1'); window.localStorage.removeItem(KEY + '.probe'); return true; } catch (e) { return false; }
  }
  /* The download in use, if it was made for the package that is installed now. */
  function active(state) {
    var bundle = (state || read()).active;
    return bundle && bundle.base === build.id && bundle.files ? bundle : null;
  }
  function describe(bundle) {
    if (bundle) return { version: bundle.version, commit: bundle.commit, shortCommit: bundle.shortCommit, code: bundle.code };
    /* A package built from uncommitted work has no commit of its own; name it by its code. */
    return { version: local.version, commit: build.commit || 'local-' + local.code, shortCommit: build.commit ? build.commit.slice(0, 7) : 'local build', code: local.code };
  }
  function installed() { var info = describe(active()); return { version: info.version, commit: info.commit, shortCommit: info.shortCommit }; }
  function problem(message, detail) { return { message: message, detail: detail || message }; }
  /* Same fingerprint as tools/build-apps.py: FNV-1a over UTF-16 code units. */
  function fingerprint(text) {
    var h = 0x811c9dc5, i;
    for (i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  function get(url, done) {
    var x = new XMLHttpRequest(), finished = false;
    function finish(err, text) { if (!finished) { finished = true; done(err, text); } }
    x.open('GET', url, true); x.timeout = 20000;
    x.onload = function () {
      if (x.status === 403 || x.status === 429) finish(problem('GitHub is limiting requests from this network. Try again later.'));
      else if (x.status < 200 || x.status >= 300) finish({ message: 'GitHub did not provide the update (' + x.status + ').', detail: String(x.status), missing: x.status === 404 });
      else finish(null, x.responseText);
    };
    x.onerror = function () { finish(problem('Could not reach GitHub. Check the TV’s network.')); };
    x.ontimeout = function () { finish(problem('GitHub did not respond. Try again.')); };
    x.send();
  }
  function file(commit, name, done) { get('https://raw.githubusercontent.com/' + repo + '/' + commit + '/' + APP + name, done); }
  function latestCommit(done) {
    get('https://api.github.com/repos/' + repo + '/commits/' + encodeURIComponent(branch), function (err, text) {
      var data, sha, message;
      if (err) { done(err); return; }
      try { data = JSON.parse(text); } catch (e) { data = null; }
      sha = data && typeof data.sha === 'string' ? data.sha : '';
      if (!/^[0-9a-f]{40}$/.test(sha)) { done(problem('GitHub returned an unexpected answer.')); return; }
      message = data.commit && typeof data.commit.message === 'string' ? data.commit.message : '';
      done(null, { commit: sha, shortCommit: sha.slice(0, 7), summary: message.split(/\r?\n/)[0].slice(0, 140) || 'Latest version' });
    });
  }
  /* The manifest of a version says which files are code and what each must look like. */
  function manifestOf(commit, done) {
    file(commit, 'update-manifest.js', function (err, text) {
      var manifest = null, names, i, entry;
      if (err) { done(err.missing ? problem('This version cannot be installed from the TV.') : err); return; }
      try { manifest = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch (e) {}
      if (!manifest || manifest.format !== 1 || typeof manifest.code !== 'string' || typeof manifest.assets !== 'string' || !manifest.files || !own(manifest.files, 'index.html')) {
        done(problem('This version cannot be installed from the TV.')); return;
      }
      names = Object.keys(manifest.files);
      for (i = 0; i < names.length; i++) {
        entry = manifest.files[names[i]];
        if (!/^[\w.-]+$/.test(names[i]) || !entry || typeof entry[0] !== 'number' || typeof entry[1] !== 'string') { done(problem('This version cannot be installed from the TV.')); return; }
      }
      done(null, manifest);
    });
  }
  /* Compare a version with what this TV runs and with what its package can support. */
  function assess(found, manifest, state) {
    var current = describe(active(state)), failed = state.failed;
    if (manifest.code === current.code) return { updateAvailable: false };
    if (failed && failed.commit === found.commit) return { updateAvailable: false, checkError: 'Version ' + found.shortCommit + ' did not start on this TV and was removed.' };
    if (manifest.assets !== local.assets) return { updateAvailable: false, checkError: 'Version ' + found.shortCommit + ' changes images, fonts or app settings. Install it from the computer.' };
    return { updateAvailable: true };
  }
  function report(state, extra) {
    var out = { returnValue: true, installed: installed(), latest: latest, updateAvailable: available, canRollback: !!active(state) }, key;
    for (key in extra || {}) if (own(extra, key)) out[key] = extra[key];
    return out;
  }
  function status(check, done) {
    var state = read();
    if (!check) { done(null, report(state)); return; }
    latestCommit(function (err, found) {
      if (err) { done(err); return; }
      manifestOf(found.commit, function (manifestErr, manifest) {
        var result;
        latest = found;
        if (manifestErr) { available = false; done(null, report(state, { updateAvailable: false, checkError: manifestErr.message })); return; }
        result = assess(found, manifest, state);
        available = result.updateAvailable;
        done(null, report(state, result));
      });
    });
  }
  function apply(done) {
    if (busy) { done(problem('An update is already in progress.')); return; }
    busy = true;
    function finish(err, value) { busy = false; done(err, value); }
    latestCommit(function (err, found) {
      if (err) { finish(err); return; }
      manifestOf(found.commit, function (manifestErr, manifest) {
        var state = read(), result, names, files = {}, index = 0;
        if (manifestErr) { finish(manifestErr); return; }
        latest = found;
        result = assess(found, manifest, state);
        if (!result.updateAvailable) { available = false; finish(problem(result.checkError || 'This TV already runs the latest version.')); return; }
        names = Object.keys(manifest.files);
        function next() {
          var name = names[index++], bundle, previous;
          if (name) {
            file(found.commit, name, function (fileErr, text) {
              if (fileErr) { finish(fileErr); return; }
              if (text.length !== manifest.files[name][0] || fingerprint(text) !== manifest.files[name][1]) { finish(problem('The download was incomplete. Try again.', name + ' did not match its fingerprint.')); return; }
              files[name] = text; next();
            });
            return;
          }
          bundle = { commit: found.commit, shortCommit: found.shortCommit, summary: found.summary, version: manifest.version || local.version, code: manifest.code,
            base: build.id, installedAt: new Date().toISOString(), tries: 0, confirmed: false, files: files };
          previous = active(state);
          try { write({ active: bundle, previous: previous, failed: null }); }
          catch (storeErr) {
            /* Two versions did not fit: keep only the new one, or leave everything as it was. */
            try { write({ active: bundle, previous: null, failed: null }); }
            catch (fullErr) { try { write(state); } catch (e) {} finish(problem('This TV has no room to store the update.')); return; }
          }
          available = false;
          finish(null, report(read(), { updated: true, updateAvailable: false }));
        }
        next();
      });
    });
  }
  /* Back to the version before the last download, or to the installed package when there is none. */
  function rollback(done) {
    var state = read();
    if (!active(state)) { done(problem('This TV already runs its installed version.')); return; }
    try { write({ active: active({ active: state.previous }) || null, previous: null, failed: null }); }
    catch (e) { done(problem('Could not restore the previous version.')); return; }
    available = false;
    done(null, report(read(), { rolledBack: true, updateAvailable: false }));
  }
  /* boot.js waits for this after the first start of a download; without it the download is removed. */
  function confirm() {
    var boot = window.DrentBoot, state;
    if (!boot || boot.confirmed || !window.ShoreQA || !window.ShoreQA.ready()) return;
    boot.confirmed = true; clearInterval(confirmTimer);
    try { state = read(); if (state.active && state.active.commit === boot.commit) { state.active.confirmed = true; state.active.tries = 0; write(state); } } catch (e) {}
  }
  if (window.DrentBoot && !window.DrentBoot.confirmed) confirmTimer = setInterval(confirm, 500);

  window.DrentUpdate = {
    enabled: config.enabled !== false && !!local && typeof local.code === 'string' && !!build.id && storageWorks(),
    status: status, apply: apply, rollback: rollback,
    /* A plain reload would reopen the page that is running; start-up decides which code to run. */
    reload: function () { window.location.replace('boot.html'); }
  };
}());
