/* Exercise the real HTTP client on both the TV's Node 8 and current Node. */
'use strict';
const assert = require('assert');
const http = require('http');
const request = require('../service/media-bridge.cjs').request;
(async function () {
 const server = http.createServer(function (req, res) {
  let body = '';
  req.on('data', function (chunk) { body += chunk; });
  req.on('end', function () {
   if (req.url === '/failure') { res.writeHead(503); return res.end(); }
   if (req.url === '/image') { res.setHeader('Content-Type', 'image/png'); return res.end(Buffer.from([1, 2, 3])); }
   res.setHeader('Content-Type', 'application/json');
   res.end(JSON.stringify({method:req.method, path:req.url, marker:req.headers['x-test'], body:body ? JSON.parse(body) : null}));
  });
 });
 await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
 try {
  const base = 'http://127.0.0.1:' + server.address().port;
  const get = await request(base, '/items?q=a%20b', {'X-Test':'present'});
  assert.deepStrictEqual(get, {method:'GET', path:'/items?q=a%20b', marker:'present', body:null});
  const post = await request(base, '/launch', {}, {id:'test.app'});
  assert.strictEqual(post.method, 'POST'); assert.deepStrictEqual(post.body, {id:'test.app'});
  const image = await request(base, '/image', {}, null, true);
  assert.strictEqual(image.type, 'image/png'); assert.deepStrictEqual(Array.from(image.data), [1,2,3]);
  let rejected = false;
  try { await request(base, '/failure', {}); } catch (err) { rejected = /503/.test(err.message); }
  assert(rejected, 'non-success upstream status must be rejected');
  console.log('PASS: real HTTP GET/query/headers, POST/body, binary artwork and upstream errors on '+process.version);
 } finally { server.close(); }
})().catch(function (err) { console.error(err); process.exitCode=1; });
