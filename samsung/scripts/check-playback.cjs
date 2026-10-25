const assert=require('node:assert/strict');
const {samsungPlayback}=require('../service/media-bridge.cjs');
(async()=>{
 const calls=[];let reject=false;
 const call=async(base,path,h,body,binary)=>{calls.push({path,h,body});
  if(path.startsWith('/library/metadata/'))return {MediaContainer:{Metadata:[{type:'episode',ratingKey:'20',viewOffset:45000}]}};
  if(path.startsWith('/security/token'))return {MediaContainer:{token:'TRANSIENT'}};
  if(path.startsWith('/playQueues'))return {MediaContainer:{playQueueID:7}};
  if(path.startsWith('/player/playback/playMedia'))return {data:Buffer.from('<Response code="'+(reject?'400':'200')+'"/>')};
  throw Error('Unexpected call');
 };
 const play=samsungPlayback({plexUrl:'http://plex:32400',plexToken:'SECRET',plexClient:'ramon',samsungClient:'freestyle'},call);
 await play({ratingKey:'20',server:'server-id'});
 const sent=calls.at(-1),url=new URL(sent.path,'http://plex');
 assert.equal(sent.h['X-Plex-Target-Client-Identifier'],'freestyle');assert.equal(url.searchParams.get('offset'),'45000');assert.equal(url.searchParams.get('token'),'TRANSIENT');assert.equal(url.searchParams.get('key'),'/library/metadata/20');assert.equal(url.searchParams.get('containerKey'),'/playQueues/7?window=100&own=1');
 reject=true;await assert.rejects(play({ratingKey:'20',server:'server-id'}),/rejected/);
 console.log('PASS: Samsung target, saved resume offset, server queue, temporary token, rejected-command handling');
})().catch(e=>{console.error(e);process.exit(1);});
