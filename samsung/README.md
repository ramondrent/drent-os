# Ramon OS — Samsung edition

The personalized Tizen version of CleanFrame, with bundled app cards and remote-operated appearance settings. Development and browser previews require no TV.

```sh
npm ci
npm run dev:public
npm run check
npx playwright install chromium
CLEANFRAME_PUBLIC_FONTS=1 npm run check:browser
```

## Installing on an existing TV

Use the original local project and its private Samsung SDK/signing configuration until you deliberately migrate that setup. This repository does not contain the author certificate, passwords, device address or native Home recovery baseline. Preserve the current application/package identity and author certificate when updating the installed app.

`scripts/package.py` and `scripts/tv.py` describe the established signed-widget workflow; SDK and signing files live in ignored `.local/`. `npm run export:public` produces an **unsigned**, public-font widget for review, not an install-ready signed package. Native Home assignment is separate from installation and must retain its exact recovery values.

For a new device, follow the platform setup documentation, using your own credentials and application identity. Do not apply another installation's native Home scripts blindly. The guides in `docs/` originated with upstream's Samsung The Frame; those historical device results do not certify Freestyle compatibility or authorize device changes.

## Assets and preferences

App ordering, appearance and wallpaper preferences are local to the TV. Private paid fonts are excluded from this repository. NPO Start and KIJK cards are personal-use assets without an asserted open redistribution license; see `THIRD_PARTY_NOTICES.md` before publishing them.

## LG feature parity (prepared; device validation pending)

The Samsung edition now includes the lower landscape dock, date, app-name editor, three Plex shelves, compact media spacing, cached wallpaper blur on scroll, and Home-only aerial idle mode. It preserves the Freestyle's native app IDs, current signing identity and `cleanframe.home.v1` preferences. These changes are prepared locally; they have not yet been validated on the projector.

Samsung playback launches its own `kIciSQlYEM.plex` application. Its Companion interface accepts `playMedia`; the tested app does not advertise the `mirror` capability and rejects detail-page commands. Accordingly, this edition starts playback rather than opening detail pages. A series selects Plex's On Deck episode, or the first unwatched episode when On Deck is absent. Actual playback is currently blocked by the Freestyle being classified as remote on its separate subnet; resolve network classification and verify playback before claiming completion.

### Private deployment configuration

The package builder optionally overlays `.local/runtime-config.json` into the private widget. It can contain `mediaBase`, a dedicated `accessKey`, and `aerial: {enabled, idleSeconds, urls}`. Keep it out of source control. Public exports omit this overlay. The Plex account token stays in the backend, not in the frontend. Aerials stream directly and stop on input or loss of focus; Samsung's screensaver is restored when our player stops.

### Media service

`service/media-bridge.cjs` runs on a trusted always-on LAN host. Copy `service/config.example.json` to an ignored `config.json`, supplying Plex credentials, the Samsung Plex client identifier, and a random access key of at least 32 characters. A matching frontend key gates the shelf/artwork/playback requests. Do not expose the service to the internet.

The supplied Dockerfile and Compose file run a read-only, unprivileged container on port 8767. The mounted config must be readable by container UID 1000 (and protected from other host users). Review `compose.yaml`, then run `docker compose up -d --build` on the chosen host. Hosting on the Mac is suitable only for development; do not claim an independent installation while it depends on the Mac.

`npm run check:media` covers server data and Samsung command construction. `check:browser` also checks authenticated shelf navigation and Samsung-only app launching. A successful Companion response confirms command acceptance, not visible playback.

## Test scope

`check:browser` validates the personalized four-app Freestyle layout at two screen sizes, remote app launching, clock, settings focus and persisted appearance. `check:browser:upstream` retains the larger inherited suite, whose old nine-app fixture and migration expectations currently fail against this customized edition. It is not a passing release gate; adapting that full suite remains future work. No claim of the upstream suite's full coverage is made for this fork.
