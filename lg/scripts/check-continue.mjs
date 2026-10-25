import assert from 'node:assert/strict';
import {openPreview} from './browser.mjs';
const preview=await openPreview({publicFonts:true});
try{
 for(const width of [1920,1280]){
  const p=await preview.browser.newPage({viewport:{width,height:width*9/16}});let played=[],launch=[],fail=false,empty=false,offline=false;const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('http://127.0.0.1:8765/**',r=>{const path=new URL(r.request().url()).pathname;if(path==='/api/launch')launch.push(r.request().postDataJSON().id);return r.fulfill({contentType:'application/json',body:JSON.stringify({returnValue:true,apps:[],devices:[]})});});
  await p.route('http://127.0.0.1:8766/**',r=>{const path=new URL(r.request().url()).pathname;if(offline)return r.abort();if(path.startsWith('/art/'))return r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#314b53"/></svg>'});if(path.startsWith('/play/')){played.push(path);return r.fulfill({status:fail?502:200,contentType:'application/json',body:JSON.stringify(fail?{error:'Playback failed'}:{ok:true})});}return r.fulfill({contentType:'application/json',body:JSON.stringify({configured:true,items:empty?[]:Array.from({length:8},(_,i)=>({id:String(i+1),title:'Series '+(i+1),subtitle:'S1 · E2 — Episode title',image:'/art/'+(i+1),progress:.4,remaining:22,playable:true}))})});});
  await p.goto(preview.baseURL+'/home/');await p.waitForFunction(()=>ShoreQA.ready()&&ShoreQA.state().continueWatching.count===8);
  await p.screenshot({path:`output/playwright/continue-peek-${width}.png`});
  const peek=await p.locator('.cw-art').first().boundingBox();
  assert(peek.y<width*9/16 && peek.y+peek.height>width*9/16,'Media artwork must be partially clipped at the bottom');
  assert((await p.locator('.home-date').textContent()).includes(String(new Date().getFullYear())));
  const glassBefore=await p.locator('.dock .mat-img').boundingBox();
  await p.keyboard.press('ArrowDown');assert.equal(await p.evaluate(()=>ShoreQA.where().zone),'continue');assert.equal(await p.evaluate(()=>ShoreQA.where().focusCount),1);assert.equal(played.length,0);
  await p.waitForFunction(()=>getComputedStyle(document.querySelector('#home')).transform==='matrix(1, 0, 0, 1, 0, -500)');
  const glassAfter=await p.locator('.dock .mat-img').boundingBox();
  assert(Math.abs(glassAfter.y-glassBefore.y)<1,'Glass wallpaper must stay registered while the dock scrolls');
  const revealed=await p.locator('.cw-card').first().boundingBox();assert(revealed.y>0&&revealed.y+revealed.height<width*9/16);
  await p.evaluate(()=>window.originalMediaImage=document.querySelector('.cw-art img'));
  for(let n=0;n<30;n++){await p.keyboard.press('ArrowRight');await p.keyboard.press('ArrowLeft');}
  assert(await p.evaluate(()=>window.originalMediaImage===document.querySelector('.cw-art img')),'Navigation must preserve image DOM nodes');
  await p.keyboard.press('ArrowRight');await p.keyboard.press('Enter');await p.waitForFunction(()=>!ShoreQA.state().continueWatching.busy);assert.equal(played.at(-1),'/play/2');assert.equal(launch.length,0,'Playback must not switch to Apple TV');
  await p.screenshot({path:`output/playwright/continue-${width}.png`});
  fail=true;const n=launch.length;await p.keyboard.press('Enter');await p.waitForFunction(()=>ShoreQA.state().continueWatching.error==='Playback failed');assert.equal(launch.length,n);
  await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>ShoreQA.where().zone),'apps');
  await p.waitForFunction(()=>getComputedStyle(document.querySelector('#home')).transform==='matrix(1, 0, 0, 1, 0, 0)');
  await p.locator('#stage').dispatchEvent('wheel',{deltaY:120});assert.equal(await p.evaluate(()=>ShoreQA.where().zone),'continue');await p.keyboard.press('ArrowUp');
  await p.evaluate(()=>{window.ClockNativeDate=Date;window.testDate='2026-12-31T23:59:00';window.Date=function(){return new ClockNativeDate(window.testDate);};Date.now=ClockNativeDate.now;window.dispatchEvent(new Event('focus'));});
  assert.equal(await p.locator('.home-date').textContent(),'Thursday, 31 December 2026');
  await p.evaluate(()=>{window.testDate='2027-01-01T00:00:00';window.dispatchEvent(new Event('focus'));});assert.equal(await p.locator('.home-date').textContent(),'Friday, 1 January 2027');
  await p.evaluate(()=>{window.Date=window.ClockNativeDate;window.dispatchEvent(new Event('focus'));});await p.keyboard.press('ArrowUp');await p.keyboard.press('ArrowUp');assert.equal(await p.evaluate(()=>ShoreQA.where().zone),'util');
  await p.evaluate(()=>ShoreQA.look({layout:'list'}));await p.waitForFunction(()=>ShoreQA.ready());await p.evaluate(()=>ShoreQA.scene('home'));await p.keyboard.press('ArrowRight');assert.equal(await p.evaluate(()=>ShoreQA.where().zone),'continue');await p.screenshot({path:`output/playwright/continue-list-${width}.png`});
  empty=true;await p.evaluate(()=>FrameContinue.refresh(true));await p.waitForFunction(()=>ShoreQA.state().continueWatching.count===0);assert((await p.locator('.cw-empty').textContent()).includes('You’re all caught up'));
  offline=true;await p.evaluate(()=>FrameContinue.refresh(true));await p.waitForFunction(()=>ShoreQA.state().continueWatching.error==='Plex connection unavailable');assert.equal(await p.evaluate(()=>ShoreQA.where().focusCount),1);
  assert.deepEqual(errors,[]);
  await p.route('**/continue.js',r=>r.abort());await p.reload();await p.waitForFunction(()=>ShoreQA.ready());await p.evaluate(()=>ShoreQA.look({layout:'dock'}));await p.waitForFunction(()=>ShoreQA.ready());assert.equal(await p.locator('.tile').count(),4);await p.keyboard.press('ArrowUp');assert.equal(await p.evaluate(()=>ShoreQA.where().zone),'util');
  await p.close();console.log('PASS '+width+': media focus, navigation, handoff, errors, empty/offline states, list layout');
 }
}finally{await preview.close();}
