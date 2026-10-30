# Ramon OS — LG edition

Customized for rooted LG webOS TVs: the original G5 installation runs webOS 25; the CX adaptation runs webOS 5.6.2. `app/` is the launcher frontend; `service/tv-bridge.cjs` provides the local webOS app/input/icon bridge on `127.0.0.1:8765`, and `service/media-bridge.cjs` supplies Plex Continue Watching and native playback requests on `127.0.0.1:8766`.

## Development

```sh
npm ci
npm run dev:public
npm run check
npx playwright install chromium
CLEANFRAME_PUBLIC_FONTS=1 npm run check:browser
node scripts/check-media.cjs
node scripts/check-media-http.cjs
```

The frontend expects the Ramon OS TV service on `127.0.0.1:8765`, and the media bridge on `127.0.0.1:8766`. Browser tests mock those endpoints. No LAN address or account token is embedded in the frontend.

## Plex setup

The bridge automatically detects players on each LG TV, using native app IDs rather than editable names. Official Plex (`cdp-30`) takes priority when installed; otherwise PlxNative (`com.beb.plxnative`, 0.9.0+ with launch links) is selected. Detection runs again on every title activation, so installing/removing an app does not require changing launcher code. Sign into the selected app with the appropriate Plex profile.

Official Plex currently opens the app, with cards labelled **Open Plex**. Selected-title deep links and direct resume are not verified for that client. PlxNative receives the selected title and resumes Continue Watching or opens recent-title details. Missing players and registry failures return explicit errors; a failed launch never silently opens another app. `GET /player` on the loopback media service reports the selected player and capability without requiring a Plex connection.

Copy `service/config.example.json` to `.local/media-config.json`, fill in your server URL, token and client ID, and protect the file with mode 600 in a mode-700 directory. Never commit it. The Plex PIN helper (`scripts/plex-auth.mjs start`, then `poll` after authorization) saves authorization in `.local/plex-auth.json`; create `.local/` first. It does not automatically choose a server or populate the media config.

On the TV, `service/start-media.sh` expects `/media/developer/cleanframe-media/config.json`. The bridge binds only to loopback. It fetches artwork/progress from Plex. For PlxNative, it passes the server's machine identifier, item rating key and `action: play`; official Plex receives an ordinary app launch. No Home Assistant token or Apple TV is needed. Credentials stay server-side; launch parameters carry no account token.

## Deployment boundary

This port is self-contained on a rooted webOS TV at `/media/developer/ramon-os` (`service/tv-bridge.cjs`, `service/stage-home.cjs`, `service/start-home.sh`, `service/reload-home.sh`, `service/undo-home.sh`, and `scripts/stage-home-webos.sh`). Root access (`webosbrew`) is not provisioned by this repository. Do not run the inherited Samsung packaging commands for LG; `app/config.xml` is a retained Tizen artifact, not an LG installer.

In **Settings → TV**, the launcher can check `ramondrent/ramon-os` (`main`) on GitHub and install updates directly on the TV through `service/tv-bridge.cjs` (`GET /api/update`, `POST /api/update`, `POST /api/update/rollback`). Installing an update backs up the previous `app/` directory to `backup/app.prev`, preserves any locally installed `app/assets/private-fonts/` overlay, records the installed commit in `version.json`, re-stages `home-overlay/`, and reloads Home. When `backup/app.prev` is present, **Revert to previous version** restores the prior build.

During QuickStart+ silent boots into `Active Standby`, `service/start-home.sh` preserves the CRIU-preloaded HDMI input (`com.webos.app.hdmi1` / previous input) and updates `/tmp/checkpoint/manager_pid` after restarting `sam` so `com.webos.app.home` is never forced into the foreground during `Active Standby`.

For an established installation, back up the changed files before copying them to `/media/developer/ramon-os`. Every public frontend resource must be readable by the Home renderer (files 644, directories 755); private service configuration stays 600 inside its 700 directory. Run `stage-home.sh`, verify overlay permissions, then `reload-home.sh`. Service changes require restarting `tv-bridge.cjs` or `media-bridge.cjs`. Keep the pre-change files and original native Home configuration (`backup/home-appinfo.orig.json`) for recovery.

`install-webos-local.sh`, `install-media-tv.sh`, and `restore-webos-local.sh` document the installation and migration from older CleanYourTV setups to `/media/developer/ramon-os`. Do not overwrite existing recovery backups. A new TV needs its own root setup and verified recovery baseline.

### Older webOS / CX

The CX uses Node 8.12 and a native LG Home executable. Never copy the G5's Home manifest to another model. `scripts/start-home-webos-native.sh` wraps `start-home.sh` and mounts `home-full-webos-native.sh` over `/usr/bin/com.webos.app.fullhome` in RAM; use it only for the native-Home installation, with the original boot-hook target recorded for recovery.

Frontend flex spacing is feature-detected once; older browsers use sibling margins. Positioning uses explicit edges instead of CSS `inset`, and the remote keyboard retains the older `grid-gap` spelling. Browser checks exercise both spacing paths at 1080p and 720p. The media HTTP client is compatible with Node 8.12; its real HTTP fixture test was also run on the CX. Plex playback still requires a configured server and the compatible native player, independently of installing the launcher. An empty private media config returns an explicit unconfigured state and disables aerial playback.

Keep per-device access, exact Home backups, initial app choices and verification records in ignored `.local/` storage. The stock LG Home can be restored through the backend's `undo-home.sh`; also restore any separately recorded Home-style setting. The CX has both basic and full-screen Home entries, so verify the physical Home button from another app, not just a successful launch API response.

On the verified CX, the physical Home key targets `com.webos.app.fullhome` even when `homeAutoLaunchMode` is `partial`; that setting is not sufficient to redirect it. `home-full-webos-native.sh` retains the fullhome native identity and forwards launch/relaunch to the custom Home. The native boot wrapper mounts this over the fullhome executable in RAM. `undo-home-webos-native.sh`, installed as the backend's `undo-home.sh`, removes that mount before invoking the preserved original `undo-home-upstream.sh`. Preserve both original LG executables before setup. The original Home-mode setting is retained. Owner confirmation of YouTube → physical Home returning to Ramon OS was obtained again after a restart. On the verified cold boot, Homebrew started Ramon OS at approximately 52 seconds; both local services and the Home redirects persisted.

## Notes

User preferences live in `cleanframe.webos.v1` localStorage. Native IDs remain unchanged when apps are renamed. Glass uses precomputed wallpaper materials with scroll compensation, not live blur. Home-only aerial idle playback is available through the media bridge configuration.

The `docs/` directory includes upstream Samsung documentation for design and asset provenance. Its historical device and publication instructions are not the current LG setup. This README takes precedence for platform setup.

## Aerial idle mode and recent Plex rows

When `aerial.enabled` is true, Home starts a full-screen muted clip after `idleSeconds` (minimum 30; configured on the personal TV as 60). Add an `aerial` object to private media config with `enabled`, `idleSeconds`, and `urls` (HTTPS video URLs). Clips rotate after each finishes. No video files are bundled or redistributed. The personal playlist uses Apple-hosted 1080p H.264 streams discovered through the [webOS aerial project](https://github.com/aabytt/custom-screensaver-aerial); rights remain with their owners. Streams require internet access and can consume substantial bandwidth.

The first input dismisses aerial mode without launching an app. Playback stops when Home loses focus or visibility. An error or stalled video returns to Home and backs off for five minutes; LG's stock screensaver remains available. This does not alter global screensaver settings or another app's idle behavior. Browser tests mock media playback. The owner confirmed actual aerial playback and remote wake-up on the LG G5.

Below Continue Watching, recently added movies and TV shows are fetched from each Plex library, sorted by `addedAt`, and limited to 12 per row. Down/Up moves between rows; Back returns to apps. With PlxNative, new titles open their details and Continue Watching resumes directly. With official Plex, both rows open the app and show **Open Plex**.

Media rows use compact spacing and title-only headers. Scrolling into them crossfades to a cached frosted wallpaper with a dark veil; returning to apps restores the sharp image. No live blur runs during scrolling.
