# LaunchLens — Changelog

## Interaction fix, 25 November 2026

- Fixed the `el()` event helper: it previously ignored `onClick()` wrappers, so tab buttons, sort headers, row clicks and detail dialog did not respond.
- `dashboard/app.js` and `docs/app.js` both updated and rebuilt from the same source.

## Vercel deployment, 25 November 2026

- Linked `NathanOyewole/launch-lens` to Vercel with `docs/` as the root directory.
- Disabled Vercel Authentication so the public URL is reachable.
- Primary website is now `https://launch-lens-nathanoyewoles-projects.vercel.app/`.
- `README.md` documents the Vercel URL and keeps the github.io fallback.
- GitHub Pages custom domain setup remains in place but is no longer the primary path.

## Custom domain, 25 November 2026

- Added `docs/CNAME` for `launchlens.pxxl.click`.
- Set GitHub Pages custom domain to `launchlens.pxxl.click` so Orynth sees a domain separate from Eval Diff.
- `README.md` documents the new primary URL and keeps the github.io fallback.

Required DNS: `CNAME launchlens.pxxl.click -> nathanoyewole.github.io` (Cloudflare proxy off initially).

## Rebrand and public site, 25 November 2026

- Renamed `makefun-token-radar` to **LaunchLens**.
- Removed make.fun badges, owner file, dossier vendor code and screenshot gating.
- Simplified `main.ts` to snapshot → board + data + dashboard, with no bounty gate.
- Added `examples/demo-snapshot.json` and `scripts/build-demo.mjs`.
- Rebranded dashboard strings and palette: amber accent, blue flag, dark investigative theme.
- Added static site in `docs/`, generated from the bundled demo snapshot.
- Added `docs/favicon.svg`, `favicon.ico` and `apple-touch-icon.png`.
- Added `DESIGN.md`, `README.md` and this changelog.
- MODEL_VERSION changed from `radar-2` to `lens-1`.
- Corrected stale footer copy that still referenced 758 DefiLlama protocols; the public board now states it uses a synthetic demo snapshot.

Demo data is synthetic. No real protocols are scored in the public site.
