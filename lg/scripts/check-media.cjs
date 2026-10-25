const assert=require('assert/strict');const {createBridge}=require('../service/media-bridge.cjs');
(async()=>{
 const calls=[],launches=[];let failLaunch=false;
 const fake=async(base,path,h,body)=>{calls.push({base,path,body});if(path.startsWith('/hubs/'))return {MediaContainer:{Hub:[{Metadata:[{type:'episode',ratingKey:'1',grandparentTitle:'Test',title:'Episode',parentIndex:1,index:2,duration:100,viewOffset:50,thumb:'/library/metadata/1/thumb/42'}]}]}};if(path==='/identity')return {MediaContainer:{machineIdentifier:'test-server'}};throw new Error('Unexpected upstream call');};
 const b=createBridge({plexToken:'SECRET',plexUrl:'http://plex'},fake,async params=>{if(failLaunch)throw new Error('Launch failed');launches.push(params);});await new Promise(r=>b.server.listen(0,'127.0.0.1',r));
 try{const url='http://127.0.0.1:'+b.server.address().port;const d=await (await fetch(url+'/continue')).json();assert.equal(d.items.length,1);assert.equal(d.items[0].progress,.5);assert.equal(d.items[0].playable,true);assert(!JSON.stringify(d).includes('SECRET'));assert(!d.items[0].art);assert.equal(launches.length,0);
 const play=(id,headers={'X-CleanFrame':'1',Origin:'null'})=>fetch(url+'/play/'+id,{method:'POST',headers});
 assert.equal((await play('1',{})).status,403);
 assert.equal((await play('1',{'X-CleanFrame':'1',Origin:'https://evil.example'})).status,403);
 assert.equal(launches.length,0);
 assert.equal((await play('1')).status,200);
 assert.deepEqual(launches,[{server:'test-server',ratingKey:'1',action:'play'}]);
 assert.equal((await play('999')).status,404);assert.equal(launches.length,1);
 failLaunch=true;assert.equal((await play('1')).status,502);
 failLaunch=false;assert.equal((await play('1')).status,200);assert.equal(launches.length,2);
 assert.equal(calls.filter(c=>c.path==='/identity').length,1);
 assert(calls.every(c=>c.base==='http://plex'));
 console.log('PASS: Plex hub/progress, token redaction, origin/POST guards, native server/item/resume handoff without HA or TMDB, launch failure recovery');
 }finally{b.server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
