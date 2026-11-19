const assert=require('assert');const {createBridge}=require('../service/media-bridge.cjs');
function fetch(url,options={}){return new Promise((resolve,reject)=>{
 const req=require('http').request(Object.assign(require('url').parse(url),options),res=>{
  let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,json:()=>Promise.resolve(JSON.parse(body))}));
 });req.on('error',reject);req.end();
});}
(async()=>{
 const calls=[],launches=[];let failLaunch=false,discoveryFails=false,apps=[{id:'com.beb.plxnative'}];
 const fake=async(base,path,h,body)=>{calls.push({base,path,body});if(path.startsWith('/hubs/'))return {MediaContainer:{Hub:[{Metadata:[{type:'episode',ratingKey:'1',grandparentTitle:'Test',title:'Episode',parentIndex:1,index:2,duration:100,viewOffset:50,thumb:'/library/metadata/1/thumb/42'}]}]}};if(path==='/library/sections')return {MediaContainer:{Directory:[{key:'1',type:'movie'},{key:'2',type:'show'}]}};if(path.startsWith('/library/sections/'))return {MediaContainer:{Metadata:[{ratingKey:path.includes('/1/')?'10':'20',type:path.includes('/1/')?'movie':'show',title:'New title',addedAt:100,art:'/library/metadata/10/art/42'}]}};if(path==='/identity')return {MediaContainer:{machineIdentifier:'test-server'}};throw new Error('Unexpected upstream call');};
 const b=createBridge({plexToken:'SECRET',plexUrl:'http://plex'},fake,async params=>{if(failLaunch)throw new Error('Launch failed');launches.push(params);},async()=>{if(discoveryFails)throw new Error('offline');return apps;});await new Promise(r=>b.server.listen(0,'127.0.0.1',r));
 try{const url='http://127.0.0.1:'+b.server.address().port;const d=await (await fetch(url+'/continue')).json();assert.equal(d.items.length,1);assert.equal(d.items[0].progress,.5);assert.equal(d.items[0].playable,true);assert(!JSON.stringify(d).includes('SECRET'));assert(!d.items[0].art);assert.equal(launches.length,0);
 const play=(id,headers={'X-CleanFrame':'1',Origin:'null'})=>fetch(url+'/play/'+id,{method:'POST',headers});
 assert.equal((await play('1',{})).status,403);
 assert.equal((await play('1',{'X-CleanFrame':'1',Origin:'https://evil.example'})).status,403);
 assert.equal(launches.length,0);
 assert.equal((await play('1')).status,200);
 assert.deepEqual(launches,[{id:'com.beb.plxnative',params:{plex:{server:'test-server',ratingKey:'1',action:'play'}}}]);
 assert.equal((await play('999')).status,404);assert.equal(launches.length,1);
 failLaunch=true;assert.equal((await play('1')).status,502);
 failLaunch=false;assert.equal((await play('1')).status,200);assert.equal(launches.length,2);
 const recent=await (await fetch(url+'/recent')).json();assert.equal(recent.movies[0].id,'10');assert.equal(recent.shows[0].id,'20');assert.equal((await play('20')).status,200);assert.deepEqual(launches[launches.length-1],{id:'com.beb.plxnative',params:{plex:{server:'test-server',ratingKey:'20',action:'open'}}});
 assert.equal(calls.filter(c=>c.path==='/identity').length,1);
 assert(calls.every(c=>c.base==='http://plex'));
 // Selection is independent of the cached library and refreshed at every click.
 apps=[{id:'cdp-30'},{id:'com.beb.plxnative'}];
 let status=await (await fetch(url+'/continue')).json();
 assert.equal(status.player.id,'cdp-30');assert.equal(status.items[0].playbackMode,'app');
 assert.equal((await play('1')).status,200);
 assert.deepEqual(launches[launches.length-1],{id:'cdp-30',params:{}});
 apps=[{id:'cdp-30'}];assert.equal((await play('20')).status,200);
 const before=launches.length;
 apps=[];assert.equal((await play('1')).status,409);assert.equal(launches.length,before);
 status=await (await fetch(url+'/continue')).json();assert.equal(status.playbackConfigured,false);assert.equal(status.items[0].playable,false);
 discoveryFails=true;assert.equal((await play('1')).status,503);assert.equal(launches.length,before);
 status=await (await fetch(url+'/player')).json();assert(status.playerError);assert.equal(status.player,null);
 discoveryFails=false;apps=[{id:'com.beb.plxnative',title:'My alias'}];assert.equal((await play('1')).status,200);
 assert.equal(launches[launches.length-1].id,'com.beb.plxnative');
 assert(!JSON.stringify(launches).includes('SECRET'));
 // A rebinding page reaches the loopback address under its own hostname.
 assert.equal((await fetch(url+'/continue',{headers:{Host:'attacker.example'}})).status,403);
 assert.equal((await fetch(url+'/continue',{headers:{Host:'localhost:8766'}})).status,200);
 // Launcher token: required once the installed launcher loads the token script.
 const fs=require('fs'),root=fs.mkdtempSync(require('path').join(require('os').tmpdir(),'drent-media-'));
 try{
  fs.mkdirSync(root+'/app');fs.writeFileSync(root+'/app/index.html','<script src="bridge-token.js"></script>');
  const token='ab'.repeat(24);fs.writeFileSync(root+'/bridge-token',token+'\n');
  const guarded=createBridge({plexToken:'SECRET',plexUrl:'http://plex',launcherRoot:root},fake,async params=>{launches.push(params);},async()=>[{id:'com.beb.plxnative'}]);
  await new Promise(r=>guarded.server.listen(0,'127.0.0.1',r));
  try{
   const g='http://127.0.0.1:'+guarded.server.address().port,count=launches.length,h={'X-CleanFrame':'1',Origin:'null'};
   // A sandboxed frame on any website also has the null origin, but not the token.
   let denied=await fetch(g+'/continue',{headers:{Origin:'null'}});assert.equal(denied.status,403);assert.equal((await denied.json()).code,'bridge-token');
   for(const path of ['/recent','/player','/aerial','/continue?t='+'0'.repeat(48)])assert.equal((await fetch(g+path)).status,403);
   assert.equal((await fetch(g+'/play/1',{method:'POST',headers:h})).status,403);assert.equal(launches.length,count);
   assert.equal((await fetch(g+'/play/1',{method:'OPTIONS',headers:{Origin:'null'}})).status,204);
   assert.equal((await (await fetch(g+'/continue?t='+token)).json()).items.length,1);
   assert.equal((await fetch(g+'/play/1?t='+token,{method:'POST',headers:h})).status,200);assert.equal(launches.length,count+1);
   assert.equal((await fetch(g+'/play/20?action=open&t='+token,{method:'POST',headers:h})).status,200);
   assert.notEqual((await fetch(g+'/art/1')).status,403);
  }finally{guarded.server.close();}
  // A launcher that predates the token keeps working with the earlier origin guard.
  fs.writeFileSync(root+'/app/index.html','<!doctype html>');
  const legacy=createBridge({plexToken:'SECRET',plexUrl:'http://plex',launcherRoot:root},fake,async()=>{},async()=>[]);
  await new Promise(r=>legacy.server.listen(0,'127.0.0.1',r));
  try{assert.equal((await fetch('http://127.0.0.1:'+legacy.server.address().port+'/continue')).status,200);}finally{legacy.server.close();}
 }finally{require('child_process').execFileSync('/bin/rm',['-rf',root]);}
 console.log('PASS: Plex progress, credential isolation, request guards, launcher token, both players, install/removal, discovery errors, per-click routing and recovery');
 }finally{b.server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
