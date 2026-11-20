/* Samsung Tizen platform layer for the shared launcher in core/app. Public Tizen application
   APIs only: no Mac server, network address or credentials. */
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
    id: 'tizen',
    storageKey: 'cleanframe.home.v1',
    legacyStorageKeys: ['cleanframe.shore.v1'],
    defaultApps: [
      { id: 'kIciSQlYEM.plex', name: 'Plex', mark: false, appId: 'kIciSQlYEM.plex' },
      { id: 'youtube', name: 'YouTube', mark: true, appId: '9Ur5IzDKqV.TizenYouTube' },
      { id: 'iquaePhaki.npostart', name: 'NPO Start', mark: false, appId: 'iquaePhaki.npostart' },
      { id: '8H24TM2DAH.kijk', name: 'KIJK', mark: false, appId: '8H24TM2DAH.kijk' }
    ],
    nativeNames: { 'kIciSQlYEM.plex': { name: 'Plex', replaces: 'PlxNative', always: true }, 'org.tizen.tv-viewer': { name: 'HDMI', replaces: 'tv-viewer' } },
    /* Match native IDs so catalogue refreshes and saved app order keep their artwork. */
    artwork: { 'kIciSQlYEM.plex': 'plex', '9Ur5IzDKqV.TizenYouTube': 'youtube', 'iquaePhaki.npostart': 'npo-start', '8H24TM2DAH.kijk': 'kijk' },
    iconSource: /^(?:\/[^\/]|file:\/\/\/|wgt-package:\/\/\/)/,
    inputs: ['Art Mode', 'art'],
    systemHome: { name: 'Samsung Home', description: 'Open Samsung’s Home screen' },
    iconMarks: {},
    drawnMarks: { 'org.tizen.tv-viewer': 'hdmi', '9Ur5IzDKqV.TizenYouTube': 'youtube', 'kIciSQlYEM.plex': 'plex' }
  };

  var IDS = {
    stremio: 'IkWsFHtOY9.Stremio', netflix: 'org.tizen.netflix-app',
    disneyplus: 'MCmYXNxgcu.DisneyPlus', youtube: '9Ur5IzDKqV.TizenYouTube',
    appletv: 'com.samsung.tv.aria-video', primevideo: 'org.tizen.primevideo',
    abciview: 'mWK87Xghap.ABCiview', sbs: 'OyE7OuxlUi.SBSOnDemand',
    applemusic: 'org.tizen.apple.apple-music'
  };
  var STREAMING = ['as6cYRgkPy.Binge', '73iTZRTc34.Stan', '5b8c3eb16b.BeamCTVDev',
    'KaLitts8bq.tenplaySamsungTizen', 'eYuOiOLYQX.KayoSports', 'Ne2ZsPWdKl.9NOW',
    '3KA0pm7a7V.TubiTV', 'rJeHak5zRg.Spotify', 'icp4AvUPiA.7plus',
    'evKhCgZelL.AmazonIgnitionLauncher2'];
  var CONSUMER_SYSTEM = ['org.tizen.browser', 'com.microsoft.copilot', 'org.tizen.tv-viewer'];
  var EXTRA_BRANDS = {
    'rJeHak5zRg.Spotify': 'spotify', '5b8c3eb16b.BeamCTVDev': 'hbomax', '3KA0pm7a7V.TubiTV': 'tubi',
    'evKhCgZelL.AmazonIgnitionLauncher2': 'primevideo', 'RN1MCdNq8t.Netflix': 'netflix'
  };
  var INTERNAL = ['adplatform.ADPlayer', 'WykOS4t4F0.cmsWebApp', '25emanual3.emanual',
    'ZODRT12q2l.WebAccountExtension', 'ByJlgt0XeD.CastSettingsApp', 'tv6pbVMQFF.PrivacyChoices',
    'OjBS9h5ZF9.emanual', 'jLU2jKvbyN.PrivacyChoices', 'JGHCDI7ctc.SmartTV',
    'w2VwCK465D.OTApp', 'aQjWjLsPaO.MultiScreenWebLauncher', '8GWN8M2GAC.juke'];
  var SELF = 'zolvT6pDD0.FreestyleHome';
  function api() { return window.tizen && window.tizen.application; }
  function unavailable(done) {
    done({ message: 'Open CleanFrame on the TV to use this control.', detail: 'The web preview cannot control the TV.' });
  }
  function failure(err) {
    return { message: 'The TV could not open this screen.', detail: err && (err.message || err.name) || 'Try again, or press the remote’s Home button to return to CleanFrame.' };
  }
  function bounded(done) {
    var finished = false, timer = setTimeout(function () { finish({ message: 'The TV did not respond. Please try again.' }); }, 8000);
    function finish(err, value) { if (finished) return; finished = true; clearTimeout(timer); done(err, value); }
    return finish;
  }
  function launchApp(id, done) {
    if (!api()) { unavailable(done); return; }
    var finish = bounded(done);
    try {
      api().launch(id, function () { finish(null); }, function (err) {
        if (id === 'org.tizen.tv-viewer') {
          try { api().launch('org.tizen.SMSourceAPP', function () { finish(null); }, function () { finish(failure(err)); }); return; }
          catch (_) {}
        }
        finish(failure(err));
      });
    }
    catch (err) { finish(failure(err)); }
  }
  function launch(brand, done) {
    if (!IDS[brand]) { done({message: 'This app has no launch target.'}); return; }
    launchApp(IDS[brand], done);
  }
  function art(done) {
    if (!api()) { unavailable(done); return; }
    var finish = bounded(done);
    try {
      var data = [new tizen.ApplicationControlData('mode', ['fullscreen']), new tizen.ApplicationControlData('requester', ['mobile'])];
      var control = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/default', null, null, null, data);
      api().launchAppControl(control, 'org.tizen.art-app', function () { finish(null); }, function (err) {
        try { api().launch('org.tizen.SMSourceAPP', function () { finish(null); }, function () { finish(failure(err)); }); }
        catch (_) { finish(failure(err)); }
      });
    } catch (err) { finish(failure(err)); }
  }
  function home(done) { launchApp('com.samsung.tv.csfs', done); }
  function settings(done) {
    if (!api()) { unavailable(done); return; }
    var finish = bounded(done);
    try {
      api().launch('com.samsung.tv.coba.setting', function () { finish(null); }, function (err) {
        try { api().launch('org.tizen.menu', function () { finish(null); }, function () { finish(failure(err)); }); }
        catch (_) { finish(failure(err)); }
      });
    } catch (err) { finish(failure(err)); }
  }
  function apps(done) {
    if (!api()) { unavailable(done); return; }
    var finish = bounded(done);
    try {
      api().getAppsInfo(function (list) {
        var known = {}, seen = {}, result = [];
        Object.keys(IDS).forEach(function (brand) { known[IDS[brand]] = brand; });
        list.forEach(function (a) {
          var primary = !!known[a.id], stream = STREAMING.indexOf(a.id) >= 0;
          var consumer = /^[A-Za-z0-9]{10}\.[A-Za-z0-9_-]+$/.test(a.id) || CONSUMER_SYSTEM.indexOf(a.id) >= 0;
          if (a.id === SELF || INTERNAL.indexOf(a.id) >= 0 || seen[a.id] || !a.name || (!primary && !stream && (!a.show || !consumer))) return;
          if (!primary && /(?:service|worker|preview|promotion|plugin|launcher|test|sdk|^ep[ -]|factory|daemon)/i.test(a.name + ' ' + a.id)) return;
          if (/-dummy$/.test(a.id) || a.id === 'com.samsung.tv.cobalt-yt') return;
          seen[a.id] = true;
          result.push({ appId: a.id, name: a.name, brand: known[a.id] || EXTRA_BRANDS[a.id] || '', icon: a.iconPath || '', rank: primary ? Object.keys(IDS).indexOf(known[a.id]) : (stream ? 20 : 30) });
        });
        result.sort(function (a, b) { return a.rank - b.rank || a.name.toLowerCase().localeCompare(b.name.toLowerCase()); });
        finish(null, result);
      }, function (err) { finish(failure(err)); });
    } catch (err) { finish(failure(err)); }
  }
  window.FrameDevice = { launch: launch, launchApp: launchApp, art: art, home: home, settings: settings, apps: apps };
}());
