# Montgomery County edition: preview notes

November 7, 2026. Working copy of Sites v5 (`site/sites-v5`, commit `3782b738…`) retargeted to Montgomery County HVAC owners and operators, starting in ZIP 20814. Local preview only: no publish and no DNS change.

## Run it

Use Node 24 (`~/.nvm/versions/node/v24.19.0`).

```bash
npm run build && npm test && npm run dev
```

Open `http://127.0.0.1:4173`. Use `127.0.0.1`, not `localhost`: the forms' same-origin check expects that exact origin.

## What changed from v5

- **Homepage** (`public/index.html`): same layout, classes, and type, with new copy for the county edition. The local desk carries the 20814 finding.
- **Briefing** at `/montgomery-county/20814/beps-briefing/` (entry `briefing20814` in `content/field-notes.json`). Figures are `{{tokens}}` filled from `content/briefing-20814.json` at build time.
- **New protected download:** `moco-20814-beps-data-sheet` (generated). The resident guides are still downloadable but no longer featured. The four-ZIP and evidence worksheets are now featured.
- **Evidence:** `evidence/20814/` holds the November 7 county exports used, with `SHA256SUMS.txt`. `scripts/briefing-20814.mjs` builds the figures and the data sheet from them.
- **Tests:** `scripts/test-briefing.mjs` fails the build if any published figure drifts from the county-derived figures, if an unreviewed external link appears, or if the data sheet doesn't unlock through the consent-separated flow.
- **Unchanged:** Worker, database schema and migrations, consent text, rate limiting, owner export. A few CSS rules were added at the end of `styles.css` using the v5 tokens.

## Not done (launch steps)

- The origin is still the Sites hostname in canonicals, schema, sitemap, and `prepare-content.mjs`. Noindex and `Disallow: /` remain in place. Set the final origin, canonicals, form origin, and crawler policy together at launch.
- No email provider is connected. Newsletter requests stay `pending_confirmation`, and the copy says no email will arrive.
- The admin route still relies on Sites identity headers. A Cloudflare Worker port needs host-verified owner auth first, or the admin and export routes disabled.
- Semantic Gate not run. Run it against the real public hostname and query after release.
- The resident guide pages and the older editorial pages still exist at their routes. Decide whether to keep, redirect, or hand them to DMV Heat Pumps.
