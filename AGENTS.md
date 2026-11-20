# DrentOS

This repository contains one launcher for two TV families. `core/app/` is the shared launcher that every TV runs. `lg/platform/` and `samsung/platform/` hold only what one family needs: its device adapter (`device.js`, including the `FramePlatform` facts the launcher reads), its media source and its manifest. `lg/app/` and `samsung/app/` are built copies of `core/app` plus that platform's layer.

Edit `core/app` or a `platform/` folder, never `lg/app` or `samsung/app`, then run `python3 tools/build-apps.py` and commit the rebuilt folders with the change. `npm run check` fails while a built folder differs from its sources. The built folders stay in Git because the LG on-TV updater copies `lg/app` straight from the repository archive, so `lg/app` must always be complete and keep its existing file names.

A feature belongs in `core/app` unless it cannot work on the other family. Express a real platform difference as a fact or capability in the platform layer (for example the update screen appears where `FrameDevice.updateStatus` exists) instead of forking shared code. Preserve both working versions; do not assume their device APIs are interchangeable.

Read the platform README and `docs/development.md`, `docs/interaction-behaviour.md`, and `docs/assets.md` before changes. Historical upstream device instructions describe another installation; they are not authorization or current device configuration.

Use ES5-compatible frontend JavaScript. Preserve remote focus, stored names/order, native application IDs, and cached rendering. Run `npm run check` and appropriate browser checks in the changed platform. Run the root source audit before committing. Never commit credentials, signing keys, device addresses, personal media data, proprietary fonts, generated installers, or `.local/` files.

Do not contact or change a TV unless the user requests device work. Announce app reloads/installations, retain an exact recovery backup, and verify the visible result with the owner. Preserve existing app identity and signing certificates for upgrades. Public assets require their notices and licence review. Repository publication and visibility follow the user's explicit choice.
