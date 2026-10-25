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

The LG-specific Plex Continue Watching service is not part of this Samsung version.

## Test scope

`check:browser` validates the personalized four-app Freestyle layout at two screen sizes, remote app launching, clock, settings focus and persisted appearance. `check:browser:upstream` retains the larger inherited suite, whose old nine-app fixture and migration expectations currently fail against this customized edition. It is not a passing release gate; adapting that full suite remains future work. No claim of the upstream suite's full coverage is made for this fork.
