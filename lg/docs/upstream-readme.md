# CleanFrame for this LG webOS setup

Adapted from nthnclrk/CleanFrame and the local Freestyle customization. The Samsung checkout is unchanged.

The frontend uses CleanYourTV's existing loopback service on port 8765 for app discovery, icons, HDMI inputs and launches. Inputs opens LG Home Hub; the TV settings group opens LG Settings or the CleanYourTV manager. Samsung Art Mode is not implemented. All photography, registered glass materials and public fonts are bundled. Preferences use a separate `cleanframe.webos.v1` localStorage key.

Run `npm run check` and `node scripts/check-webos.mjs` for resource validation and browser integration checks. Browser tests mock the TV service and do not contact the TV. Previews are in `output/playwright/`.

The deployment adapts CleanYourTV's stage-home script to copy nested assets and retains its existing Home mount and boot hooks. It saves the previous launcher in `/media/developer/cleanyourtv/backup/before-cleanframe`. Recovery on the TV: `sh /media/developer/cleanyourtv/restore-cleanframe.sh`. The previous app metadata is retained for backend compatibility; this does not make this frontend an upstream CleanYourTV release. An upstream launcher/service update may replace this customization; coordinate updates with this port.

Native Samsung packaging and setup scripts inherited from the source are not applicable to this LG port. Do not run them against this TV.

## Plex Continue Watching / Infuse

The Home shelf reads Plex through `service/media-bridge.cjs`, a Node 16-compatible service bound to TV loopback port 8766. Account credentials stay in a mode-600 configuration file inside a mode-700 directory outside the web app. The bridge exposes sanitized Continue Watching metadata, library artwork and a fixed Home Assistant playback action. It does not expose arbitrary URLs or HA actions. Keep server addresses and account tokens in ignored `.local/media-config.json`; never package this file with the frontend.

Movies use their TMDB ID; episodes use the **series** TMDB ID plus season/episode. Infuse library deep links include `?play`. The frontend switches to HDMI 1 only after HA accepts the request. HA acceptance does not prove actual playback, and tvOS may show an “Open in Infuse?” prompt. Infuse must contain the corresponding library item. Playback position remains managed by Infuse/Plex, not a custom video player.

The row refreshes every minute while Home is visible, with a 30-second server cache. Artwork comes from Plex. Offline errors retain the last loaded cards; an empty list shows an honest empty state. Down from Dock enters the row, Left/Right selects, OK sends playback, and Up/Back returns to Dock. Up from Dock reaches Home controls. In List layout, Right enters the shelf. Focus alone never starts playback.

Validation: `npm run check`, `CLEANFRAME_PUBLIC_FONTS=1 npm run check:browser`, and `node scripts/check-media.cjs`. Browser tests use mock data and do not control devices. `scripts/preview-media.mjs` explicitly reads the private configuration for an optional real-library screenshot; it does not play media.

The deployment baseline for this addition is `/media/developer/cleanyourtv/backup/before-plex-shelf`. Restore the pre-shelf CleanFrame UI with `sh /media/developer/cleanframe-media/restore.sh`. This removes the new bridge boot hook and stops its process; the older stock-Home and pre-CleanFrame recovery remain separate. Do not rerun the initial installer over an existing baseline.

Device validation: bridge returned eight playable entries and artwork HTTP 200; Home was foreground after reload. Owner confirmed a non-autoplay link opened the correct Family Guy episode in Infuse. End-to-end autoplay/resume and persistence after a full TV reboot require owner confirmation.

### Shelf performance revision

The first on-TV shelf trial caused freezing; rollback restored normal behavior. The revised renderer preserves card/image DOM nodes during focus movement, and the bridge requests/caches 640×360 Plex thumbnails rather than passing through original artwork. Regression tests exercise repeated navigation and assert image-node identity. A real Family Guy image decreased from 936,110 to 52,038 bytes; the resized endpoint returned HTTP 200 on the TV. No kernel OOM/crash evidence was found in the inspected messages. These changes address identified inefficiencies, not a proven single root cause. The revised build is under owner testing with media autostart temporarily disabled.

The subsequent TV inspection identified a concrete startup failure: `continue.js` was mode 600 because the deployment shell used umask 077 for credential protection. The non-root Home renderer could not read it. The frontend file is now explicitly mode 644 in both app and mounted overlay; the service configuration remains mode 600 inside a mode-700 directory. The installer was corrected. Main now degrades to the ordinary app dock if the media script fails to load; browser regression coverage explicitly aborts that script and verifies apps and Home controls remain usable. After deployment the actual TV renderer logged `CleanFrame webOS ready media=loaded`. This supersedes the initial assumption that rendering load alone explained the startup symptom.

Final owner verification: Continue Watching cards and remote navigation work, and selecting the Family Guy episode resumes playback in Infuse. The media bridge boot hook was re-enabled after this confirmation. Full cold-boot behavior has not yet been physically tested. The Mac setup form has been stopped; the deployed integration needs only the TV, Plex server, Home Assistant and Apple TV.

App titles can now be customized under Settings → App names with a remote keyboard. Aliases are stored separately from native app metadata in localStorage, survive discovery/reload and do not change launch IDs. The Dock sits above Continue Watching: Down enters the media row, Up/Back returns to apps, Up from apps reaches Home controls. Browser checks cover alias persistence, cancel/default, empty names, storage failures and launch-ID preservation.

The app-name/layout deployment backed up its predecessor in `/media/developer/cleanyourtv/backup/before-app-names`. Restore `main.js`, `style.css` and `continue.js` from that directory to `app/`, run `stage-home.sh`, then `reload-home.sh` to revert this frontend update while retaining Plex integration. Actual TV startup reported `media=loaded` after the update.

Home now shows the TV's local date beneath the clock. In Dock layout, Continue Watching starts partially below the bottom edge. Down or wheel-down reveals it; Up/Back returns to the apps. The transition respects reduced-motion preferences. Date/year rollover, clipped/revealed card bounds, wheel navigation, existing media actions and naming regression checks passed at 1920×1080 and 1280×720. Deployment backup: `/media/developer/cleanyourtv/backup/before-date-scroll` (main.js, style.css, continue.js). The TV reported successful renderer initialization after this update.
