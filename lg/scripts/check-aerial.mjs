import assert from 'node:assert/strict';
import {openPreview} from './browser.mjs';
const v=await openPreview({publicFonts:true});
try {
 const p=await v.browser.newPage();
 await p.addInitScript(()=>{
  Object.defineProperty(HTMLMediaElement.prototype,'src',{get(){return this._src||'';},set(v){this._src=v;}});
  HTMLMediaElement.prototype.play=function(){this.dispatchEvent(new Event('playing'));return Promise.resolve();};
  HTMLMediaElement.prototype.pause=function(){};HTMLMediaElement.prototype.load=function(){};
 });
 await p.route('http://127.0.0.1:8765/**',r=>r.fulfill({contentType:'application/json',body:'{"apps":[],"devices":[]}'}));
 await p.route('http://127.0.0.1:8766/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(r.request().url().endsWith('/aerial')?{enabled:true,idleSeconds:60,urls:['https://example.test/aerial.mp4']}:{configured:true,items:[],movies:[],shows:[]})}));
 await p.goto(v.baseURL+'/home/');await p.waitForFunction(()=>ShoreQA.ready()&&DrentAerial.state().configured);
 const before=await p.evaluate(()=>ShoreQA.where());
 assert(await p.evaluate(()=>DrentAerial.start()));assert(await p.evaluate(()=>DrentAerial.state().active));
 await p.keyboard.press('ArrowRight');assert.equal(await p.evaluate(()=>DrentAerial.state().active),false);
 assert.deepEqual(await p.evaluate(()=>ShoreQA.where()),before,'Wake-up input must not navigate or launch');
 await p.evaluate(()=>DrentAerial.start());await p.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await p.evaluate(()=>DrentAerial.state().active),false);
 await p.evaluate(()=>ShoreQA.scene('settings'));assert.equal(await p.evaluate(()=>DrentAerial.start()),false);
 await p.evaluate(()=>ShoreQA.scene('home'));await p.evaluate(()=>DrentAerial.start());await p.evaluate(()=>document.getElementById('idleAerial').dispatchEvent(new Event('error')));assert.equal(await p.evaluate(()=>DrentAerial.state().active),false);assert(await p.locator('#idleAerial').isHidden());
 console.log('PASS: aerial configuration, first-key wake without navigation, blur stop, settings exclusion, video-error fallback (media playback mocked)');
}finally{await v.close();}
