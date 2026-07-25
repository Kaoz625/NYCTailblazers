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
| `RESEND_API_KEY` | sends the delivery email |
| `DOWNLOAD_SIGNING_KEY` | HMAC key for `/download` links |

Source values live in `~/.credentials/api-keys.env` (`STRIPE_SECRET_KEY_NYCTB_LIVE`,
`RESEND_API_KEY`). `DOWNLOAD_SIGNING_KEY` is a random 32-byte hex string with no
copy anywhere else — **rotating it instantly kills every download link already
emailed**, which is the intended way to revoke a leaked link.

## Plain vars (`[vars]` in wrangler.toml — safe in git)

| Name | Current value | Notes |
|---|---|---|
| `MAIL_FROM` | `NYC Tailblazers <onboarding@resend.dev>` | must be on a Resend-verified domain — see below |
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

## Email sending — current limitation

`nyctailblazers.com` is **not verified in Resend**. The Resend account is on the
free plan, which allows exactly one domain, and that slot is taken by the client
domain `nzurient.com`. So `MAIL_FROM` is currently Resend's onboarding sender,
and Resend will only let that sender deliver to `nyctailblazers@nyctailblazers.com`.

What that means in practice: a real buyer's email is rejected, the worker catches
it, and immediately sends Markus a "Manual send needed" alert containing the same
download link, ready to forward. Nothing is ever lost — but delivery is one
forward away from automatic until a domain is verified.

To finish it, free a domain slot (move `nzurient.com` to its own Resend account,
or upgrade the plan), then add `nyctailblazers.com` at resend.com/domains. Resend
generates records for a sending subdomain; the root SPF, root MX (Cloudflare Email
Routing) and the existing Brevo DKIM are untouched:

| Type | Name | Value |
|---|---|---|
| MX | `send.nyctailblazers.com` | `feedback-smtp.us-east-1.amazonses.com` (priority 10) |
| TXT | `send.nyctailblazers.com` | `v=spf1 include:amazonses.com ~all` |
| TXT | `resend._domainkey.nyctailblazers.com` | the DKIM `p=…` value Resend shows you |

Add them in Cloudflare DNS with proxy **off**, hit Verify, then flip the sender
and redeploy — that is the only change needed:

```
MAIL_FROM = "NYC Tailblazers <books@nyctailblazers.com>"
```

`nyctailblazers.com` already has Brevo DKIM and a Brevo verification code in DNS,
so sending through Brevo instead of Resend may be viable without freeing the
Resend slot. That would mean swapping the `sendResend` call in `src/index.js`.

## Keeping prices in sync

Update `CATALOG` in `src/index.js` whenever storefront prices change, and keep it
matching the `data-price` attributes on the product cards.
