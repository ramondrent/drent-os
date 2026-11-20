"""Build each platform's app/ folder from the shared launcher and that platform's layer.

    core/app/            the launcher every TV runs (edit here)
    <platform>/platform/ what only that TV family needs: device.js, media source, manifest

`python3 tools/build-apps.py` writes lg/app and samsung/app. `--check` only compares and
fails when a built folder differs from its sources, so a change can never reach one TV
family and miss the other. The built folders stay in Git because the LG on-TV updater
copies lg/app straight from the repository archive.
"""
from pathlib import Path
import argparse

ROOT = Path(__file__).resolve().parents[1]
CORE = ROOT / 'core/app'
PLATFORMS = ['lg', 'samsung']
MARKER = '<!-- platform-scripts -->\n'
SNIPPET = 'index-scripts.html'
# Local, ignored additions that packaging or a TV may place inside app/; never built or removed.
LOCAL_ONLY = ('assets/private-fonts/',)
SKIP_NAMES = {'.DS_Store'}


def files(folder):
    return {p.relative_to(folder).as_posix(): p for p in sorted(folder.rglob('*'))
            if p.is_file() and p.name not in SKIP_NAMES}


def expected(platform):
    """Return {relative path: bytes} for one platform's built app."""
    layer = ROOT / platform / 'platform'
    shared, own = files(CORE), files(layer)
    snippet = own.pop(SNIPPET).read_text()
    clash = sorted(set(shared) & set(own))
    if clash:
        raise SystemExit(platform + '/platform repeats shared files; keep one copy in core/app: ' + ', '.join(clash))
    for name, path in list(shared.items()) + list(own.items()):
        if path.is_symlink():
            raise SystemExit('App sources must be regular files, not symlinks: ' + str(path.relative_to(ROOT)))
    built = {name: path.read_bytes() for name, path in shared.items()}
    built.update({name: path.read_bytes() for name, path in own.items()})
    page = built['index.html'].decode()
    if page.count(MARKER) != 1:
        raise SystemExit('core/app/index.html must contain the platform script marker exactly once.')
    built['index.html'] = page.replace(MARKER, snippet).encode()
    return built


def differences(platform, built):
    app = ROOT / platform / 'app'
    present = {name: path for name, path in files(app).items() if not name.startswith(LOCAL_ONLY)} if app.is_dir() else {}
    changed = sorted(name for name in built if name not in present or present[name].read_bytes() != built[name])
    extra = sorted(name for name in present if name not in built)
    return changed, extra


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--check', action='store_true', help='Compare only; fail if a built app differs from its sources.')
    parser.add_argument('platform', nargs='*', help='Limit to these platforms (default: ' + ', '.join(PLATFORMS) + ').')
    args = parser.parse_args()
    unknown = sorted(set(args.platform) - set(PLATFORMS))
    if unknown:
        parser.error('unknown platform: ' + ', '.join(unknown))
    stale = False
    for platform in args.platform or PLATFORMS:
        built = expected(platform)
        changed, extra = differences(platform, built)
        if args.check:
            for name in changed:
                print(platform + '/app/' + name + ' differs from its source')
            for name in extra:
                print(platform + '/app/' + name + ' has no source')
            stale = stale or bool(changed or extra)
            continue
        app = ROOT / platform / 'app'
        for name in changed:
            target = app / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(built[name])
        for name in extra:
            (app / name).unlink()
        print(platform + '/app: ' + (str(len(changed)) + ' written, ' + str(len(extra)) + ' removed' if changed or extra else 'up to date'))
    if stale:
        raise SystemExit('Built apps are out of date. Edit core/app or <platform>/platform, never <platform>/app, '
                         'then run: python3 tools/build-apps.py')
    if args.check:
        print('Built apps match core/app and their platform layers.')


if __name__ == '__main__':
    main()
