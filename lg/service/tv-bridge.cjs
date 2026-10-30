/* Local-only LG webOS app discovery, icon, launch and self-update bridge. Node 8.12+. */
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const urlMod = require('url');

const PORT = 8765;
const DEFAULT_ROOT = '/media/developer/ramon-os';
const DEFAULT_REPO = 'ramondrent/ramon-os';
const DEFAULT_BRANCH = 'main';
const ENV = Object.assign({}, process.env, {
  PATH: '/usr/bin:/usr/sbin:/bin:/sbin:' + (process.env.PATH || '')
});

function defaultLuna(uri, payload) {
  return new Promise(function (resolve) {
    const sh = '/usr/bin/luna-send -n 1 -w 5000 -f "$1" "$2" </dev/null';
    cp.execFile('/bin/sh', ['-c', sh, 'sh', uri, JSON.stringify(payload || {})], {
      env: ENV,
      timeout: 8000,
      maxBuffer: 8 * 1024 * 1024
    }, function (err, stdout) {
      try {
        resolve(JSON.parse(stdout));
      } catch (_) {
        resolve({ returnValue: false, errorText: String(err && err.message || err || 'Invalid response from luna-send') });
      }
    });
  });
}

function execShell(script, args, timeoutMs) {
  return new Promise(function (resolve, reject) {
    cp.execFile('/bin/sh', ['-c', script, 'sh'].concat(args || []), {
      env: ENV,
      timeout: timeoutMs || 20000,
      maxBuffer: 8 * 1024 * 1024
    }, function (err, stdout, stderr) {
      if (err) {
        return reject(new Error(String((stderr && stderr.trim()) || err.message || err)));
      }
      resolve(String(stdout || '').trim());
    });
  });
}

function defaultFetchUrl(urlStr, headers, binary, redirectsLeft) {
  const remaining = redirectsLeft === undefined ? 5 : redirectsLeft;
  return new Promise(function (resolve, reject) {
    if (remaining < 0) return reject(new Error('Too many redirects'));
    const parsed = urlMod.parse(urlStr);
    const client = parsed.protocol === 'https:' ? https : http;
    const reqHeaders = Object.assign({ 'User-Agent': 'ramon-os-tv-bridge' }, headers || {});
    const options = Object.assign({}, parsed, { method: 'GET', headers: reqHeaders });
    const maxBytes = binary ? 48 * 1024 * 1024 : 2 * 1024 * 1024;
    const timeoutMs = binary ? 30000 : 10000;
    const req = client.request(options, function (res) {
      const status = res.statusCode || 0;
      if ([301, 302, 303, 307, 308].indexOf(status) >= 0 && res.headers.location) {
        res.resume();
        const nextUrl = urlMod.resolve(urlStr, res.headers.location);
        return defaultFetchUrl(nextUrl, headers, binary, remaining - 1).then(resolve, reject);
      }
      const chunks = [];
      let size = 0;
      res.on('data', function (chunk) {
        size += chunk.length;
        if (size > maxBytes) {
          req.abort();
          reject(new Error('Upstream response too large'));
        } else {
          chunks.push(chunk);
        }
      });
      res.on('error', reject);
      res.on('end', function () {
        if (status < 200 || status >= 300) {
          return reject(new Error('GitHub HTTP ' + status));
        }
        const buf = Buffer.concat(chunks);
        if (binary) return resolve(buf);
        try {
          resolve(JSON.parse(buf.toString('utf8')));
        } catch (_) {
          reject(new Error('Invalid JSON from GitHub'));
        }
      });
    });
    req.setTimeout(timeoutMs, function () {
      req.abort();
      reject(new Error('GitHub request timed out'));
    });
    req.on('error', reject);
    req.end();
  });
}

function readJsonSafe(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let data = '';
    req.on('data', function (chunk) {
      data += chunk;
      if (data.length > 65536) req.destroy(new Error('Request body too large'));
    });
    req.on('error', reject);
    req.on('end', function () {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
  });
}

function createTvBridge(options) {
  const opts = options || {};
  const callLuna = opts.luna || defaultLuna;
  const rootDir = path.resolve(opts.rootDir || process.env.RAMON_OS_ROOT || DEFAULT_ROOT);
  const repo = opts.repo || process.env.RAMON_OS_REPO || DEFAULT_REPO;
  const branch = opts.branch || process.env.RAMON_OS_BRANCH || DEFAULT_BRANCH;
  const fetchUrl = opts.fetchUrl || defaultFetchUrl;
  const runStage = opts.stage || function () {
    const stageScript = path.join(rootDir, 'stage-home.sh');
    if (!fs.existsSync(stageScript)) return Promise.resolve();
    return execShell('sh "$1"', [stageScript], 15000);
  };
  const runReload = opts.reload || function () {
    const reloadScript = path.join(rootDir, 'reload-home.sh');
    if (!fs.existsSync(reloadScript)) return Promise.resolve();
    return execShell('sh "$1"', [reloadScript], 10000).catch(function () {});
  };

  let appCache = null;
  let appCacheAt = 0;
  let latestCache = null;
  let latestCacheAt = 0;
  let busyUpdating = false;

  function readInstalledVersion() {
    const vFile = path.join(rootDir, 'version.json');
    const saved = readJsonSafe(vFile, null);
    if (saved && typeof saved === 'object') {
      const sha = typeof saved.commit === 'string' && /^[0-9a-f]{7,40}$/i.test(saved.commit) ? saved.commit : null;
      return {
        version: String(saved.version || '0.6.1'),
        commit: sha,
        shortCommit: sha ? sha.slice(0, 7) : null,
        summary: saved.summary ? String(saved.summary) : null,
        updatedAt: saved.updatedAt ? String(saved.updatedAt) : null
      };
    }
    return { version: '0.6.1', commit: null, shortCommit: null, summary: null, updatedAt: null };
  }

  function hasRollback() {
    return fs.existsSync(path.join(rootDir, 'backup/app.prev/index.html'));
  }

  async function fetchLatestCommit(force) {
    if (!force && latestCache && Date.now() - latestCacheAt < 30000) {
      return latestCache;
    }
    const apiUrl = 'https://api.github.com/repos/' + repo + '/commits/' + encodeURIComponent(branch);
    const data = await fetchUrl(apiUrl, { Accept: 'application/vnd.github+json' }, false);
    const sha = data && typeof data.sha === 'string' ? data.sha.trim() : '';
    if (!/^[0-9a-f]{40}$/i.test(sha)) {
      throw new Error('Invalid commit SHA from GitHub');
    }
    const message = data.commit && typeof data.commit.message === 'string' ? data.commit.message : '';
    const summary = message.split(/\r?\n/)[0].trim().slice(0, 140);
    const date = data.commit && data.commit.committer && data.commit.committer.date ? String(data.commit.committer.date) : null;
    latestCache = {
      commit: sha,
      shortCommit: sha.slice(0, 7),
      summary: summary || 'Latest main commit',
      date: date
    };
    latestCacheAt = Date.now();
    return latestCache;
  }

  async function getUpdateStatus(checkRemote) {
    const installed = readInstalledVersion();
    let checkError = null;
    if (checkRemote) {
      try {
        await fetchLatestCommit(true);
      } catch (err) {
        checkError = 'Could not reach GitHub (' + String(err && err.message || err) + ').';
      }
    }
    const updateAvailable = !!(latestCache && latestCache.commit && latestCache.commit !== installed.commit);
    return {
      returnValue: true,
      installed: installed,
      latest: latestCache,
      updateAvailable: updateAvailable,
      canRollback: hasRollback(),
      checkError: checkError
    };
  }

  async function applyUpdate() {
    if (busyUpdating) {
      const busyErr = new Error('An update is already in progress.');
      busyErr.statusCode = 409;
      throw busyErr;
    }
    busyUpdating = true;
    const stageDir = path.join(rootDir, 'update.stage');
    try {
      const latest = await fetchLatestCommit(true);
      const tarUrl = 'https://codeload.github.com/' + repo + '/tar.gz/' + latest.commit;
      const archiveBuf = await fetchUrl(tarUrl, {}, true);

      await execShell('rm -rf "$1" && mkdir -p "$1" "$2/backup"', [stageDir, rootDir], 10000);
      const archivePath = path.join(stageDir, 'archive.tgz');
      fs.writeFileSync(archivePath, archiveBuf);
      await execShell('tar -xzf "$1" -C "$2"', [archivePath, stageDir], 20000);

      const entries = fs.readdirSync(stageDir).filter(function (name) {
        return name !== 'archive.tgz' && fs.existsSync(path.join(stageDir, name, 'lg/app/index.html'));
      });
      if (!entries.length) {
        throw new Error('Downloaded archive is missing lg/app/index.html');
      }
      const extractedRoot = path.join(stageDir, entries[0]);
      const lgRoot = path.join(extractedRoot, 'lg');
      const requiredFiles = ['app/index.html', 'app/main.js', 'app/style.css', 'app/device.js', 'app/continue.js'];
      requiredFiles.forEach(function (rel) {
        if (!fs.existsSync(path.join(lgRoot, rel))) {
          throw new Error('Downloaded archive is missing lg/' + rel);
        }
      });

      const pkg = readJsonSafe(path.join(lgRoot, 'package.json'), {});
      const newVersion = {
        version: String(pkg.version || '0.6.1'),
        commit: latest.commit,
        shortCommit: latest.shortCommit,
        summary: latest.summary,
        updatedAt: new Date().toISOString()
      };

      const installScript = [
        'set -eu',
        'R="$1"',
        'SRC="$2"',
        'rm -rf "$R/app.next"',
        'mkdir -p "$R/app.next" "$R/backup"',
        'cp -R "$SRC/app/." "$R/app.next/"',
        'if [ -d "$R/app/assets/private-fonts" ]; then',
        '  rm -rf "$R/app.next/assets/private-fonts"',
        '  cp -R "$R/app/assets/private-fonts" "$R/app.next/assets/private-fonts"',
        '  [ -f "$R/app/assets/fonts.css" ] && cp -p "$R/app/assets/fonts.css" "$R/app.next/assets/fonts.css" || true',
        '  [ -f "$R/app/assets/font-catalog.js" ] && cp -p "$R/app/assets/font-catalog.js" "$R/app.next/assets/font-catalog.js" || true',
        'fi',
        'find "$R/app.next" -type d -exec chmod 755 {} \\;',
        'find "$R/app.next" -type f -exec chmod 644 {} \\;',
        'if [ -d "$R/app" ] && [ -f "$R/app/index.html" ]; then',
        '  rm -rf "$R/backup/app.prev"',
        '  mv "$R/app" "$R/backup/app.prev"',
        '  [ -f "$R/version.json" ] && cp -p "$R/version.json" "$R/backup/version.prev.json" || rm -f "$R/backup/version.prev.json"',
        'else',
        '  rm -rf "$R/app"',
        'fi',
        'mv "$R/app.next" "$R/app"',
        'if [ -f "$SRC/service/stage-home.cjs" ] && [ -f "$R/stage-home.cjs" ]; then',
        '  cp "$SRC/service/stage-home.cjs" "$R/stage-home.cjs"',
        '  chmod 644 "$R/stage-home.cjs"',
        'fi',
        'rm -rf "$3"'
      ].join('\n');

      await execShell(installScript, [rootDir, lgRoot, stageDir], 20000);
      fs.writeFileSync(path.join(rootDir, 'version.json'), JSON.stringify(newVersion, null, 2) + '\n');
      await runStage();
      setTimeout(function () { runReload(); }, 250);

      return {
        returnValue: true,
        updated: true,
        installed: newVersion,
        latest: latestCache,
        updateAvailable: false,
        canRollback: hasRollback()
      };
    } finally {
      busyUpdating = false;
      execShell('rm -rf "$1"', [stageDir], 5000).catch(function () {});
    }
  }

  async function rollbackUpdate() {
    if (busyUpdating) {
      const busyErr = new Error('An update operation is already in progress.');
      busyErr.statusCode = 409;
      throw busyErr;
    }
    if (!hasRollback()) {
      const missingErr = new Error('No previous version backup is available.');
      missingErr.statusCode = 400;
      throw missingErr;
    }
    busyUpdating = true;
    try {
      const rollbackScript = [
        'set -eu',
        'R="$1"',
        '[ -f "$R/backup/app.prev/index.html" ]',
        'rm -rf "$R/app.next"',
        'cp -R "$R/backup/app.prev" "$R/app.next"',
        'find "$R/app.next" -type d -exec chmod 755 {} \\;',
        'find "$R/app.next" -type f -exec chmod 644 {} \\;',
        'rm -rf "$R/app"',
        'mv "$R/app.next" "$R/app"',
        'rm -rf "$R/backup/app.prev"',
        'if [ -f "$R/backup/version.prev.json" ]; then',
        '  mv "$R/backup/version.prev.json" "$R/version.json"',
        'else',
        '  rm -f "$R/version.json"',
        'fi'
      ].join('\n');

      await execShell(rollbackScript, [rootDir], 15000);
      await runStage();
      const installed = readInstalledVersion();
      setTimeout(function () { runReload(); }, 250);

      return {
        returnValue: true,
        rolledBack: true,
        installed: installed,
        latest: latestCache,
        updateAvailable: !!(latestCache && latestCache.commit && latestCache.commit !== installed.commit),
        canRollback: hasRollback()
      };
    } finally {
      busyUpdating = false;
    }
  }

  async function listApps() {
    if (appCache && Date.now() - appCacheAt < 5000) return appCache;
    const res = await callLuna('luna://com.webos.applicationManager/listApps', {});
    if (!res || res.returnValue === false || !Array.isArray(res.apps)) {
      return appCache || [];
    }
    appCache = res.apps
      .filter(function (a) { return a && a.visible !== false && a.id !== 'com.webos.app.home'; })
      .map(function (a) {
        return {
          id: a.id,
          title: a.title || a.id,
          icon: a.largeIcon || a.icon || '',
          folder: a.folderPath || '',
          type: a.type || ''
        };
      });
    appCacheAt = Date.now();
    return appCache;
  }

  const server = http.createServer(async function (req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    const sendJson = function (obj, code) {
      res.writeHead(code || 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(obj));
    };
    const parsedUrl = urlMod.parse(String(req.url || '/'), true);
    const pathname = parsedUrl.pathname || '/';
    try {
      if (req.method === 'GET' && pathname === '/api/log') {
        return sendJson({ returnValue: true });
      }
      if (req.method === 'GET' && pathname === '/api/apps') {
        return sendJson({ returnValue: true, apps: await listApps() });
      }
      if (req.method === 'GET' && pathname === '/api/inputs') {
        return sendJson(await callLuna('luna://com.webos.service.eim/getAllInputStatus', {}));
      }
      if (req.method === 'GET' && pathname === '/api/foreground') {
        return sendJson(await callLuna('luna://com.webos.applicationManager/getForegroundAppInfo', {}));
      }
      if (req.method === 'GET' && pathname === '/api/update') {
        const check = parsedUrl.query && (parsedUrl.query.check === '1' || parsedUrl.query.check === 'true');
        return sendJson(await getUpdateStatus(check));
      }
      if (req.method === 'POST' && pathname === '/api/update') {
        await readBody(req);
        return sendJson(await applyUpdate());
      }
      if (req.method === 'POST' && pathname === '/api/update/rollback') {
        await readBody(req);
        return sendJson(await rollbackUpdate());
      }
      if (req.method === 'POST' && pathname === '/api/launch') {
        const body = await readBody(req);
        if (!/^[\w.-]+$/.test(body.id || '')) {
          return sendJson({ returnValue: false, errorText: 'Invalid app identifier' }, 400);
        }
        return sendJson(await callLuna('luna://com.webos.applicationManager/launch', {
          id: body.id,
          params: body.params && typeof body.params === 'object' ? body.params : {}
        }));
      }
      const iconMatch = req.method === 'GET' ? pathname.match(/^\/icon\/([\w.-]+)$/) : null;
      if (iconMatch) {
        const appId = iconMatch[1];
        const found = (await listApps()).find(function (x) { return x.id === appId; });
        const folder = found && found.folder ? path.resolve(found.folder) : '';
        const iconFile = found && found.icon && folder ? path.resolve(folder, found.icon) : '';
        if (!iconFile || (iconFile !== folder && !iconFile.startsWith(folder + path.sep)) || !fs.existsSync(iconFile)) {
          res.writeHead(404);
          return res.end();
        }
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600' });
        return fs.createReadStream(iconFile).pipe(res);
      }
      sendJson({ returnValue: false, errorText: 'Not found' }, 404);
    } catch (err) {
      sendJson({ returnValue: false, errorText: String(err && err.message || err) }, err && err.statusCode || 500);
    }
  });

  return { server: server, listApps: listApps, getUpdateStatus: getUpdateStatus, applyUpdate: applyUpdate, rollbackUpdate: rollbackUpdate };
}

module.exports = { createTvBridge: createTvBridge, defaultLuna: defaultLuna, defaultFetchUrl: defaultFetchUrl };

if (require.main === module) {
  const port = Number(process.env.RAMON_OS_PORT) || PORT;
  const bridge = createTvBridge();
  bridge.server.listen(port, '127.0.0.1', function () {
    console.log('Ramon OS TV bridge listening on 127.0.0.1:' + port);
  });
}
