Working on: nyctailblazers.com cinematic redesign — DONE, LIVE, and VERIFIED.
Last action: Promoted redesign to live, fixed a 2-month-old broken Pages deploy, and fixed a public-exposure issue from .nojekyll. All verified against http://www.nyctailblazers.com/.
Status: ✅ COMPLETE. main @ 80afbc7. Pages build = success. Live homepage = cinematic redesign; web-design.html live; phone (347) 260-8305 now actually live for the first time.

What shipped (in order):
1. 959092c — promote: redesign.html → index.html (cinematic homepage) + web-design.html live. Old homepage archived to _archive/superseded-20260715-index.html. Owner decisions applied: stock gallery photos kept (placeholder note removed), reviews+5★ left as-is (already on live), "6+ Sites Built".
   (Preceded by 3af8de2 = 24 QA fixes, cefc1e1 = content edits.)
2. 54cad4f — fix broken Pages deploy: removed 2 phantom submodule gitlinks (portfolio/node_modules/.cache/gh-pages/... and 'stocks') that failed EVERY build since ~May 9 ("No url found for submodule path ... in .gitmodules"). Added .gitignore.
3. 80afbc7 — replaced .nojekyll with Jekyll + _config.yml exclude, because .nojekyll had published internal files (/REDESIGN-NOTES.md, /.claude/handoff.md were HTTP 200). Now those return 404; site pages still 200.

Verified live: /, /web-design.html, /petition.html, /dogrun-proposal.html all 200; cinematic title live; internal docs + node_modules + _archive all 404.

Open follow-ups (NOT blocking; flagged to team / claude-nyc-tech):
1. HTTPS cert broken: Pages reports bad_authz (ACME), expires 2026-07-26, https_enforced=false → site serves over HTTP. Needs domain/cert re-verification in repo Pages settings.
2. portfolio/node_modules (~12.5k files) still tracked in git (now .gitignored + excluded from deploy, but still bloats the repo) — worth `git rm -r --cached`.
3. Optional: generate a 1200×630 OG social image (currently square logo).
4. When gentlemanbrandmanagement.nyctailblazers.com deploys, uncomment its 3 links (grep "TODO re-enable" in index.html + web-design.html).
5. Other Kaoz625 Pages client sites may have the same phantom-gitlink deploy bug — worth auditing.

Blockers: none.
