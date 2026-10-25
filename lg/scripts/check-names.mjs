import assert from 'node:assert/strict';
import {openPreview} from './browser.mjs';
const preview=await openPreview({publicFonts:true});
try {for(const width of [1920,1280]) {
 const page=await preview.browser.newPage({viewport:{width,height:width*9/16}}),errors=[],launches=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://127.0.0.1:8765/**',r=>{const path=new URL(r.request().url()).pathname;if(path==='/api/launch')launches.push(r.request().postDataJSON().id);return r.fulfill({contentType:'application/json',body:JSON.stringify({returnValue:true,apps:[],devices:[]})});});
 await page.route('http://127.0.0.1:8766/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({configured:true,items:[]})}));
 await page.goto(preview.baseURL+'/home/');await page.waitForFunction(()=>ShoreQA.ready());
 const activate=action=>page.evaluate(action=>{if(!ShoreQA.activate(action))throw Error('Missing action '+action);},action);
 async function openRename(){await page.evaluate(()=>ShoreQA.scene('settings'));await activate('settings.group.names');await activate('names.appletv');}
 await openRename();await activate('rename.43'); // clear
 for(const i of [17,4,11,0,23])await activate('rename.'+i);
 await page.screenshot({path:`output/playwright/rename-${width}.png`});
 await activate('rename.45');assert.equal(await page.evaluate(()=>ShoreQA.state().names.appletv),'RELAX');
 await page.evaluate(()=>ShoreQA.scene('home'));assert.equal(await page.locator('[data-action="home.app.appletv"]').getAttribute('aria-label'),'RELAX');
 const dock=await page.locator('#dock').boundingBox(),cw=await page.locator('#continueWatching').boundingBox();assert(dock.y+dock.height<cw.y,'Apps must be above Continue Watching');
 await page.keyboard.press('Enter');assert.equal(launches.at(-1),'com.webos.app.hdmi1');
 await page.reload();await page.waitForFunction(()=>ShoreQA.ready());assert.equal(await page.locator('[data-action="home.app.appletv"]').getAttribute('aria-label'),'RELAX');
 await page.evaluate(()=>ShoreQA.look({wall:'alpine'}));await page.waitForFunction(()=>ShoreQA.ready());assert.equal(await page.evaluate(()=>ShoreQA.state().names.appletv),'RELAX');
 await openRename();await activate('rename.43');await activate('rename.0');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>ShoreQA.state().names.appletv),'RELAX');
 await activate('names.appletv');await activate('rename.43');await activate('rename.45');assert.equal(await page.evaluate(()=>ShoreQA.state().view),'rename');assert((await page.locator('.name-help').textContent()).includes('Enter a name'));
 await activate('rename.44');await activate('rename.45');assert.equal(await page.evaluate(()=>ShoreQA.state().names.appletv),undefined);
 await activate('names.appletv');await activate('rename.43');await activate('rename.0');
 await page.evaluate(()=>{window.realSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw Error('Storage full');};});
 await activate('rename.45');assert.equal(await page.evaluate(()=>ShoreQA.state().view),'rename');assert.equal(await page.evaluate(()=>ShoreQA.state().names.appletv),undefined);await page.evaluate(()=>Storage.prototype.setItem=window.realSetItem);
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');await page.screenshot({path:`output/playwright/names-settings-${width}.png`});
 assert.deepEqual(errors,[]);await page.close();console.log('PASS '+width+': rename/save/reload, cancel/default, empty name/storage errors, native launch preserved, stacked layout');
}}finally{await preview.close();}
