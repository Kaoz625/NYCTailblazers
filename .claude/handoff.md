Working on: nyctailblazers.com cinematic redesign — DONE + LIVE (was: finishing pass after main hit a rate limit).
Last action: Promoted redesign to live and fixed a 2-month-old broken Pages deploy. Verified live at http://www.nyctailblazers.com/.
Status: ✅ COMPLETE. main @ 54cad4f. Pages build = success (first green build since ~May 9). LIVE homepage = cinematic redesign; web-design.html live (HTTP 200); phone (347) 260-8305 now actually live.

What shipped:
- redesign.html → index.html (cinematic dark+gold homepage). Old homepage archived: _archive/superseded-20260715-index.html.
- web-design.html ("We Build Websites") live.
- 24 QA fixes (a11y <main>/skip-link/heading-order/noscript/tap-targets, responsive 1050px nav + mobile Calendly width, SEO meta/schema, header+footer parity).
- Owner decisions applied: stock gallery photos kept (placeholder note removed), reviews+5★ left as-is (already live), "6+ Sites Built".
- DEPLOY FIX (commit 54cad4f): removed 2 phantom submodule gitlinks (portfolio/node_modules/.cache/gh-pages/... and 'stocks') that had broken EVERY Pages build since ~May 9 with "No url found for submodule path ... in .gitmodules". Added .nojekyll + .gitignore.

Verified facts: Formspree xwkgvpbz + Calendly calendly.com/nyctailblazers are REAL (identical to old live). 5/6 client subdomains HTTP 200; gentlemanbrandmanagement = NXDOMAIN → its 3 links commented out (re-enable on deploy).

Open follow-ups (NOT blocking, flagged to team / claude-nyc-tech):
1. HTTPS cert is broken: Pages reports bad_authz (ACME), expires 2026-07-26, https_enforced=false → site serves over HTTP. Needs domain/cert re-verification in repo Pages settings.
2. portfolio/node_modules (~12.5k files) still tracked in git — should be untracked (gitignore now added to prevent new ones).
3. Optional: generate a 1200×630 OG social-preview image (currently square logo).
4. When gentlemanbrandmanagement.nyctailblazers.com deploys, uncomment its 3 links (search "TODO re-enable" in index.html + web-design.html).

Blockers: none.
