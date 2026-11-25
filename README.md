# LaunchLens

Rank pre-token protocols by implied value and get a costed farm plan for each.

**Website:** https://launch-lens-nathanoyewoles-projects.vercel.app/ — static board with a bundled synthetic demo snapshot.

Fallback: https://nathanoyewole.github.io/launch-lens/

No custom domain is configured on GitHub Pages; the Vercel URL is the primary listing.

Domain verification lives at `docs/.well-known/ory-verify.txt`, served from `https://launch-lens-nathanoyewoles-projects.vercel.app/.well-known/ory-verify.txt`. The matching `<meta name="ory-verify">` tag is in `docs/index.html` as a fallback. `docs/.nojekyll` keeps the dot-directory visible on the GitHub Pages fallback.

## What it does

LaunchLens reads a snapshot of protocols and produces a ranked board:

- filters to pre-token protocols, excluding CEXs and versioned pools
- scores implied value from TVL, 7-day change, age, chain count and category
- separates an "early" set below the TVL floor
- keeps already-trading tokens in a separate view
- writes a farm plan for every ranked row: capital, steps, cost, time and hold period
- renders a dependency-free dashboard from `data.js`

The model is deterministic and inspectable in [`lib/model.ts`](lib/model.ts). The site recomputes the score client-side so the number shown can be checked against the board.

## Run it locally

```bash
node scripts/build-demo.mjs
cd docs && python3 -m http.server 8000
# open http://localhost:8000
```

Or generate a full output directory from any compatible snapshot:

```bash
node main.ts --input examples/demo-snapshot.json --output out
```

## Demo data

`examples/demo-snapshot.json` is **synthetic**. The site is a product demo, not research or investment advice. No claims are made about any real protocol.

## Layout

- `lib/model.ts` — scoring model, farm plan derivations, board builder
- `main.ts` — snapshot → `board.json` + `data.js` + dashboard
- `examples/demo-snapshot.json` — bundled synthetic demo input
- `scripts/build-demo.mjs` — rebuilds `docs/data.js`
- `docs/` — static website published to GitHub Pages
- `DESIGN.md` — design tokens and conventions

## Origin

Rebranded from `makefun-token-radar`. Bounty-specific gating, dossier code and vendor files were removed. Core scoring logic retained.
