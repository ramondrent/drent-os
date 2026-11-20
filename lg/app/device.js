/* LG webOS platform layer for the shared launcher in core/app. Talks only to the on-TV DrentOS
   loopback services: device control and updates on 8765, the media service on 8766. */
(function () {
  'use strict';
  // CSS.supports(gap) also accepts grid gap on older engines: measure flex once.
  var gapProbe = document.createElement('div');
  gapProbe.style.cssText = 'position:absolute;visibility:hidden;display:flex;flex-direction:column;row-gap:1px';
  gapProbe.appendChild(document.createElement('div'));
  gapProbe.appendChild(document.createElement('div'));
  document.body.appendChild(gapProbe);
  if (gapProbe.scrollHeight !== 1) document.documentElement.classList.add('no-flex-gap');
  document.body.removeChild(gapProbe);

  /* Platform facts read by the shared launcher. App IDs, labels and storage are this platform's own. */
  window.FramePlatform = {
    id: 'webos',
    storageKey: 'cleanframe.webos.v1',
    legacyStorageKeys: [],
    defaultApps: [
      { id: 'appletv', name: 'Apple TV', mark: true, appId: 'com.webos.app.hdmi1' },
      { id: 'com.webos.app.mediadiscovery', name: 'Media Player', mark: false, appId: 'com.webos.app.mediadiscovery' },
      { id: 'com.webos.app.lifeonscreen', name: 'LG Gallery+', mark: false, appId: 'com.webos.app.lifeonscreen' },
      { id: 'com.webos.app.browser', name: 'Web Browser', mark: false, appId: 'com.webos.app.browser' }
    ],
    nativeNames: { 'com.beb.plxnative': { name: 'Plex', replaces: 'PlxNative', always: true } },
    artwork: {},
    iconSource: /^(?:http:\/\/127\.0\.0\.1:8765\/icon\/[\w.-]+$|\/[^\/]|file:\/\/\/)/,
    inputs: ['Inputs', 'tv'],
    systemHome: { name: 'Launcher manager', description: 'Open the launcher manager and recovery controls' },
    iconMarks: { 'io.strem.tv': 'stremio', nlziet: 'nlziet', netflix: 'netflix', amazon: 'primevideo', 'com.disney.disneyplus-prod': 'disneyplus', 'com.apple.appletv': 'appletv', spotify: 'spotify' },
    drawnMarks: { 'com.webos.app.hdmi4': 'playstation', 'youtube.leanback.v4': 'youtube', 'org.webosbrew.hbchannel': 'homebrew', 'com.webos.app.hdmi3': 'windows', 'com.beb.plxnative': 'plex', 'cdp-30': 'plex' }
  };

  var BASE = 'http://127.0.0.1:8765', MEDIA = 'http://127.0.0.1:8766';
  var BRANDS = { netflix: 'netflix', 'youtube.leanback.v4': 'youtube', amazon: 'primevideo', 'com.disney.disneyplus-prod': 'disneyplus', 'com.apple.appletv': 'appletv', 'com.webos.app.hdmi1': 'appletv', spotify: 'spotify' };
  /* The local services accept requests only with the token they write into bridge-token.js.
     It travels in the URL: a custom header would need a preflight an older service rejects. */
  var tokenWaiters = null;
  function token() { return typeof window.DrentBridgeToken === 'string' ? window.DrentBridgeToken : ''; }
  function withToken(url) {
    var t = token();
    return t ? url + (url.indexOf('?') < 0 ? '?' : '&') + 't=' + encodeURIComponent(t) : url;
  }
  /* A service that rejects the token has just rewritten the script. Load it again once;
     done(true) means a different token is now available and the request can be repeated. */
  function reloadToken(used, done) {
    var s, timer, finished = false;
    if (token() !== used) { done(!!token()); return; }
    if (tokenWaiters) { tokenWaiters.push(done); return; }
    tokenWaiters = [done];
    function finish() {
      var waiting = tokenWaiters, changed = !!token() && token() !== used, i;
      if (finished) return;
      finished = true; clearTimeout(timer); tokenWaiters = null;
      if (s.parentNode) s.parentNode.removeChild(s);
      for (i = 0; i < waiting.length; i++) waiting[i](changed);
    }
    s = document.createElement('script');
    s.onload = finish; s.onerror = finish;
    timer = setTimeout(finish, 3000);
    s.src = 'bridge-token.js?r=' + Date.now();
    document.body.appendChild(s);
  }
  window.DrentBridge = { url: withToken, token: token, reload: reloadToken };

  function request(path, payload, done, timeoutMs, retried) {
    var x = new XMLHttpRequest(), finished = false, used = token();
    function finish(err, value) { if (!finished) { finished = true; done(err, value); } }
    x.open(payload === null ? 'GET' : 'POST', withToken(BASE + path), true);
    x.timeout = timeoutMs || 8000;
    x.onload = function () {
      var data;
      try { data = JSON.parse(x.responseText); } catch (e) { finish({message:'Invalid response from the TV service.'}); return; }
      if (x.status === 403 && data.code === 'bridge-token') {
        var rejected = {message:'The TV service did not accept this launcher.', detail:'Restart the TV, or reinstall DrentOS.'};
        if (retried) { finish(rejected); return; }
        reloadToken(used, function (changed) {
          if (changed) request(path, payload, finish, timeoutMs, true);
          else finish(rejected);
        });
        return;
      }
      if (x.status < 200 || x.status >= 300 || data.returnValue === false || data.error) {
        finish({message:'The TV could not complete this action.', detail:String(data.errorText || data.error || x.status)}); return;
      }
      finish(null, data);
    };
    x.onerror = function () { finish({message:'The TV service is unavailable.',detail:'Check that the DrentOS TV service is running.'}); };
    x.ontimeout = function () { finish({message:'The TV did not respond. Please try again.'}); };
    if (payload !== null) x.setRequestHeader('Content-Type','application/json');
    x.send(payload === null ? null : JSON.stringify(payload));
  }
  function launchApp(id, done) {
    if (!/^[\w.-]+$/.test(id)) { done({message:'Invalid app identifier.'}); return; }
    request('/api/launch',{id:id},done);
  }
  function apps(done) {
    request('/api/apps',null,function (err,data) {
      if (err) { done(err); return; }
      var result = (data.apps || []).filter(function (a) { return a.id !== 'com.webos.app.home'; }).map(function (a) {
        return {appId:a.id,name:a.title,brand:BRANDS[a.id] || '',icon:BASE+'/icon/'+encodeURIComponent(a.id)};
      });
      request('/api/inputs',null,function (inputErr,inputs) {
        if (!inputErr) (inputs.devices || []).forEach(function (d) {
          if (!/^com\.webos\.app\.hdmi[1-4]$/.test(d.appId)) return;
          var cec=(d.subList || []).filter(function (s) { return s.osdName; })[0];
          var name=cec ? cec.osdName : d.label || ('HDMI '+d.port);
          result.push({appId:d.appId,name:name,brand:/apple tv/i.test(name) ? 'appletv' : '',icon:''});
        });
        done(null,result);
      });
    });
  }
  /* Media source for the shared shelves and idle aerials: the on-TV media service.
     No account credentials reach this web app. A rejected launcher token is reloaded once. */
  function mediaRequest(path, post, done, retried) {
    var used = token(), x = new XMLHttpRequest();
    x.open(post ? 'POST' : 'GET', withToken(MEDIA + path), true); x.timeout = 30000;
    x.onload = function () {
      var d;
      try { d = JSON.parse(x.responseText); } catch (e) { done('Invalid media response'); return; }
      if (x.status === 403 && d.code === 'bridge-token' && !retried) {
        reloadToken(used, function (changed) { if (changed) mediaRequest(path, post, done, true); else done('Media service unavailable', d); });
        return;
      }
      done(x.status === 200 ? null : d.error || 'Media service unavailable', d);
    };
    x.onerror = function () { done('Plex connection unavailable'); };
    x.ontimeout = function () { done('Plex did not respond. Try again.'); };
    if (post) x.setRequestHeader('X-CleanFrame', '1');
    x.send();
  }
  function aerialConfig(done, retried) {
    var used = token(), x = new XMLHttpRequest();
    x.open('GET', withToken(MEDIA + '/aerial'), true); x.timeout = 8000;
    x.onload = function () {
      try {
        var d = JSON.parse(x.responseText);
        if (x.status === 403 && d.code === 'bridge-token' && !retried) { reloadToken(used, function (changed) { if (changed) aerialConfig(done, true); }); return; }
        if (x.status === 200) done(d);
      } catch (e) {}
    };
    x.send();
  }
  window.FrameMedia = { request: mediaRequest, aerial: aerialConfig, image: function (path) { return MEDIA + path; }, opensDetails: true };

  window.FrameDevice={launchApp:launchApp,launch:function(id,done){launchApp(id,done);},apps:apps,
    art:function(done){launchApp('com.webos.app.homeconnect',done);},
    home:function(done){launchApp('org.webosbrew.hbchannel',done);},
    settings:function(done){launchApp('com.palm.app.settings',done);},
    updateStatus:function(check,done){request('/api/update'+(check?'?check=1':''),null,done,12000);},
    applyUpdate:function(done){request('/api/update',{},done,30000);},
    rollbackUpdate:function(done){request('/api/update/rollback',{},done,15000);},
    /* Start-up diagnostics for the TV service log; the route takes no token and returns nothing. */
    log:function(message){var x=new XMLHttpRequest();x.open('GET',BASE+'/api/log?m='+encodeURIComponent('CleanFrame webOS '+message),true);x.timeout=3000;x.send();}};
}());
