import assert from 'node:assert/strict';
import {openPreview} from './browser.mjs';
const v=await openPreview({publicFonts:true});
try{for(const width of [1920,1280]){
 const p=await v.browser.newPage({viewport:{width,height:width*9/16}}),requests=[];
 await p.addInitScript(()=>{window.DrentConfig={plex:{url:'http://plex.test:32400',token:'private-test-token',client:'drent-test',player:'samsung-test'}};window.launched=[];window.tizen={application:{getAppsInfo(ok){ok([]);},launch(id,ok){launched.push(id);ok();}}};});
 await p.route('http://plex.test:32400/**',r=>{const u=new URL(r.request().url()),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':r.request().headers()['access-control-request-headers']||'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers});assert.equal(r.request().headers()['x-plex-token'],'private-test-token');requests.push(u);let d;const item={ratingKey:'1',type:'episode',title:'Title',grandparentTitle:'Show',parentIndex:1,index:2,viewOffset:45000,duration:90000};
 if(u.pathname==='/hubs/continueWatching')d={Metadata:[item]};else if(u.pathname==='/library/sections')d={Directory:[{key:'1',type:'movie'},{key:'2',type:'show'}]};else if(u.pathname.includes('/sections/'))d={Metadata:[{...item,ratingKey:u.pathname.includes('/1/')?'2':'3',type:u.pathname.includes('/1/')?'movie':'show'}]};else if(u.pathname.endsWith('/allLeaves'))d={Metadata:[item]};else if(u.pathname.startsWith('/library/metadata/'))d={Metadata:[{...item,type:'show'}]};else if(u.pathname==='/identity')d={machineIdentifier:'server-test'};else if(u.pathname==='/security/token')d={token:'temporary-test'};else if(u.pathname==='/playQueues')d={playQueueID:9};else if(u.pathname==='/player/playback/playMedia'){assert.equal(r.request().headers()['x-plex-target-client-identifier'],'samsung-test');return r.fulfill({headers,body:'<Response code="200" status="OK" />'});}else throw Error('Unexpected path '+u.pathname);
 return r.fulfill({headers,contentType:'application/json',body:JSON.stringify({MediaContainer:d})});});
 await p.goto(v.baseURL+'/home/');await p.waitForFunction(()=>ShoreQA.ready()&&ShoreQA.state().continueWatching.count===1);
 for(let row=0;row<3;row++){await p.keyboard.press('ArrowDown');assert.equal(await p.evaluate(()=>ShoreQA.state().continueWatching.row),row);assert.equal(await p.locator('.cw-card.is-focus').count(),1);}
 await p.keyboard.press('Enter');await p.waitForFunction(()=>!ShoreQA.state().continueWatching.busy);
 const play=requests.find(u=>u.pathname==='/player/playback/playMedia');assert(play);assert.equal(play.searchParams.get('offset'),'45000');assert.equal(play.searchParams.get('token'),'temporary-test');assert.deepEqual(await p.evaluate(()=>launched),['kIciSQlYEM.plex']);
 await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>ShoreQA.where().zone),'apps');assert.match(await p.locator('.home-date').textContent(),/\d{4}/);
 await p.evaluate(()=>{ShoreQA.scene('settings');ShoreQA.activate('settings.group.layout');ShoreQA.activate('choice.media.hidden');});
 assert.equal(await p.evaluate(()=>ShoreQA.state().committed.media),'hidden');
 assert.equal(await p.evaluate(()=>document.querySelector('#continueWatching').hidden),true);
 await p.evaluate(()=>ShoreQA.scene('home'));
 await p.keyboard.press('ArrowDown');assert.equal(await p.evaluate(()=>ShoreQA.where().zone),'apps');
 await p.evaluate(()=>ShoreQA.look({media:'shown'}));await p.waitForFunction(()=>ShoreQA.ready());
 assert.equal(await p.evaluate(()=>document.querySelector('#continueWatching').hidden),false);
 await p.close();console.log(`PASS ${width}: direct Plex shelves, row navigation, hide/show setting, series episode selection, resume offset, Samsung launch, no service`);
}}finally{await v.close();}
