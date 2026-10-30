/* LG webOS adapter. Talks only to the on-TV Ramon OS loopback service. */
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

  var BASE = 'http://127.0.0.1:8765';
  var BRANDS = { netflix: 'netflix', 'youtube.leanback.v4': 'youtube', amazon: 'primevideo', 'com.disney.disneyplus-prod': 'disneyplus', 'com.apple.appletv': 'appletv', 'com.webos.app.hdmi1': 'appletv', spotify: 'spotify' };
  function request(path, payload, done, timeoutMs) {
    var x = new XMLHttpRequest(), finished = false;
    function finish(err, value) { if (!finished) { finished = true; done(err, value); } }
    x.open(payload === null ? 'GET' : 'POST', BASE + path, true);
    x.timeout = timeoutMs || 8000;
    x.onload = function () {
      var data;
      try { data = JSON.parse(x.responseText); } catch (e) { finish({message:'Invalid response from the TV service.'}); return; }
      if (x.status < 200 || x.status >= 300 || data.returnValue === false || data.error) {
        finish({message:'The TV could not complete this action.', detail:String(data.errorText || data.error || x.status)}); return;
      }
      finish(null, data);
    };
    x.onerror = function () { finish({message:'The TV service is unavailable.',detail:'Check that the Ramon OS TV service is running.'}); };
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
  window.FrameDevice={launchApp:launchApp,launch:function(id,done){launchApp(id,done);},apps:apps,
    art:function(done){launchApp('com.webos.app.homeconnect',done);},
    home:function(done){launchApp('org.webosbrew.hbchannel',done);},
    settings:function(done){launchApp('com.palm.app.settings',done);},
    updateStatus:function(check,done){request('/api/update'+(check?'?check=1':''),null,done,12000);},
    applyUpdate:function(done){request('/api/update',{},done,30000);},
    rollbackUpdate:function(done){request('/api/update/rollback',{},done,15000);}};
}());
