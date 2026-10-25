import assert from 'node:assert/strict';
import {openPreview} from './browser.mjs';
const v=await openPreview({publicFonts:true});
try{for(const width of [1920,1280]){
 const p=await v.browser.newPage({viewport:{width,height:width*9/16}}),requests=[];
 await p.addInitScript(()=>{window.RamonConfig={mediaBase:'http://media.test:8767',accessKey:'test-key'};window.launched=[];window.tizen={application:{getAppsInfo(ok){ok([]);},launch(id,ok){launched.push(id);ok();}}};});
 await p.route('http://media.test:8767/**',r=>{const u=new URL(r.request().url());if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'X-Ramon-Key, X-CleanFrame'}});assert.equal(r.request().headers()['x-ramon-key'],'test-key');requests.push(u.pathname);const item={id:'1',title:'Title',subtitle:'2026',progress:.5,remaining:20};return r.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(u.pathname==='/continue'?{configured:true,items:[item]}:u.pathname==='/recent'?{movies:[{...item,id:'2'}],shows:[{...item,id:'3'}]}:{ok:true})});});
 await p.goto(v.baseURL+'/home/');await p.waitForFunction(()=>ShoreQA.ready()&&ShoreQA.state().continueWatching.count===1);
 for(let row=0;row<3;row++){await p.keyboard.press('ArrowDown');assert.equal(await p.evaluate(()=>ShoreQA.state().continueWatching.row),row);assert.equal(await p.locator('.cw-card.is-focus').count(),1);}
 await p.keyboard.press('Enter');await p.waitForFunction(()=>!ShoreQA.state().continueWatching.busy);
 assert(requests.includes('/play/3'));assert.deepEqual(await p.evaluate(()=>launched),['kIciSQlYEM.plex']);
 await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>ShoreQA.where().zone),'apps');
 assert.match(await p.locator('.home-date').textContent(),/\d{4}/);
 await p.close();console.log(`PASS ${width}: authenticated shelves, row navigation, Samsung-only Plex launch, return to apps, date`);
}}finally{await v.close();}
