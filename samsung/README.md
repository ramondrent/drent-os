# DrentOS — Samsung edition

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

## LG feature parity (installed; owner validation pending)

The Samsung edition now includes the lower landscape dock, date, app-name editor, three Plex shelves, compact media spacing, cached wallpaper blur on scroll, and Home-only aerial idle mode. It preserves the Freestyle's native app IDs, current signing identity and `cleanframe.home.v1` preferences. The signed update was installed and launched on the Freestyle on 25 October 2026. Browser navigation and direct library reads pass; visible navigation, aerial playback and Samsung Plex playback still require owner confirmation.

Samsung playback launches its own `kIciSQlYEM.plex` application. Its Companion interface accepts `playMedia`; the tested app does not advertise the `mirror` capability and rejects detail-page commands. Accordingly, this edition starts playback rather than opening detail pages. A series selects Plex's On Deck episode, or the first unwatched episode when On Deck is absent. The earlier on-device attempt showed a remote-playback Plex Pass message. The Freestyle is on a separate subnet from Plex, which may explain the classification. Verify actual playback and resolve that network issue if it persists; command acceptance alone is insufficient.

### Direct Plex configuration

The launcher reads Continue Watching and recently added movies/shows directly from your existing Plex server. No companion service, container, Mac process or LG connection is required. Playback uses Plex Companion through that same server and opens the installed Samsung Plex application.

The package builder overlays ignored `.local/runtime-config.json` into the private signed widget. Configure `plex: {url, token, client, player}` with the server URL, authorized Plex token, a unique controller identifier and the Samsung Plex client's identifier. Optional `aerial: {enabled, idleSeconds, urls}` configures idle video. The token is embedded in the private widget, so protect that installer and the local configuration as credentials. It is excluded from source control and public exports; do not publish personal signed builds.

Aerials stream directly and stop on input or loss of focus; Samsung's screensaver is restored when our player stops. Plex and aerial video require their network destinations to remain reachable.

`npm run check:media` validates direct Plex requests, three-shelf navigation, episode selection, resume offsets and Samsung app launching using mocked endpoints. The actual library has also been verified in a local browser. A successful Companion response confirms command acceptance, not visible playback; the projector still needs owner validation.

## Test scope

`check:browser` validates the personalized four-app Freestyle layout at two screen sizes, remote app launching, clock, settings focus and persisted appearance. `check:browser:upstream` retains the larger inherited suite, whose old nine-app fixture and migration expectations currently fail against this customized edition. It is not a passing release gate; adapting that full suite remains future work. No claim of the upstream suite's full coverage is made for this fork.
