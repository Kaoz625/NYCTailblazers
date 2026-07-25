# nyctb-checkout — Stripe Checkout + digital fulfillment worker

Cloudflare Worker behind the 3D Studio cart and the Jiggs & Glo book page. It
creates Stripe Checkout Sessions (prices are authoritative here — the client only
sends sku/qty/note) and, when someone buys the $8 Digital PDF, it emails them a
time-limited download link automatically. No secret lives in this repo.

- Deployed URL: https://nyctb-checkout.markususeche.workers.dev
- Stripe: LIVE mode, account `acct_1TvMWMDLIJEjTQ1o`

## Routes

| Route | Purpose |
|---|---|
| `GET /` | health check |
| `POST /create-checkout-session` | `{source, items:[{sku,qty,note}]}` → `{url, id}` |
| `POST /stripe-webhook` | Stripe events. Signature-verified. Fulfills digital SKUs. |
| `GET /download?token=…` | streams a paid PDF out of R2 against an HMAC token |

## Secrets (Worker secrets — never in git)

Set with `wrangler secret put <NAME>` from inside this directory.

| Name | What it is |
|---|---|
| `STRIPE_SECRET_KEY` | live `sk_live_…`, creates Checkout Sessions and reads line items |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from the Stripe webhook endpoint, verifies every webhook |
| `BREVO_API_KEY` | `xkeysib-…`, **preferred** sender — see "Email delivery" below |
| `RESEND_API_KEY` | fallback sender, used only when `BREVO_API_KEY` is absent |
| `DOWNLOAD_SIGNING_KEY` | HMAC key for `/download` links |

The provider is chosen at runtime by which key is present — setting `BREVO_API_KEY`
switches delivery over with no code change and no redeploy of logic.

Source values live in `~/.credentials/api-keys.env` (`STRIPE_SECRET_KEY_NYCTB_LIVE`,
`RESEND_API_KEY`). `DOWNLOAD_SIGNING_KEY` is a random 32-byte hex string with no
copy anywhere else — **rotating it instantly kills every download link already
emailed**, which is the intended way to revoke a leaked link.

## Plain vars (`[vars]` in wrangler.toml — safe in git)

| Name | Current value | Notes |
|---|---|---|
| `MAIL_FROM_BREVO` | `NYC Tailblazers <info@nyctailblazers.com>` | used when sending via Brevo, where the domain IS authenticated |
| `MAIL_FROM` | `NYC Tailblazers <onboarding@resend.dev>` | Resend fallback only; must stay on `resend.dev` — see below |
| `MAIL_REPLY_TO` | `info@nyctailblazers.com` | where buyer replies go |
| `OWNER_EMAIL` | `nyctailblazers@nyctailblazers.com` | gets the "manual send needed" alert |
| `PUBLIC_BASE_URL` | the workers.dev URL | used to build download links |
| `DOWNLOAD_TTL_DAYS` | `30` | link lifetime |

## R2 binding

```toml
[[r2_buckets]]
binding = "ASSETS"
bucket_name = "nyctb-assets"
```

The bucket is **private**: public access is off and there is no custom domain, so
the PDF is not reachable at any guessable URL. It holds two things:

- `books/jiggs-and-glo-book-01.pdf` — the product
- `fulfilled/<session_id>.json` — one small marker per fulfilled order

The markers are the idempotency record. Stripe retries webhooks; the worker
claims a session id with a conditional `put` before it sends anything, so a retry
can never produce a second email. A marker reads
`{"status":"sent","skus":[…],"to":…,"email_id":…}`, or `"needs_manual_send"` when
the buyer address bounced.

## Re-sending a buyer's link after 30 days

There is no admin endpoint for this on purpose — a re-issue route would be a
second thing to secure. Instead, reuse the machinery that already works: delete
the order's marker, then hit **Resend** on the original event in the Stripe
dashboard (Developers → Events). The worker treats it as a fresh delivery and
emails a new 30-day link.

```
wrangler r2 object delete "nyctb-assets/fulfilled/<session_id>.json" --remote
```

Recovery copies of `NYCTB_DOWNLOAD_SIGNING_KEY` and
`STRIPE_WEBHOOK_SECRET_NYCTB_LIVE` are in `~/.credentials/api-keys.env`; Worker
secrets cannot be read back out of Cloudflare.

## Replacing the PDF with a revised edition

Overwrites are live immediately, including for links already emailed — same key,
new bytes. Keep the key the same unless you want old links to break.

```
cd _checkout-worker
export CLOUDFLARE_API_TOKEN=…      # must have R2 permissions; see "Wrangler auth"
export CLOUDFLARE_ACCOUNT_ID=4589ead053bd6785d78f5096068625ba
wrangler r2 object put "nyctb-assets/books/jiggs-and-glo-book-01.pdf" \
  --file="$HOME/Syncthing/Brain/Markus Brain/BOOK/jiggs-and-glo/book-01/rendered/Jiggs_and_Glo_Book.pdf" \
  --content-type="application/pdf" --remote
```

To add a second digital product: upload it under `books/`, then add one entry to
`DIGITAL_ASSETS` in `src/index.js` keyed by its SKU, and mark that SKU
`digital: true` in `CATALOG`. Nothing else changes.

## Wrangler auth

The `CLOUDFLARE_API_TOKEN` exported in the shell profile can deploy Workers but
**cannot touch R2**. The token stored in `~/.wrangler/config/default.toml` (the
OAuth login) can. For any R2 or deploy command, export that one:

```
export CLOUDFLARE_API_TOKEN=$(python3 -c "import re;print(re.search(r'token\s*=\s*\"([^\"]+)\"',open('$HOME/.wrangler/config/default.toml').read()).group(1))")
export CLOUDFLARE_ACCOUNT_ID=4589ead053bd6785d78f5096068625ba
unset CF_API_TOKEN CLOUDFLARE_MASTER_TOKEN
wrangler deploy
```

## Stripe webhook

Endpoint `we_1TxBCFDLIJEjTQ1oVSkooS3u`, live mode, enabled, subscribed to
`checkout.session.completed` and `checkout.session.async_payment_succeeded`.

The worker verifies the `t=…,v1=…` scheme in the `Stripe-Signature` header with
`crypto.subtle.verify` (constant-time) and a 5-minute replay window. Anything
unsigned, wrongly signed, tampered with, or stale gets a `400` and is not
processed. Everything the worker deliberately ignores — other event types, unpaid
sessions, paperback-only orders, already-fulfilled sessions — returns `200` fast so
Stripe does not retry it forever.

If the signing secret is ever rolled in the Stripe dashboard, push the new value:

```
printf '%s' 'whsec_…' | wrangler secret put STRIPE_WEBHOOK_SECRET
```

## Email delivery — Brevo primary, Resend fallback

`sendEmail()` picks the provider by which key is set: **Brevo** when `BREVO_API_KEY`
exists, otherwise Resend. Nothing else changes between them, so setting the key is
the whole migration.

**Why Brevo is the right one here.** `nyctailblazers.com` is already authenticated
for Brevo in DNS and has been for a while:

| Type | Name | Value | Status |
|---|---|---|---|
| CNAME | `brevo1._domainkey.nyctailblazers.com` | `b1.nyctailblazers-com.dkim.brevo.com` | live |
| CNAME | `brevo2._domainkey.nyctailblazers.com` | `b2.nyctailblazers-com.dkim.brevo.com` | live |
| TXT | `nyctailblazers.com` | `brevo-code:738d363a…` | live |
| TXT | `_dmarc.nyctailblazers.com` | `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com` | live |
| TXT | `nyctailblazers.com` | `v=spf1 include:_spf.mx.cloudflare.net include:spf.brevo.com ~all` | added 2026-07-25 |

DKIM gives DMARC alignment on its own; the `spf.brevo.com` include was added for
belt-and-braces deliverability. Root MX still points at Cloudflare Email Routing,
so **inbound mail is unaffected** — SPF governs outbound only.

**Resend cannot be the primary.** Its free plan allows one domain and that slot is
held by the client domain `nzurient.com`, so a `nyctailblazers.com` sender is
rejected and its onboarding sender can only deliver to
`nyctailblazers@nyctailblazers.com`. That is exactly why `MAIL_FROM` must stay on
`resend.dev` while `MAIL_FROM_BREVO` uses the real domain — do not merge them.

**Status: Brevo is live** as of 2026-07-25 and verified end to end — a signed
synthetic `checkout.session.completed` produced a real Brevo message id
(`…@smtp-relay.mailin.fr`).

To rotate the key:

```
printf '%s' 'xkeysib-…' | wrangler secret put BREVO_API_KEY
wrangler deploy
```

Get one at **Brevo → SMTP & API → API Keys**. Recovery copies live in
`~/.credentials/api-keys.env` as `BREVO_API_KEY` / `BREVO_API_KEY_ALT`.

### Gotcha: Brevo's "Authorised IPs" blocks local testing, not the Worker

Calling the Brevo API from a laptop returns
`unauthorized … unrecognised IP address <your ip>`, pointing at
<https://app.brevo.com/security/authorised_ips>. The **Worker is unaffected** —
Cloudflare's egress reaches Brevo fine. So do not conclude the key is dead just
because curl from your machine fails; test through the deployed worker instead.
Testing locally would mean allowlisting a home IP, which is not worth it.

The brevo-code TXT was also **stale** until 2026-07-25 — DNS held
`738d363a…` while Brevo expected `e8ef7afa…`, which is why the domain never
authenticated. If verification ever fails again, re-compare that value first.

### Failure behaviour

`sendEmail()` tries every configured provider in order and only throws if they
all fail. This matters because the "manual send needed" alert goes through the
same function: with a single provider, a dead primary would lose the buyer email
*and* the alert about it. If everything fails, the worker still records
`needs_manual_send` against the order, so nothing is lost silently.

## Keeping prices in sync

Update `CATALOG` in `src/index.js` whenever storefront prices change, and keep it
matching the `data-price` attributes on the product cards.
