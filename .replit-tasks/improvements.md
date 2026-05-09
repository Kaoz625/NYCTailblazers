# Replit Agent Task: NYCTailblazers

## Goal
Update the existing NYC Tailblazers static site with fresh content, a prominent booking CTA button, social media links, and improved SEO meta tags so search engines and social platforms index it correctly.

## Tasks
1. Add a "Book Now" button in the hero/header that links to https://calendly.com/nyctailblazers — make it visually prominent (contrasting color, large font)
2. Update the main headline and subheadline copy to reflect current NYC Tailblazers brand (dog running club, community runs, NYC-focused)
3. Add a social links bar with icons linking to Instagram, TikTok, and X (Twitter) — use real NYC Tailblazers handles if known, otherwise placeholder @nyctailblazers
4. Improve SEO: add `<title>`, `<meta description>`, Open Graph tags (og:title, og:description, og:image, og:url), and Twitter Card tags to index.html
5. Add a canonical `<link rel="canonical">` tag pointing to https://nyctailblazers.com
6. Add structured data (JSON-LD) for LocalBusiness schema with name, address (NYC), and URL
7. Update the `_headers` file (already exists) with Content-Security-Policy and X-Frame-Options headers
8. Ensure all images have descriptive alt text
9. Fix any broken links or 404 references in the HTML
10. Add a simple contact section with email and/or contact form link
11. Minify and optimize HTML/CSS for faster load time

## Tech Stack
- Plain HTML/CSS/JS (static site)
- Cloudflare Pages (already deployed via CNAME)
- No build step required — edits go directly to index.html

## Deploy Target
Cloudflare Pages — already connected to `Kaoz625/NYCTailblazers`. Push to main branch to deploy. Never Vercel.

## Done When
- [ ] "Book Now" button is visible above the fold and links to Calendly
- [ ] All Open Graph and Twitter Card meta tags are present in `<head>`
- [ ] Social links (Instagram, TikTok, X) are in the footer or header
- [ ] JSON-LD LocalBusiness schema is present in `<head>`
- [ ] `_headers` file includes CSP and X-Frame-Options
- [ ] All images have alt text
- [ ] All changes pushed to `Kaoz625/NYCTailblazers` main branch
