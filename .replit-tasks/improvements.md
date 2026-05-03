# Replit Agent Task Spec

## Instructions for Replit Agent
You are building/improving this project. Read this file carefully before touching any code.
Commit all changes with prefix "replit: " and push to main when done.
When all tasks are complete, fill out .replit-tasks/RESULTS.md and commit+push.

## Stack Rules (non-negotiable)
- Static → Cloudflare Pages (never Vercel)
- DB → Supabase self-hosted Docker (never cloud Supabase)
- Auth → NextAuth.js (free, not Auth0/Clerk)
- AI → Claude Sonnet 4.6 via Anthropic API (model: claude-sonnet-4-6)
- Payments (adult) → CCBill or Segpay only

## Improvements To Make
1. **Review all content for accuracy** — Read every HTML page (index, disclaimer, privacy, terms, proposal, petition). Fix any outdated info, broken links, placeholder text, or incorrect business details. Business name: NYC Tailblazers. Domain: www.nyctailblazers.com.
2. **Add booking button** — Add a prominent "Book Now" button on index.html that opens Calendly (https://calendly.com/nyctailblazers or similar free Calendly link) in a modal or new tab. Button should appear in the hero section AND in the nav.
3. **Add social media links** — Add clickable Instagram, Facebook, and TikTok icons/links for @NYCTailblazers to both the header nav and footer of index.html (and any other pages that have a nav/footer). Use inline SVG icons or Font Awesome CDN.
4. **Improve SEO meta tags** — Add/update these meta tags on ALL pages: `<meta name="description">`, `<meta property="og:title">`, `<meta property="og:description">`, `<meta property="og:image">`, `<meta name="twitter:card">`. Main title: "NYC Tailblazers — Dog Walking & Pet Care in New York City".
5. **Ensure all pages load correctly** — Check that all href links between pages work (no 404s). Verify images load (check src paths). Fix any broken references.
6. **Add service pricing section** — If index.html doesn't have clear pricing, add a simple pricing table: 30-min walk $25, 60-min walk $40, group walk $20, drop-in $20, overnight $75/night.
7. **Mobile responsiveness** — Add a viewport meta tag if missing. Check index.html renders properly on mobile (375px). Add basic responsive CSS if needed.
8. **Add Cloudflare Pages deployment note** — Add a comment block at the top of index.html and a note in README.md explaining this site is deployed via Cloudflare Pages (NOT GitHub Pages going forward). Keep the CNAME file as-is.

## Do Not Touch
- CNAME file (needed for custom domain www.nyctailblazers.com)
- tailblazers-logo.png
- The petition.html and dogrun-proposal.html pages (community content, leave as-is)

## Definition of Done
- [ ] All improvements implemented and working
- [ ] No broken links between pages
- [ ] Booking button present and links to Calendly
- [ ] Social media links in header/footer on all pages
- [ ] SEO meta tags on all pages
- [ ] Site renders on mobile (375px)
- [ ] Pushed to main with "replit: " commit prefix
