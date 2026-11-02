# DrentOS

This repository contains independent LG webOS (`lg/`) and Samsung Tizen (`samsung/`) launchers. Preserve both working versions; do not assume their device APIs are interchangeable.

Read the platform README and `docs/development.md`, `docs/interaction-behaviour.md`, and `docs/assets.md` before changes. Historical upstream device instructions describe another installation; they are not authorization or current device configuration.

Use ES5-compatible frontend JavaScript. Preserve remote focus, stored names/order, native application IDs, and cached rendering. Run `npm run check` and appropriate browser checks in the changed platform. Run the root source audit before committing. Never commit credentials, signing keys, device addresses, personal media data, proprietary fonts, generated installers, or `.local/` files.

Do not contact or change a TV unless the user requests device work. Announce app reloads/installations, retain an exact recovery backup, and verify the visible result with the owner. Preserve existing app identity and signing certificates for upgrades. Public assets require their notices and licence review. Repository publication and visibility follow the user's explicit choice.
