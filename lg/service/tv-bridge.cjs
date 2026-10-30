/* Local-only LG webOS app discovery, icon and launch bridge. Node 8.12+. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const PORT = 8765;
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
  let appCache = null;
  let appCacheAt = 0;

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
    const pathname = String(req.url || '/').split('?')[0];
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
      sendJson({ returnValue: false, errorText: String(err && err.message || err) }, 500);
    }
  });

  return { server: server, listApps: listApps };
}

module.exports = { createTvBridge: createTvBridge, defaultLuna: defaultLuna };

if (require.main === module) {
  const port = Number(process.env.RAMON_OS_PORT) || PORT;
  const bridge = createTvBridge();
  bridge.server.listen(port, '127.0.0.1', function () {
    console.log('Ramon OS TV bridge listening on 127.0.0.1:' + port);
  });
}
