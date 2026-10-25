# Ramon OS — LG edition

Customized for a rooted LG G5 running webOS 25. `app/` is the launcher frontend; `service/media-bridge.cjs` supplies Plex Continue Watching and native playback requests.

## Development

```sh
npm ci
npm run dev:public
npm run check
npx playwright install chromium
CLEANFRAME_PUBLIC_FONTS=1 npm run check:browser
node scripts/check-media.cjs
```

The frontend expects CleanYourTV's existing local backend on `127.0.0.1:8765`, and the media bridge on `127.0.0.1:8766`. Browser tests mock those endpoints. No LAN address or account token is embedded in the frontend.

## Plex setup

The launcher labels the player **Plex**. Its installed native application ID is `com.beb.plxnative` (PlxNative 0.9.0 or newer with launch links). Sign into that app with the appropriate Plex profile first.

Copy `service/config.example.json` to `.local/media-config.json`, fill in your server URL, token and client ID, and protect the file with mode 600 in a mode-700 directory. Never commit it. The Plex PIN helper (`scripts/plex-auth.mjs start`, then `poll` after authorization) saves authorization in `.local/plex-auth.json`; create `.local/` first. It does not automatically choose a server or populate the media config.

On the TV, `service/start-media.sh` expects `/media/developer/cleanframe-media/config.json`. The bridge binds only to loopback. It fetches artwork/progress from Plex and launches the native player using the server's machine identifier, item rating key and `action: play`. No Home Assistant token or Apple TV is needed. Credentials stay server-side; launch parameters carry no account token.

## Deployment boundary

This port uses the **existing** CleanYourTV backend and native Home overlay at `/media/developer/cleanyourtv`. Those dependencies and root access are not provisioned by this repository. Do not run the inherited Samsung packaging commands for LG; `app/config.xml` is a retained Tizen artifact, not an LG installer.

For an established installation, back up the changed frontend files before copying them to `app/`. Every public frontend resource must be readable by the Home renderer (files 644, directories 755); private service configuration stays 600 inside its 700 directory. Run the existing `stage-home.sh`, verify overlay permissions, then `reload-home.sh`. Service changes require restarting the existing media service. Keep the pre-change files and original native Home configuration for recovery.

`install-webos-local.sh`, `install-media-tv.sh`, and `restore-webos-local.sh` document the original installation. They have fixed staging/backup paths and are not unattended update scripts. Do not overwrite existing recovery backups. A new TV needs its own root/backend setup and verified recovery baseline.

## Notes

User preferences live in `cleanframe.webos.v1` localStorage. Native IDs remain unchanged when apps are renamed. Glass uses precomputed wallpaper materials with scroll compensation, not live blur. Home-only aerial idle playback is available through the media bridge configuration.

The `docs/` directory includes upstream Samsung documentation for design and asset provenance. Its historical device and publication instructions are not the current LG setup. This README takes precedence for platform setup.

## Aerial idle mode and recent Plex rows

When `aerial.enabled` is true, Home starts a full-screen muted clip after `idleSeconds` (minimum 30; configured on the personal TV as 60). Add an `aerial` object to private media config with `enabled`, `idleSeconds`, and `urls` (HTTPS video URLs). Clips rotate after each finishes. No video files are bundled or redistributed. The personal playlist uses Apple-hosted 1080p H.264 streams discovered through the [webOS aerial project](https://github.com/aabytt/custom-screensaver-aerial); rights remain with their owners. Streams require internet access and can consume substantial bandwidth.

The first input dismisses aerial mode without launching an app. Playback stops when Home loses focus or visibility. An error or stalled video returns to Home and backs off for five minutes; LG's stock screensaver remains available. This does not alter global screensaver settings or another app's idle behavior. Browser tests mock media playback; decoder compatibility and the absence of LG's clock require on-TV verification.

Below Continue Watching, recently added movies and TV shows are fetched from each Plex library, sorted by `addedAt`, and limited to 12 per row. Down/Up moves between rows; Back returns to apps. New titles open their details in Plex; Continue Watching resumes directly.
