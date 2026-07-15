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

## ✅ Resolved during the 2026-07-15 finishing pass (claude-nyc-owner)
- **Formspree endpoint** — `formspree.io/f/xwkgvpbz` is **byte-identical to the live index.html** → it IS the real production form. No swap needed.
- **Calendly slug** — `calendly.com/nyctailblazers` is **identical to live** → real. No swap needed.
- **Accessibility** — added `<main>` landmark + fixed skip-link target (both pages), heading order (h4→h3, zero skipped levels), `<noscript>` reveal fallback (content visible with JS off), 32px social tap targets, `aria-controls` on the menu button.
- **Responsive** — aligned both pages to a single 1050px nav breakpoint (kills the 941–1050px nav wrap), added a ≤480px rule so the Calendly widget keeps usable width on small phones, fixed the trust-badge orphan-grid.
- **SEO** — trimmed both meta descriptions to ~155–160 chars, fixed og:url trailing slash, added a PostalAddress to the web-design JSON-LD.
- **Consistency** — web-design.html now has the same header social icons + a 3-column footer matching the homepage.
- **Dead link** — `gentlemanbrandmanagement.nyctailblazers.com` is **NXDOMAIN**. Its 3 references (footer link, teaser chip, work card) are **commented out** (not deleted) with a `TODO re-enable when deployed` note. The other 5 client sites all return HTTP 200.
- Verified in Chrome (desktop 1280 + mobile): no console errors, no horizontal overflow, all sections render.

## ⚠️ Still needs a Markus decision BEFORE full launch
1. **Photos** — hero + "The Pack" gallery use tasteful *stock* placeholders. The gallery still carries a visible "(Placeholder photos…)" note that should not ship to real visitors. Send real dog photos, or decide to keep stock (note removed) / hide the gallery.
2. **Testimonials + "5★ Average Rating"** — 3 named reviews (Jessica R./Marcus T./Aisha P.) + the rating. NOTE: these are **already on the current live site**, so promoting adds no new risk — but if they aren't from real customers, address on both.
3. **"6+ Sites Launched"** (web-design.html, NEW claim) — some linked demos have placeholder 555 numbers; consider "6+ Sites Built" or a real client count.
4. **OG social image** — still the square logo. A 1200×630 banner previews better (offered — can generate on request).

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
