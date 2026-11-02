/* Direct Plex client for the private Samsung widget; no companion service. */
(function(){
 'use strict';
 var c=(window.DrentConfig||window.RamonConfig||{}).plex||{},command=0;
 function query(values){return Object.keys(values).map(function(k){return encodeURIComponent(k)+'='+encodeURIComponent(values[k]);}).join('&');}
 function call(path,method,raw){return new Promise(function(resolve,reject){
  if(!c.url||!c.token){reject(new Error('Connect Plex to see your library'));return;}
  var x=new XMLHttpRequest();x.open(method||'GET',c.url.replace(/\/$/,'')+path,true);x.timeout=20000;
  var h={'Accept':raw?'application/xml':'application/json','X-Plex-Token':c.token,'X-Plex-Client-Identifier':c.client||'drent-os-freestyle','X-Plex-Product':'DrentOS','X-Plex-Version':'1.0','X-Plex-Device':'DrentOS','X-Plex-Device-Name':'Freestyle Home','X-Plex-Platform':'Tizen','X-Plex-Provides':'controller'};
  if(raw)h['X-Plex-Target-Client-Identifier']=c.player;
  Object.keys(h).forEach(function(k){x.setRequestHeader(k,h[k]);});
  x.onload=function(){if(x.status<200||x.status>=300){reject(new Error('Plex request failed ('+x.status+')'));return;}try{resolve(raw?x.responseText:JSON.parse(x.responseText));}catch(e){reject(new Error('Invalid Plex response'));}};
  x.onerror=function(){reject(new Error('Plex connection unavailable'));};x.ontimeout=function(){reject(new Error('Plex did not respond'));};x.send();
 });}
 function item(i){var duration=Number(i.duration)||0,offset=Number(i.viewOffset)||0,art=(i.type==='episode'?i.thumb:i.art)||i.thumb;
  return {id:String(i.ratingKey),title:i.type==='episode'?(i.grandparentTitle||i.title):i.title,subtitle:i.type==='episode'?'S'+i.parentIndex+' · E'+i.index+' — '+i.title:String(i.year||''),progress:duration?Math.max(0,Math.min(1,offset/duration)):0,remaining:Math.max(0,Math.ceil((duration-offset)/60000)),added:Number(i.addedAt)||0,type:i.type,image:art?c.url.replace(/\/$/,'')+'/photo/:/transcode?'+query({url:art,width:640,height:360,minSize:1,upscale:0,'X-Plex-Token':c.token}):null};}
 function valid(i){return /^\d+$/.test(String(i.ratingKey));}
 function recent(){return call('/library/sections').then(function(d){return Promise.all((d.MediaContainer.Directory||[]).filter(function(s){return /^(movie|show)$/.test(s.type)&&/^\d+$/.test(s.key);}).map(function(s){return call('/library/sections/'+s.key+'/all?'+query({type:s.type==='movie'?1:2,sort:'addedAt:desc','X-Plex-Container-Start':0,'X-Plex-Container-Size':12})).then(function(d){return (d.MediaContainer.Metadata||[]).filter(valid).map(item);});}));}).then(function(groups){var all=[].concat.apply([],groups).sort(function(a,b){return b.added-a.added;});return {movies:all.filter(function(i){return i.type==='movie';}).slice(0,12),shows:all.filter(function(i){return i.type==='show';}).slice(0,12)};});}
 function play(id){if(!/^\d+$/.test(id)||!c.player)return Promise.reject(new Error('Samsung Plex player is not configured'));
  var selected,server,token;
  return call('/library/metadata/'+id+'?includeOnDeck=1').then(function(d){selected=(d.MediaContainer.Metadata||[])[0];if(!selected)throw new Error('Title unavailable');if(selected.type!=='show')return;
   var next=selected.OnDeck&&selected.OnDeck.Metadata&&selected.OnDeck.Metadata[0];if(next){selected=next;return;}
   return call('/library/metadata/'+id+'/allLeaves').then(function(d){var list=d.MediaContainer.Metadata||[];selected=list.filter(function(i){return !i.viewCount;})[0]||list[0];});
  }).then(function(){if(!selected||!valid(selected)||!/^(movie|episode)$/.test(selected.type))throw new Error('No playable episode');return call('/identity');}).then(function(d){server=d.MediaContainer.machineIdentifier;return call('/security/token?type=delegation&scope=all');}).then(function(d){token=d.MediaContainer.token;if(!token)throw new Error('Plex authorization failed');return call('/playQueues?'+query({uri:'server://'+server+'/com.plexapp.plugins.library/library/metadata/'+selected.ratingKey,type:'video',shuffle:0,repeat:0,includeChapters:1,includeRelated:1}),'POST');}).then(function(d){
   var u=document.createElement('a');u.href=c.url;var queue=d.MediaContainer.playQueueID;if(!queue)throw new Error('Plex queue unavailable');
   // Queue the network request before switching apps; no background JS timer is required.
   var pending=call('/player/playback/playMedia?'+query({key:'/library/metadata/'+selected.ratingKey,containerKey:'/playQueues/'+queue+'?window=100&own=1',machineIdentifier:server,providerIdentifier:'com.plexapp.plugins.library',type:'video',address:u.hostname,port:u.port||32400,protocol:u.protocol.replace(':',''),token:token,offset:selected.viewOffset||0,commandID:++command}),null,true);
   return new Promise(function(resolve,reject){FrameDevice.launchApp('kIciSQlYEM.plex',function(err){if(err)reject(new Error(err.message||'Could not open Plex'));});pending.then(function(result){if(!/code="200"/.test(result))throw new Error('Plex did not accept playback');resolve({ok:true});}).catch(reject);});
  });
 }
 window.FramePlex={request:function(path,post,done){var p;if(path==='/continue')p=call('/hubs/continueWatching?count=12').then(function(d){var m=d.MediaContainer,raw=m.Metadata||[].concat.apply([],(m.Hub||[]).map(function(h){return h.Metadata||[];}));return {configured:true,items:raw.filter(valid).slice(0,12).map(item)};});else if(path==='/recent')p=recent();else if(/^\/play\/\d+$/.test(path))p=play(path.slice(6));else p=Promise.reject(new Error('Unknown Plex action'));p.then(function(d){done(null,d);}).catch(function(e){done(e.message);});}};
}());
