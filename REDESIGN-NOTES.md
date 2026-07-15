# NYC Tailblazers — Cinematic Redesign (Candidate)

**Status:** Candidate for review. **The live site (index.html) is NOT changed.**
Built 2026-07-15 by claude-nyc-main. Direction chosen by Markus: **bold & cinematic** (dark + gold).

## Files
- `redesign.html` — new homepage (cinematic dark, gold, Fraunces + Outfit)
- `web-design.html` — NEW "We Build Websites" page (the tab Markus asked for)

## How to preview
1. Open `redesign.html` in a browser (double-click, or drag into Chrome).
2. Click the **Web Design ↗** tab in the nav to see `web-design.html`.
   - Note: the "🐾 Dog Walking" link goes to `index.html`, which is still the OLD site until you promote (step below).

## What's new vs the old site
- Bold cinematic dark theme with glowing gold + forest green (kept your brand colors).
- Real display typography (Fraunces) instead of system font.
- Asymmetric hero, bento service grid, scroll-reveal motion, kinetic marquee, mobile sticky "Book" button.
- **NEW: "The Pack" photo gallery** (placeholder photos — see warning below).
- **NEW: FAQ** (insurance, keys, weather, holidays, meds, emergencies, booking).
- **NEW: Reviews section** with Google/Yelp/Instagram links.
- **NEW: "We Build Websites" page** showcasing your 6 client sites + process + quote CTA.
- **NEW: LocalBusiness + ProfessionalService SEO schema** (JSON-LD) for local search.
- Correct phone everywhere: **(347) 260-8305**.

## ⚠️ Swap these BEFORE relying on the live site
1. **Photos** — the hero + gallery use tasteful *stock* placeholders. Replace with your own dog photos (label says "placeholder"). Showing stock as "our pack" long-term is misleading — swap them.
2. **Formspree endpoint** — form still posts to `formspree.io/f/xwkgvpbz` (carried from old site, unconfirmed). Create a form at formspree.io/new and paste the real ID.
3. **Calendly slug** — uses `calendly.com/nyctailblazers` (unconfirmed). Confirm the real scheduling link.

## Minor polish left (optional)
- Social share image is the square logo (fine, but a 1200×630 banner would preview better).
- A couple of `<h4>` section labels (footer/trust badges) could be re-tagged for stricter heading order.

## How to promote to live (when approved)
```
cd "…/SITES/company/nyctailblazers"
cp index.html "_archive/superseded-$(date +%Y%m%d)-index.html"   # extra safety
mv redesign.html index.html
git add index.html web-design.html
git commit -m "feat: cinematic redesign + We Build Websites page"
git push origin main
```
(web-design.html links use `index.html`, so everything wires up correctly after the rename.)

## Original preserved
- `_archive/original-site-the-beginning/` — the first site ("it was the beginning"), plus full git history.

## QA done this session
Rendered both pages in Chrome (desktop + mobile), checked console, and ran a 6-lens review
(html-integrity, responsive, accessibility, SEO, brand-consistency, design) with adversarial verification.
Fixed: Calendly mobile overflow, sticky-button/footer overlap, 16px inputs (iOS zoom), hero badge
clipping, 44px tap targets, associated form labels, muted-text contrast, keyboard tab-order for the
mobile menu, focus rings, skip-to-content link, removed a fabricated review count from the SEO schema.
