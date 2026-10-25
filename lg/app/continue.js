/* Plex shelf. No account credentials are exposed to this web app. */
(function () {
 'use strict';
 var base='http://127.0.0.1:8766',items=[],index=0,loading=false,loaded=false,error='',busy=false,last=0,notify=function(){},signature='';
 var rowIndex=0,rows=['Continue watching','Recently added movies','Recently added TV shows'].map(function(title,n){
  var root=document.createElement('section');root.id=n?'recentShelf'+n:'continueWatching';root.className='cw cw-row-'+n;root.setAttribute('aria-label',title);document.getElementById('home').appendChild(root);
  return {title:title,root:root,items:[],index:0,signature:'',error:''};
 });
 function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
 function request(path,post,done){var x=new XMLHttpRequest();x.open(post?'POST':'GET',base+path,true);x.timeout=30000;
 x.onload=function(){var d;try{d=JSON.parse(x.responseText);}catch(e){done('Invalid media response');return;}done(x.status===200?null:d.error||'Media service unavailable',d);};
 x.onerror=function(){done('Plex connection unavailable');};x.ontimeout=function(){done('Plex did not respond. Try again.');};if(post)x.setRequestHeader('X-CleanFrame','1');x.send();}
 function refresh(force){if(loading||(!force&&Date.now()-last<60000))return;loading=true;notify();request('/continue',false,function(err,data){loading=false;last=Date.now();loaded=true;
 error=err||(!data.configured?'Connect Plex to see your shows and movies':'');
 if(!err){var selected=items[index]&&items[index].id;items=data.items||[];index=0;items.some(function(i,n){if(i.id===selected){index=n;return true;}return false;});}
 rows[0].items=items;rows[0].index=index;notify();});
 request('/recent',false,function(err,data){for(var n=1;n<3;n++){var row=rows[n],old=row.items[row.index];row.error=err||'';if(!err){row.items=data[n===1?'movies':'shows']||[];row.index=0;row.items.some(function(it,i){if(old&&it.id===old.id){row.index=i;return true;}return false;});}}notify();});}
 function render(active,visible,list){rows.forEach(function(row,n){renderRow(row,n,active&&n===rowIndex,visible,list);});}
 function renderRow(row,n,active,visible,list){
  var root=row.root,items=row.items,index=row.index,error=n?row.error:window.FrameContinue.state().error,signature=row.signature;
  root.hidden=!visible;root.className='cw cw-row-'+n+(list?' cw-list':'');root.style.top=(list?255+(n-rowIndex)*440:920+n*440)+'px';if(!visible)return;
  var nextSignature=JSON.stringify(items),html,track,cards,i,status;
  if(nextSignature!==signature||!root.firstChild){
   row.signature=nextSignature;
   html='<div class="cw-heading"><h2>'+row.title+'</h2><span>Plex</span><span class="cw-scroll-hint"></span></div>';
   if(!items.length)html+='<button class="cw-empty" data-z="continue" data-i="'+(n*100)+'" data-action="continue.retry"><span class="cw-empty-title"></span><small></small></button>';
   else {
    html+='<div class="cw-viewport"><div class="cw-track">';
    items.forEach(function(item,cardIndex){html+='<button class="cw-card" data-z="continue" data-i="'+(n*100+cardIndex)+'" data-action="continue.'+esc(item.id)+'" aria-label="'+esc(item.title+' '+item.subtitle)+'"><div class="cw-art">'+(item.image?'<img src="'+base+esc(item.image)+'" alt="">':'')+'<span class="cw-badge">'+(n?'Details':item.progress>0?'Resume':'Up next')+'</span><span class="cw-progress"><i style="width:'+Math.round(item.progress*100)+'%"></i></span></div><strong>'+esc(item.title)+'</strong><span class="cw-subtitle">'+esc(item.subtitle)+'</span></button>';});
    html+='</div></div>';
   }
   html+='<p class="cw-status" aria-live="polite"></p>';root.innerHTML=html;
  }
  root.querySelector('.cw-scroll-hint').textContent=list?'':active?(n===2?'↑ Previous row':n?'↑ Previous row · ↓ Next row':'↑ Back to apps · ↓ More titles'):'↓ Scroll to watch';
  cards=root.querySelectorAll('.cw-card');
  for(i=0;i<cards.length;i++)cards[i].className='cw-card'+(active&&i===index?' is-focus':'');
  track=root.querySelector('.cw-track');
  if(track)track.style.transform='translateX(-'+(Math.max(0,index-(list?1:3))*372)+'px)';
  if(!items.length){
   root.querySelector('.cw-empty').className='cw-empty'+(active?' is-focus':'');
   root.querySelector('.cw-empty-title').textContent=loading?'Loading your library…':error||(n?'No recent additions':'You’re all caught up');
   root.querySelector('.cw-empty small').textContent=loading?'':error?'Press OK to retry':'Start something in Plex and it will appear here';
  }
  status=active?(busy?'Opening Plex…':error||(items.length?(n?'OK for details in Plex':items[index].remaining+' min'+(items[index].progress>0?' remaining':'')+' · OK to resume in Plex'):'')):'';
  root.querySelector('.cw-status').textContent=status;
 }
 function play(){if(busy)return;var row=rows[rowIndex];if(!row.items.length){refresh(true);return;}var item=row.items[row.index];busy=true;error='';notify();
 request('/play/'+encodeURIComponent(item.id)+(rowIndex?'?action=open':''),true,function(err){busy=false;error=err?err.replace(/PlxNative/g,'Plex'):'';rows[rowIndex].error=error;notify();});}
 window.FrameContinue={render:render,refresh:refresh,onChange:function(fn){notify=fn;},key:function(k){var row=rows[rowIndex];if(k==='up'){if(!rowIndex)return false;rowIndex--;return true;}if(k==='down'){rowIndex=Math.min(2,rowIndex+1);return true;}if(k==='left')row.index=Math.max(0,row.index-1);if(k==='right')row.index=Math.min(Math.max(0,row.items.length-1),row.index+1);if(k==='ok')play();if(!rowIndex)index=row.index;return true;},reset:function(){rowIndex=0;},select:function(i){rowIndex=Math.max(0,Math.min(2,Math.floor(i/100)));var row=rows[rowIndex];row.index=Math.max(0,Math.min(row.items.length-1,i%100));play();},state:function(){return {count:items.length,loading:loading,loaded:loaded,error:error,index:rows[0].index,busy:busy,row:rowIndex};}};
}());
