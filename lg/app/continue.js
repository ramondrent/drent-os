/* Plex shelf. No account credentials are exposed to this web app. */
(function () {
 'use strict';
 var base='http://127.0.0.1:8766',items=[],index=0,loading=false,loaded=false,error='',busy=false,last=0,notify=function(){},signature='';
 var root=document.createElement('section');root.id='continueWatching';root.className='cw';root.setAttribute('aria-label','Continue watching');document.getElementById('home').appendChild(root);
 function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
 function request(path,post,done){var x=new XMLHttpRequest();x.open(post?'POST':'GET',base+path,true);x.timeout=30000;
 x.onload=function(){var d;try{d=JSON.parse(x.responseText);}catch(e){done('Invalid media response');return;}done(x.status===200?null:d.error||'Media service unavailable',d);};
 x.onerror=function(){done('Plex connection unavailable');};x.ontimeout=function(){done('Plex did not respond. Try again.');};if(post)x.setRequestHeader('X-CleanFrame','1');x.send();}
 function refresh(force){if(loading||(!force&&Date.now()-last<60000))return;loading=true;notify();request('/continue',false,function(err,data){loading=false;last=Date.now();loaded=true;
 error=err||(!data.configured?'Connect Plex to see your shows and movies':'');
 if(!err){var selected=items[index]&&items[index].id;items=data.items||[];index=0;items.some(function(i,n){if(i.id===selected){index=n;return true;}return false;});}
 notify();});}
 function render(active,visible,list){
  root.hidden=!visible;root.className='cw'+(list?' cw-list':'');if(!visible)return;
  var nextSignature=JSON.stringify(items),html,track,cards,i,status;
  if(nextSignature!==signature||!root.firstChild){
   signature=nextSignature;
   html='<div class="cw-heading"><h2>Continue watching</h2><span>Plex</span><span class="cw-scroll-hint"></span></div>';
   if(!items.length)html+='<button class="cw-empty" data-z="continue" data-i="0" data-action="continue.retry"><span class="cw-empty-title"></span><small></small></button>';
   else {
    html+='<div class="cw-viewport"><div class="cw-track">';
    items.forEach(function(item,n){html+='<button class="cw-card" data-z="continue" data-i="'+n+'" data-action="continue.'+esc(item.id)+'" aria-label="'+esc(item.title+' '+item.subtitle)+'"><div class="cw-art">'+(item.image?'<img src="'+base+esc(item.image)+'" alt="">':'')+'<span class="cw-badge">'+(item.progress>0?'Resume':'Up next')+'</span><span class="cw-progress"><i style="width:'+Math.round(item.progress*100)+'%"></i></span></div><strong>'+esc(item.title)+'</strong><span class="cw-subtitle">'+esc(item.subtitle)+'</span></button>';});
    html+='</div></div>';
   }
   html+='<p class="cw-status" aria-live="polite"></p>';root.innerHTML=html;
  }
  root.querySelector('.cw-scroll-hint').textContent=list?'':active?'↑ Back to apps':'↓ Scroll to watch';
  cards=root.querySelectorAll('.cw-card');
  for(i=0;i<cards.length;i++)cards[i].className='cw-card'+(active&&i===index?' is-focus':'');
  track=root.querySelector('.cw-track');
  if(track)track.style.transform='translateX(-'+(Math.max(0,index-(list?1:3))*372)+'px)';
  if(!items.length){
   root.querySelector('.cw-empty').className='cw-empty'+(active?' is-focus':'');
   root.querySelector('.cw-empty-title').textContent=loading?'Loading your library…':error||'You’re all caught up';
   root.querySelector('.cw-empty small').textContent=loading?'':error?'Press OK to retry':'Start something in Plex and it will appear here';
  }
  status=busy?'Opening Plex…':error||(active&&items.length?(items[index].remaining+' min'+(items[index].progress>0?' remaining':'')+' · OK to resume in Plex'):(list ? '→ Continue watching' : '↓ Continue watching'));
  root.querySelector('.cw-status').textContent=status;
 }
 function play(){if(busy)return;if(!items.length){refresh(true);return;}var item=items[index];busy=true;error='';notify();
 request('/play/'+encodeURIComponent(item.id),true,function(err){busy=false;error=err?err.replace(/PlxNative/g,'Plex'):'';notify();});}
 window.FrameContinue={render:render,refresh:refresh,onChange:function(fn){notify=fn;},key:function(k){if(k==='left')index=Math.max(0,index-1);if(k==='right')index=Math.min(Math.max(0,items.length-1),index+1);if(k==='ok')play();},select:function(i){index=Math.max(0,Math.min(items.length-1,i));play();},state:function(){return {count:items.length,loading:loading,loaded:loaded,error:error,index:index,busy:busy};}};
}());
