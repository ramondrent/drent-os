import assert from 'node:assert/strict';
import {openPreview} from './browser.mjs';
// The local services reject requests without their token. The launcher must send it, and
// recover once from a stale token script without looping when the token stays rejected.
const preview=await openPreview({publicFonts:true});
const errors=[];
async function open(freshToken){
 const page=await preview.browser.newPage({viewport:{width:1920,height:1080}});
 const seen={tv:[],media:[],reloads:0,launches:[]};
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/home/bridge-token.js*',route=>{
  const reload=new URL(route.request().url()).searchParams.has('r');
  if(reload)seen.reloads++;
  return route.fulfill({contentType:'application/javascript',body:'window.DrentBridgeToken='+JSON.stringify(reload?freshToken:'stale-token')+';'});
 });
 await page.route('http://127.0.0.1:8765/**',route=>{
  const url=new URL(route.request().url()),p=url.pathname,ok=url.searchParams.get('t')==='good-token';
  if(p.startsWith('/icon/')||p==='/api/log')return route.fulfill({contentType:'application/json',body:'{"returnValue":true}'});
  seen.tv.push({path:p,ok});
  if(!ok)return route.fulfill({status:403,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({returnValue:false,errorText:'Launcher authorization required',code:'bridge-token'})});
  let body={returnValue:true};
  if(p==='/api/apps')body={apps:[{id:'com.webos.app.browser',title:'Web Browser'}]};
  if(p==='/api/inputs')body={devices:[]};
  if(p==='/api/launch')seen.launches.push(route.request().postDataJSON().id);
  return route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
 });
 await page.route('http://127.0.0.1:8766/**',route=>{
  const url=new URL(route.request().url()),p=url.pathname,ok=url.searchParams.get('t')==='good-token';
  seen.media.push({path:p,ok});
  if(!ok)return route.fulfill({status:403,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({error:'Launcher authorization required',code:'bridge-token'})});
  let body={movies:[],shows:[]};
  if(p==='/continue')body={configured:true,items:[{id:'1',title:'Test title',subtitle:'',progress:.5,playable:true,playbackMode:'resume'}]};
  if(p==='/aerial')body={enabled:true,idleSeconds:60,urls:['https://example.test/clip.mp4']};
  return route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
 });
 await page.goto(preview.baseURL+'/home/');
 await page.waitForFunction(()=>window.ShoreQA&&ShoreQA.ready()&&!ShoreQA.state().catalog.loading&&ShoreQA.state().continueWatching.loaded);
 return {page,seen};
}
try {
 // 1. A stale token is replaced by one reload, shared by every request that was rejected.
 let {page,seen}=await open('good-token');
 await page.waitForFunction(()=>DrentAerial.state().configured);
 let state=await page.evaluate(()=>ShoreQA.state());
 assert.equal(state.catalog.loaded,true);assert.equal(state.catalog.error,null);
 assert(state.catalog.ids.includes('com.webos.app.browser'));
 assert.equal(state.continueWatching.count,1);assert.equal(state.continueWatching.error,'');
 assert.equal(seen.reloads,1,'rejected requests share one token reload');
 assert.equal(await page.evaluate(()=>DrentBridge.token()),'good-token');
 for(const path of ['/api/apps','/api/inputs'])assert.equal(seen.tv.filter(r=>r.path===path&&r.ok).length,1,path+' is repeated once with the new token');
 for(const path of ['/continue','/recent','/aerial'])assert.equal(seen.media.filter(r=>r.path===path&&r.ok).length,1,path+' is repeated once with the new token');
 assert.equal(await page.evaluate(()=>new Promise(resolve=>FrameDevice.launchApp('com.webos.app.browser',resolve))),null);
 assert.deepEqual(seen.launches,['com.webos.app.browser']);
 assert.equal(seen.reloads,1);
 await page.close();
 // 2. A token that stays rejected fails visibly after one reload; nothing is retried again.
 ({page,seen}=await open('still-wrong'));
 state=await page.evaluate(()=>ShoreQA.state());
 assert.equal(state.catalog.loaded,false);assert.equal(state.catalog.error,'The TV service did not accept this launcher.');
 assert(seen.tv.every(r=>!r.ok)&&seen.media.every(r=>!r.ok));
 assert.equal(seen.tv.filter(r=>r.path==='/api/apps').length,2,'one attempt and one retry');
 assert.equal(seen.reloads,1);
 await page.close();
 assert.deepEqual(errors,[]);
 console.log('PASS: launcher token sent to both services, single shared reload after rejection, bounded failure');
} finally {await preview.close();}
