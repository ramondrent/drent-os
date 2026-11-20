# DrentOS

Your TV, your home screen.

DrentOS is a personal launcher project built on [Nathan Clark's CleanFrame](https://github.com/nthnclrk/CleanFrame), adapted for a Samsung The Freestyle and rooted LG webOS TVs. A quiet home screen with local wallpapers, large app tiles, remote navigation, and no promotional feed.

DrentOS is one launcher for both TV families. The interface and its behaviour are shared; each family adds a thin platform layer for its own device APIs, media source and deployment method.

| Version | Features | Guide |
| --- | --- | --- |
| LG webOS | Landscape app dock, custom app names and monochrome icons, date/clock, scrolling Plex Continue Watching and recent additions, direct native Plex playback, aerial idle mode | [LG setup](lg/README.md) |
| Samsung Tizen | Freestyle launcher, direct Plex shelves, native Plex playback handoff, aerial idle mode, wallpaper/appearance settings | [Samsung setup](samsung/README.md) |

## How the source is organised

| Folder | Contents |
| --- | --- |
| `core/app/` | The launcher itself: layouts, settings, shelves, aerials, styles and assets. A change here reaches every TV. |
| `lg/platform/`, `samsung/platform/` | What only one family needs: `device.js` (device calls and the platform facts the launcher reads), its media source and manifest. |
| `lg/app/`, `samsung/app/` | Built copies of `core/app` plus that platform's layer. Do not edit them. |

After changing `core/app` or a `platform/` folder, rebuild both apps from the repository root and commit the result:

```sh
python3 tools/build-apps.py
```

`npm run check` in either platform fails if a built folder is out of date. The built folders are kept in Git because the LG on-TV updater installs `lg/app` directly from the repository.

A feature is written once in `core/app`. Where a TV family cannot support something, the launcher hides it based on what that platform's `device.js` provides. The on-TV update screen, for example, appears only where the device adapter can install updates, which today is LG.

## Preview locally

Use Node.js 22+, Python 3.10+, and npm. Choose a platform:

```sh
cd lg # or samsung
npm ci
npm run dev:public
```

Open the local URL printed by the preview. Arrow keys, Enter, and Escape emulate the remote. Previewing does not install anything or simulate successful device actions. Public previews use bundled open-license fonts.

## Validate

From the chosen platform directory:

```sh
npm run check
npx playwright install chromium
CLEANFRAME_PUBLIC_FONTS=1 npm run check:browser
```

For LG's media bridge, also run `node scripts/check-media.cjs`. From the repository root, run `python3 tools/audit-source.py` before committing. CI checks both platforms without a TV or account credentials.

## What is included

- The shared launcher source, a platform layer and built app for each TV family, with separate dependency lockfiles.
- Bundled wallpapers, cached glass materials, icons, and public fonts with source notices.
- Browser checks, Plex bridge tests, preview tools, and reference installation/recovery scripts.
- A fresh history for this personal fork. Upstream history remains at the credited source.

Device credentials, certificates, SSH keys, addresses, account tokens, SDK installations, recovery backups, private fonts, and built installers are deliberately kept outside Git. Keep your existing local project folders: their private setup and recovery files are still required for your installed TVs. This repository is not a backup of those secrets.

## Current status

The owner has used both launchers on the named TVs. LG app naming, navigation, landscape layout, custom icons, and the earlier Infuse resume flow received owner feedback. The replacement native Plex resume integration has passed local tests and was installed; visible resume confirmation is still pending. The scroll/glass registration fix also awaits owner confirmation. The owner confirmed aerial playback after 60 seconds, remote wake-up, and the three Plex rows on the LG. The subsequent tighter spacing and blurred media backdrop are installed and await visual feedback.

This is a personal source repository, not a universal installer or replacement TV firmware. LG uses a self-contained DrentOS service and Home bind-mount on a rooted webOS TV; Samsung uses a signed Tizen application. Existing native Home assignments are installation-specific.

## Credits and licensing

Original CleanFrame code is MIT © Nathan Clark; the original notice is retained in [LICENSE](LICENSE). This fork adds Ramon's platform adaptations and customization. Third-party fonts, photos, and logos retain their own terms: [LG notices](lg/THIRD_PARTY_NOTICES.md), [Samsung notices](samsung/THIRD_PARTY_NOTICES.md).

The personal NPO Start and KIJK artwork has no asserted open redistribution licence; review or replace it before making this repository public. Brand marks identify apps and do not imply endorsement. The native Plex client is a separate project, not bundled or claimed as original work here.
