# nyctb-checkout — Stripe Checkout worker (NYC Tailblazers 3D Studio)

Cloudflare Worker that creates Stripe Checkout Sessions for the 3D Studio cart.
Holds the Stripe secret key as a Worker **secret** (never in git). Prices are
authoritative here (client only sends sku/qty/note).

- Deployed URL: https://nyctb-checkout.markususeche.workers.dev
- Endpoint: POST /create-checkout-session  body: {items:[{sku,qty,note}]}

## Redeploy / manage
```
cd _checkout-worker
export CLOUDFLARE_ACCOUNT_ID=<from ~/.credentials/api-keys.env>   # CF_API_TOKEN already in env
wrangler deploy
```

## Go LIVE (swap test key -> live key)
```
# in Stripe dashboard: get the LIVE secret key (sk_live_...)
printf '%s' 'sk_live_...' | wrangler secret put STRIPE_SECRET_KEY
wrangler deploy
```
Update the SKU->price CATALOG in src/index.js if storefront prices change (keep it
in sync with the data-price attributes on the product cards).
