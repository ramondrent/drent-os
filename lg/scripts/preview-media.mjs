import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {openPreview} from './browser.mjs';
const require=createRequire(import.meta.url),{createBridge}=require('../service/media-bridge.cjs');
const preview=await openPreview({publicFonts:true});const c=JSON.parse(readFileSync('.local/media-config.json'));c.previewOrigin=preview.baseURL;
const {server}=createBridge(c);await new Promise(r=>server.listen(8766,'127.0.0.1',r));
try{const p=await preview.browser.newPage({viewport:{width:1920,height:1080}});await p.route('http://127.0.0.1:8765/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({apps:[],devices:[]})}));await p.goto(preview.baseURL+'/home/');await p.waitForFunction(()=>ShoreQA.ready()&&ShoreQA.state().continueWatching.count>0);await p.keyboard.press('ArrowDown');await p.waitForFunction(()=>Array.from(document.querySelectorAll('.cw-art img')).every(i=>i.complete&&i.naturalWidth>0));await p.screenshot({path:'output/playwright/continue-live.png'});console.log('Live Plex artwork and progress rendered.');}finally{server.close();await preview.close();}
