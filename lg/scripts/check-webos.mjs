import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {openPreview} from './browser.mjs';
const preview=await openPreview({publicFonts:true});
const errors=[],launches=[];
mkdirSync('output/playwright',{recursive:true});
try {
 for (const width of [1920,1280]) {
 for (const legacySpacing of [false,true]) {
  const page=await preview.browser.newPage({viewport:{width,height:width*9/16}});
  if (legacySpacing) await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('no-flex-gap')));
  page.on('pageerror',e=>errors.push(e.message));
  let refuse=false;
  await page.route('http://127.0.0.1:8766/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({configured:true,items:[]})}));
  await page.route('http://127.0.0.1:8765/**',async route=>{
   const p=new URL(route.request().url()).pathname;
   if(p.startsWith('/icon/')) return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" rx="20" fill="#323b49"/><path d="M35 25L75 50L35 75Z" fill="white"/></svg>'});
   let body={returnValue:true};
   if(p==='/api/apps') body={apps:[{id:'com.webos.app.browser',title:'Web Browser'},{id:'com.webos.app.mediadiscovery',title:'Media Player'},{id:'com.webos.app.lifeonscreen',title:'LG Gallery+'},{id:'org.webosbrew.hbchannel',title:'Homebrew Channel'}]};
   if(p==='/api/inputs') body={devices:[{appId:'com.webos.app.hdmi1',port:1,label:'Apple OTT',subList:[{osdName:'Apple TV'}]},{appId:'com.webos.app.hdmi2',port:2,label:'HDMI 2'}]};
   if(p==='/api/launch'){launches.push(route.request().postDataJSON().id);if(refuse)body={returnValue:false,errorText:'Test launch refusal'};}
   return route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
  });
  await page.goto(preview.baseURL+'/home/');
  await page.waitForFunction(()=>window.ShoreQA && ShoreQA.ready() && ShoreQA.state().catalog.loaded);
  assert.equal(await page.evaluate(()=>ShoreQA.state().bg),'photo');
  const spacing = await page.evaluate(() => {
    var track = document.createElement('div'); track.className = 'cw-track';
    track.style.cssText = 'position:absolute;left:0;top:0';
    for (var i=0;i<2;i++) { var child=document.createElement('div');child.style.cssText='width:100px;height:10px;flex:none';track.appendChild(child); }
    document.body.appendChild(track);
    var gap=track.children[1].getBoundingClientRect().left-track.children[0].getBoundingClientRect().right;
    document.body.removeChild(track); return gap;
  });
  assert.equal(spacing,24,'media card spacing must match scroll geometry');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  assert.equal(launches.at(-1),'com.webos.app.hdmi1');
  await page.screenshot({path:`output/playwright/home-${width}${legacySpacing ? "-legacy" : ""}.png`});
  await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');await page.waitForTimeout(100);
  assert.equal(launches.at(-1),'com.webos.app.homeconnect');
  await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>ShoreQA.state().view==='apps' && ShoreQA.state().catalog.loaded);
  assert((await page.evaluate(()=>ShoreQA.state().catalog.ids)).includes('com.webos.app.hdmi2'));
  await page.screenshot({path:`output/playwright/apps-${width}${legacySpacing ? "-legacy" : ""}.png`});
  await page.keyboard.press('Escape');
  await page.evaluate(()=>ShoreQA.scene('settings'));
  await page.screenshot({path:`output/playwright/settings-${width}${legacySpacing ? "-legacy" : ""}.png`});
  await page.evaluate(()=>ShoreQA.look({wall:'alpine'}));
  await page.waitForFunction(()=>ShoreQA.ready() && ShoreQA.state().wall==='alpine');
  await page.reload();await page.waitForFunction(()=>window.ShoreQA && ShoreQA.ready());
  assert.equal(await page.evaluate(()=>ShoreQA.state().wall),'alpine');
  await page.evaluate(()=>new Promise(resolve=>FrameDevice.settings(resolve)));
  assert.equal(launches.at(-1),'com.palm.app.settings');
  refuse=true;
  const result=await page.evaluate(()=>new Promise(resolve=>FrameDevice.launchApp('com.webos.app.browser',resolve)));
  assert(result && result.detail==='Test launch refusal');
  await page.close();
  console.log('PASS: '+width+'px '+(legacySpacing?'legacy spacing ':'')+'render, remote navigation, HDMI launch, app discovery, settings, persisted wallpaper, launch error');
 }
 }
 assert.deepEqual(errors,[]);console.log('PASS: no browser JavaScript errors');
} finally {await preview.close();}
