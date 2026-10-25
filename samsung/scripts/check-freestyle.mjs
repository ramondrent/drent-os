import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {openPreview} from './browser.mjs';
const preview=await openPreview({publicFonts:true});
try {
 for(const width of [1920,1280]) {
  const page=await preview.browser.newPage({viewport:{width,height:width*9/16}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.launches=[];
   window.tizen={application:{
    getAppsInfo(ok){ok([{id:'kIciSQlYEM.plex',name:'Plex',show:true},{id:'9Ur5IzDKqV.TizenYouTube',name:'YouTube',show:true},{id:'iquaePhaki.npostart',name:'NPO Start',show:true},{id:'8H24TM2DAH.kijk',name:'KIJK',show:true},{id:'zolvT6pDD0.FreestyleHome',name:'Freestyle Home',show:true}]);},
    launch(id,ok){window.launches.push(id);ok();}
   }};
  });
  await page.goto(preview.baseURL+'/home/');
  await page.waitForFunction(()=>window.ShoreQA&&ShoreQA.ready());
  assert.equal(await page.locator('.dock .tile').count(),4);
  assert.equal(await page.locator('.dock .app-artwork').count(),4);
  assert.match(await page.locator('.clock').innerText(),/^\d{2}:\d{2}$/);
  await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.launches.length===1);
  assert.equal(await page.evaluate(()=>launches[0]),'9Ur5IzDKqV.TizenYouTube');
  await page.evaluate(()=>ShoreQA.scene('settings'));
  assert.equal(await page.evaluate(()=>ShoreQA.where().focusCount),1);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>ShoreQA.look({bg:'dark',layout:'list'}));
  await page.waitForFunction(()=>ShoreQA.ready());
  assert.equal(await page.evaluate(()=>ShoreQA.state().committed.layout),'list');
  await page.reload();await page.waitForFunction(()=>window.ShoreQA&&ShoreQA.ready());
  assert.equal(await page.evaluate(()=>ShoreQA.state().committed.layout),'list');
  await page.evaluate(()=>ShoreQA.look({bg:'photo',layout:'dock'}));
  await page.waitForFunction(()=>ShoreQA.ready());
  mkdirSync('output/playwright',{recursive:true});
  await page.screenshot({path:`output/playwright/freestyle-${width}.png`});
  assert.deepEqual(errors,[]);await page.close();
  console.log(`PASS ${width}: Freestyle app cards, clock, remote launch, settings focus, persisted appearance, no browser errors`);
 }
} finally {await preview.close();}
