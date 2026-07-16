Working on: nyctailblazers.com multi-venture expansion — v1 built + verified, STAGED on branch redesign-cinematic (commit 2e9afb3). NOT live yet (awaiting Markus review, per his choice).
Live right now (main): the earlier cinematic redesign + Venmo @kaoz625 fix (89f4f4f). Everything below is on the branch only.

What v1 adds (staged):
- Homepage: leads with mission/about-us greeting (veterans + at-risk youth + service dogs) + 7-venture grid; new nav + multi-venture footer. Brand green -> royal emerald-jade (#0b5e46 / --green-lit #45cf9a).
- New pages: dog-training.html, personal-training.html (coming-soon stubs), vendor-resale.html (NYS Directive 4911 packages, launching soon), jiggs-and-glo.html (Book One, request CTA), 3d-printing.html (shop coming-soon + custom-commission via reference images), dog-run.html (rebuilt petition: sectioned-run case, proposal SUMMARY only, Supabase sign form).
- web-design.html: showcase = 7 live clients (nzurient neutral label, GBM via github.io) + AJ's coming-soon.
- petition.html + dogrun-proposal.html -> redirect to dog-run.html (full proposal removed from public site).
- Ran a de-slop pass on all 8 pages (removed AI-writing tells).
- Verified in Chrome: no overflow, single h1 each, consistent nav/footer, all internal links resolve.

NEEDS MARKUS:
1. Review v1 (open the files locally — they Syncthing-sync to your Macs — or say the word and I promote to live).
2. Petition DB: create a Supabase project + run _setup/signatures.sql + paste URL/anon key into dog-run.html CONFIG block (see _setup/PETITION-SETUP.md). Until then the form falls back to Formspree (xwkgvpbz).
3. Real photos: homepage hero + "The Pack" gallery are still Unsplash stock. 3D-printing gallery + Jiggs cover are styled placeholders (no real art yet).

TO PROMOTE (when Markus approves): merge/fast-forward redesign-cinematic -> main:
  git push origin redesign-cinematic:main
(Pages deploys from main/root; build is green since the phantom-submodule fix.)

Other open follow-ups (pre-existing): HTTPS cert bad_authz on Pages (expires 2026-07-26, site on HTTP) -> claude-nyc-tech; portfolio/node_modules still git-tracked (gitignored now); other Kaoz625 Pages sites may share the phantom-gitlink deploy bug.
Blockers: none.
