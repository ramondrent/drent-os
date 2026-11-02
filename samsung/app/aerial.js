/* Home-only idle aerials. No global screensaver settings are changed. */
(function(){
 'use strict';
 var config=null,active=false,starting=false,last=Date.now(),failedUntil=0,clip=0,watchdog=null,lastTime=0,stalledAt=0;
 var video=document.createElement('video');video.id='idleAerial';video.muted=true;video.autoplay=false;video.preload='none';video.setAttribute('playsinline','');video.hidden=true;
 video.style.cssText='position:fixed;left:0;top:0;width:100vw;height:100vh;object-fit:cover;background:#000;z-index:10000';document.body.appendChild(video);
 function home(){return !document.hidden&&document.hasFocus()&&window.ShoreQA&&ShoreQA.ready()&&document.getElementById('stage').classList.contains('at-home');}
 function screensaver(on){try{if(window.webapis&&webapis.appcommon)webapis.appcommon.setScreenSaver(on?'SCREEN_SAVER_ON':'SCREEN_SAVER_OFF',function(){},function(){});}catch(e){}}
 function stop(failed){screensaver(true);active=false;starting=false;video.pause();video.removeAttribute('src');video.load();video.hidden=true;clearTimeout(watchdog);last=Date.now();if(failed)failedUntil=last+300000;}
 function start(){if(!config||!config.urls.length||!home()||active||starting)return false;starting=true;video.hidden=false;video.src=config.urls[clip++%config.urls.length];video.muted=true;stalledAt=Date.now();lastTime=-1;
  watchdog=setTimeout(function(){stop(true);},15000);var p=video.play();if(p&&p.catch)p.catch(function(){stop(true);});return true;}
 video.addEventListener('playing',function(){starting=false;active=true;screensaver(false);clearTimeout(watchdog);stalledAt=Date.now();});
 video.addEventListener('error',function(){if(active||starting)stop(true);});
 video.addEventListener('ended',function(){active=false;starting=false;start();});
 function activity(e){last=Date.now();if(active||starting){stop(false);if(e.type!=='mousemove'){e.preventDefault();e.stopImmediatePropagation();}}}
 ['keydown','pointerdown','mousedown','click','wheel','mousemove'].forEach(function(name){window.addEventListener(name,activity,{capture:true,passive:false});});
 window.addEventListener('blur',function(){if(active||starting)stop(false);});
 document.addEventListener('visibilitychange',function(){if(document.hidden&&(active||starting))stop(false);last=Date.now();});
 setInterval(function(){if(active||starting){if(!home())stop(false);else if(video.currentTime!==lastTime){lastTime=video.currentTime;stalledAt=Date.now();}else if(Date.now()-stalledAt>15000)stop(true);return;}
  if(config&&config.enabled&&home()&&Date.now()>failedUntil&&Date.now()-last>config.idleSeconds*1000)start();
 },1000);
 var d=(window.DrentConfig||window.RamonConfig||{}).aerial;
 if(d&&Array.isArray(d.urls))config={enabled:d.enabled===true,urls:d.urls.filter(function(u){return /^https:\/\//.test(u);}),idleSeconds:Math.max(30,Number(d.idleSeconds)||60)};
 window.DrentAerial=window.RamonAerial={start:start,stop:function(){stop(false);},state:function(){return {configured:!!config&&config.urls.length>0,active:active,starting:starting};}};
}());
