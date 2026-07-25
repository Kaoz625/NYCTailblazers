/**
 * NYC Tailblazers — Stripe Checkout + digital fulfillment worker.
 *
 * Routes
 *   GET  /                        health check
 *   POST /create-checkout-session create a Stripe Checkout Session (prices authoritative here)
 *   POST /stripe-webhook          Stripe events; emails the PDF download link for digital SKUs
 *   GET  /download?token=…        HMAC-signed, time-limited stream of a paid PDF out of R2
 *
 * Secrets (wrangler secret put …): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
 * DOWNLOAD_SIGNING_KEY, and one email provider — BREVO_API_KEY (preferred) or
 * RESEND_API_KEY (fallback).  Bindings: ASSETS (R2 bucket nyctb-assets).
 * Nothing sensitive lives in this file or in wrangler.toml.
 */

// SKU -> authoritative price (cents), display name, min qty. Must match the storefront.
const CATALOG = {
  // Wedding & Events
  "place-card":            { name: "Place Card / Name Setting",        cents: 275,  min: 10 },
  "table-number":          { name: "Freestanding Table Number",         cents: 600,  min: 1  },
  "cake-topper":           { name: "Name / Silhouette Cake Topper",     cents: 2800, min: 1  },
  "monogram-favors":       { name: "Monogram Stirrers & Favor Charms",  cents: 250,  min: 20 },
  // Keepsakes & Gifts
  "name-keychain":         { name: "Name Keychain / Bag Tag",           cents: 800,  min: 1  },
  "nameplate":             { name: "Desk Nameplate / Door Sign",        cents: 1600, min: 1  },
  "cookie-cutter":         { name: "Custom Cookie Cutter + Stamp",      cents: 1400, min: 1  },
  "crate-tag":             { name: "Kennel / Crate Nameplate Tag",      cents: 1200, min: 1  },
  // Photo & Memory
  "lithophane-box":        { name: "Lithophane Light Box (Single)",     cents: 3200, min: 1  },
  "lithophane-multi":      { name: "Multi-Photo Lithophane Box",        cents: 5200, min: 1  },
  "lithophane-nightlight": { name: "Lithophane Nightlight Panel",       cents: 2800, min: 1  },
  // Desk & Home
  "phone-stand":           { name: "Minimalist Phone Stand",            cents: 1000, min: 1  },
  "phone-stand-novelty":   { name: "Novelty Phone Stand",               cents: 1600, min: 1  },
  "desk-organizer":        { name: "Desk Organizer / Caddy",            cents: 2200, min: 1  },
  "cable-holder":          { name: "Cable Holder / Headphone Hook",     cents: 800,  min: 1  },
  // Planters & Decor
  "planter-geometric":     { name: "Geometric Succulent Planter",       cents: 1600, min: 1  },
  "planter-selfwatering":  { name: "Self-Watering Character Pot",       cents: 2800, min: 1  },
  "vase":                  { name: "Vase-Mode Decorative Vase",         cents: 3200, min: 1  },
  // Fidget & Flexi
  "dragon-mini":           { name: "Mini Flexi Dragon / Axolotl",       cents: 900,  min: 1  },
  "dragon-standard":       { name: "Standard Articulated Flexi Dragon", cents: 2400, min: 1  },
  "dragon-large":          { name: "Large 18in Flexi Dragon",           cents: 4000, min: 1  },
  "turtle-sandbox":        { name: "Turtle Sandbox Fidget Toy",         cents: 2200, min: 1  },
  // Dog & Pet
  "breed-planter":         { name: "Breed Succulent Planter",           cents: 2200, min: 1  },
  "pet-id-tag":            { name: "Silent 3D Pet ID Tag",              cents: 1000, min: 1  },
  "pet-memorial":          { name: "Pet Memorial Keychain / Tag",       cents: 1200, min: 1  },
  "breed-keychain":        { name: "Breed Keychain",                    cents: 900,  min: 1  },
  // Books — Jiggs & Glo (physical ships; digital emailed). standalone: exempt from the $12 3D minimum.
  "book-jiggs-glo-1":         { name: "Jiggs & Glo, Book One — Signed Paperback",       cents: 1500, min: 1, physical: true, standalone: true },
  "book-jiggs-glo-1-digital": { name: "Jiggs & Glo, Book One — Digital PDF (emailed)",  cents: 800,  min: 1, digital: true,  standalone: true },
  // Personal training — founding-member rates, the low end of each published range.
  // service: nothing is shipped, so no address is collected.
  // standalone: one session can be bought on its own, same exemption as the books.
  "training-semi-private": { name: "Semi-Private Training — One Session, Founding Rate (per person)", cents: 8000,  min: 1, service: true, standalone: true },
  "training-1on1":         { name: "1:1 Private Training — One 60-Minute Session, Founding Rate",     cents: 15000, min: 1, service: true, standalone: true },
  "training-online":       { name: "Online / Remote Coaching — One Month, Founding Rate",             cents: 15000, min: 1, service: true, standalone: true },
};

// Digital SKU -> the object in the ASSETS bucket and the filename the buyer receives.
const DIGITAL_ASSETS = {
  "book-jiggs-glo-1-digital": {
    r2Key: "books/jiggs-and-glo-book-01.pdf",
    filename: "Jiggs-and-Glo-Book-One.pdf",
    title: "Jiggs & Glo, Book One",
    contentType: "application/pdf",
  },
};

// success/cancel destinations by storefront source (validated; defaults to 3d for back-compat).
const RETURN = {
  "3d": {
    success: "https://www.nyctailblazers.com/3d/success.html?session_id={CHECKOUT_SESSION_ID}",
    cancel:  "https://www.nyctailblazers.com/3d-printing.html#shop",
  },
  "book": {
    success: "https://www.nyctailblazers.com/success.html?session_id={CHECKOUT_SESSION_ID}",
    cancel:  "https://www.nyctailblazers.com/jiggs-and-glo.html#get-the-book",
  },
  "training": {
    success: "https://www.nyctailblazers.com/personal-training.html?session_id={CHECKOUT_SESSION_ID}#booked",
    cancel:  "https://www.nyctailblazers.com/personal-training.html#pricing",
  },
};

// The one free-text field on the Checkout page, worded for what is being bought.
// Coaching makes it required — Markus needs to know who booked and why before the session.
const CUSTOM_FIELD = {
  "3d":       { key: "personalization", label: "Names / text / photo notes (optional)", optional: "true"  },
  "book":     { key: "personalization", label: "Sign the book to… (name, optional)",    optional: "true"  },
  "training": { key: "goal",            label: "Your goal + training experience",       optional: "false" },
};

const ALLOWED_ORIGINS = [
  "https://www.nyctailblazers.com",
  "https://nyctailblazers.com",
  "http://localhost:8791",
  "http://127.0.0.1:8791",
];

const SIG_TOLERANCE_SECONDS = 300; // reject replayed/stale Stripe signatures

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}
function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
function text(body, status) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/* ---------------------------------------------------------------- crypto -- */

const enc = new TextEncoder();

async function hmacKey(secret, usage) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

function hexToBytes(hex) {
  if (typeof hex !== "string" || hex.length === 0 || hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function b64urlEncode(bytes) {
  let s = "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Verify the `t=…,v1=…` Stripe-Signature scheme.
 * crypto.subtle.verify does the comparison in constant time, so a forged
 * signature leaks nothing through timing. Returns true only on a real match
 * inside the replay tolerance window.
 */
async function verifyStripeSignature(payload, sigHeader, secret, nowSeconds) {
  if (!sigHeader || !secret) return false;
  let t = null;
  const v1 = [];
  for (const part of sigHeader.split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === "t") t = v;
    else if (k === "v1") v1.push(v);
  }
  if (!t || !/^\d+$/.test(t) || v1.length === 0) return false;
  const age = Math.abs(nowSeconds - parseInt(t, 10));
  if (!Number.isFinite(age) || age > SIG_TOLERANCE_SECONDS) return false;

  const key = await hmacKey(secret, "verify");
  const signed = enc.encode(`${t}.${payload}`);
  for (const candidate of v1) {
    const bytes = hexToBytes(candidate);
    if (!bytes || bytes.length !== 32) continue;
    if (await crypto.subtle.verify("HMAC", key, bytes, signed)) return true;
  }
  return false;
}

/** token = base64url("sessionId|sku|expiryEpochSeconds") + "." + base64url(hmac) */
async function mintDownloadToken(secret, sessionId, sku, expSeconds) {
  const body = b64urlEncode(enc.encode(`${sessionId}|${sku}|${expSeconds}`));
  const key = await hmacKey(secret, "sign");
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return `${body}.${b64urlEncode(sig)}`;
}

async function readDownloadToken(secret, token) {
  if (!secret || typeof token !== "string") return { ok: false, reason: "bad" };
  const dot = token.lastIndexOf(".");
  if (dot <= 0 || dot === token.length - 1) return { ok: false, reason: "bad" };
  const body = token.slice(0, dot);
  let sig;
  try { sig = b64urlDecode(token.slice(dot + 1)); } catch { return { ok: false, reason: "bad" }; }
  const key = await hmacKey(secret, "verify");
  if (!(await crypto.subtle.verify("HMAC", key, sig, enc.encode(body)))) return { ok: false, reason: "bad" };
  let parts;
  try { parts = new TextDecoder().decode(b64urlDecode(body)).split("|"); } catch { return { ok: false, reason: "bad" }; }
  if (parts.length !== 3) return { ok: false, reason: "bad" };
  const [sessionId, sku, expStr] = parts;
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp)) return { ok: false, reason: "bad" };
  if (Math.floor(Date.now() / 1000) > exp) return { ok: false, reason: "expired" };
  if (!DIGITAL_ASSETS[sku]) return { ok: false, reason: "bad" };
  return { ok: true, sessionId, sku, exp };
}

/* ------------------------------------------------------- checkout session -- */

async function createCheckoutSession(request, env, cors) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400, cors); }
  const items = Array.isArray(body.items) ? body.items : [];

  const src = (body && RETURN[body.source]) ? body.source : "3d";

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", RETURN[src].success);
  params.set("cancel_url", RETURN[src].cancel);
  params.set("billing_address_collection", "auto");
  params.set("phone_number_collection[enabled]", "true");

  let i = 0, subtotal = 0, needsShipping = false, allStandalone = true;
  const purchasedSkus = [];
  for (const it of items) {
    const sku = CATALOG[it && it.sku];
    if (!sku) continue;
    let qty = parseInt(it.qty, 10);
    if (!Number.isFinite(qty)) qty = sku.min;
    qty = Math.max(sku.min, Math.min(999, qty));
    subtotal += sku.cents * qty;
    if (!sku.digital && !sku.service) needsShipping = true;   // 3D items + physical books ship; digital files and coaching services do not
    if (!sku.standalone) allStandalone = false;
    purchasedSkus.push(it.sku);
    params.set(`line_items[${i}][quantity]`, String(qty));
    params.set(`line_items[${i}][price_data][currency]`, "usd");
    params.set(`line_items[${i}][price_data][unit_amount]`, String(sku.cents));
    params.set(`line_items[${i}][price_data][product_data][name]`, sku.name);
    const note = (it.note ? String(it.note) : "").trim().slice(0, 400);
    if (note) params.set(`line_items[${i}][price_data][product_data][description]`, note);
    i++;
  }
  if (i === 0) return json({ error: "Your cart is empty or contains no valid items." }, 400, cors);
  // $12 minimum applies to made-to-order 3D goods; standalone items (books) are exempt.
  if (!allStandalone && subtotal < 1200) return json({ error: "Order minimum is $12. Please add a little more to your cart." }, 400, cors);

  // only ask for a shipping address when something actually ships.
  if (needsShipping) {
    params.set("shipping_address_collection[allowed_countries][0]", "US");
    params.set("shipping_address_collection[allowed_countries][1]", "CA");
  }

  // 3D piece instructions, a book dedication, or the client's goal + experience.
  const cf = CUSTOM_FIELD[src] || CUSTOM_FIELD["3d"];
  params.set("custom_fields[0][key]", cf.key);
  params.set("custom_fields[0][label][type]", "custom");
  params.set("custom_fields[0][label][custom]", cf.label);
  params.set("custom_fields[0][type]", "text");
  params.set("custom_fields[0][optional]", cf.optional);
  params.set("custom_fields[0][text][maximum_length]", "255");

  // Stamp the SKUs on the session so the webhook can fulfill without a second
  // API round-trip. (It still falls back to line_items if metadata is missing.)
  const skuList = purchasedSkus.join(",").slice(0, 480);
  if (skuList) params.set("metadata[skus]", skuList);
  if (purchasedSkus.some((s) => CATALOG[s] && CATALOG[s].digital)) params.set("metadata[digital]", "1");

  const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.STRIPE_SECRET_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const data = await resp.json();
  if (!resp.ok) {
    return json({ error: (data.error && data.error.message) || "Stripe error" }, 502, cors);
  }
  return json({ url: data.url, id: data.id }, 200, cors);
}

/* ------------------------------------------------------------ fulfillment -- */

/** Which digital SKUs did this session actually buy? */
async function digitalSkusFor(session, env) {
  const found = new Set();

  const meta = (session.metadata && session.metadata.skus) || "";
  for (const raw of String(meta).split(",")) {
    const sku = raw.trim();
    if (DIGITAL_ASSETS[sku]) found.add(sku);
  }
  if (found.size > 0) return [...found];
  if (meta) return []; // metadata was present and had no digital SKU — trust it

  // Older sessions (created before metadata stamping) — ask Stripe what was bought
  // and match on the authoritative product names from CATALOG.
  if (!session.id || !env.STRIPE_SECRET_KEY) return [];
  const resp = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(session.id)}/line_items?limit=100`,
    { headers: { "Authorization": "Bearer " + env.STRIPE_SECRET_KEY } }
  );
  if (!resp.ok) throw new Error(`line_items lookup failed: ${resp.status}`);
  const data = await resp.json();
  const digitalNames = new Map();
  for (const [sku, def] of Object.entries(CATALOG)) {
    if (def.digital && DIGITAL_ASSETS[sku]) digitalNames.set(def.name, sku);
  }
  for (const li of data.data || []) {
    const name = li.description || (li.price && li.price.product && li.price.product.name) || "";
    const sku = digitalNames.get(name);
    if (sku) found.add(sku);
  }
  return [...found];
}

/**
 * Atomically claim a session id so a Stripe retry can never send a second email.
 * Returns false when someone (an earlier delivery) already holds the claim.
 */
async function claimSession(env, sessionId, record) {
  const key = `fulfilled/${sessionId}.json`;
  if (await env.ASSETS.head(key)) return false;
  const value = JSON.stringify(record);
  const opts = { httpMetadata: { contentType: "application/json" } };
  try {
    const put = await env.ASSETS.put(key, value, { ...opts, onlyIf: { etagDoesNotMatch: "*" } });
    if (put === null) return false; // lost the race to a concurrent retry
    return true;
  } catch {
    // Precondition failures surface as a throw on some runtimes; re-check and
    // only proceed if the marker still is not there.
    if (await env.ASSETS.head(key)) return false;
    await env.ASSETS.put(key, value, opts);
    return true;
  }
}

async function markSession(env, sessionId, record) {
  await env.ASSETS.put(`fulfilled/${sessionId}.json`, JSON.stringify(record), {
    httpMetadata: { contentType: "application/json" },
  });
}

async function releaseSession(env, sessionId) {
  try { await env.ASSETS.delete(`fulfilled/${sessionId}.json`); } catch { /* best effort */ }
}

function firstName(session) {
  const raw = (session.customer_details && session.customer_details.name) || "";
  const n = String(raw).trim().split(/\s+/)[0];
  return n && /^[\p{L}'’-]{1,40}$/u.test(n) ? n : "";
}

function formatDate(epochSeconds) {
  return new Date(epochSeconds * 1000).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York",
  });
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buyerEmail(env, name, links, expiresAt) {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const single = links.length === 1;
  const expiry = formatDate(expiresAt);

  const lines = [
    greeting,
    "",
    single
      ? `Thank you for buying ${links[0].title}. Here is your PDF:`
      : "Thank you for your order. Here are your PDFs:",
    "",
    ...links.map((l) => (single ? l.url : `${l.title}\n${l.url}`)),
    "",
    `The link works until ${expiry}. Download the file and keep a copy somewhere safe — once it is on your device it is yours for good.`,
    "",
    "If the link gives you any trouble, just reply to this email and we will sort it out.",
    "",
    "— Markus",
    "NYC Tailblazers",
  ];

  const html = [
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>${single
      ? `Thank you for buying ${escapeHtml(links[0].title)}. Here is your PDF:`
      : "Thank you for your order. Here are your PDFs:"}</p>`,
    ...links.map((l) => `<p><a href="${escapeHtml(l.url)}">${escapeHtml(single ? "Download the PDF" : l.title)}</a></p>`),
    `<p>The link works until ${escapeHtml(expiry)}. Download the file and keep a copy somewhere safe — once it is on your device it is yours for good.</p>`,
    `<p>If the link gives you any trouble, just reply to this email and we will sort it out.</p>`,
    `<p>— Markus<br>NYC Tailblazers</p>`,
  ].join("\n");

  return {
    subject: single ? `Your copy of ${links[0].title}` : "Your NYC Tailblazers download links",
    text: lines.join("\n"),
    html,
  };
}

// "NYC Tailblazers <info@example.com>" -> { name, email }; a bare address also works.
function parseAddress(raw) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(raw || "");
  if (m) return m[1] ? { name: m[1], email: m[2] } : { email: m[2] };
  return { email: (raw || "").trim() };
}

// Picks the provider by which key is present, so the key alone flips it — no redeploy of
// logic, no window where neither works. Brevo wins when configured: nyctailblazers.com is
// DKIM-authenticated there (brevo1/brevo2 CNAMEs), so it can reach real buyers. Resend
// remains the fallback, but its free plan's single domain slot is held by another brand, so
// it can only reach Markus himself.
// Tries providers in order and only throws if ALL of them fail. The failover is not
// decoration: the "manual send needed" alert is itself sent through here, so a single-
// provider version would mean a broken primary loses the buyer email AND the alert about
// it — a silent lost order. With failover, a dead primary still degrades to "Markus gets
// an alert he can forward", which is the whole safety net.
async function sendEmail(env, msg) {
  const providers = [];
  if (env.BREVO_API_KEY) providers.push(["brevo", sendBrevo]);
  if (env.RESEND_API_KEY) providers.push(["resend", sendResend]);
  if (!providers.length) throw new Error("no email provider configured");

  const failures = [];
  for (const [name, send] of providers) {
    try {
      return await send(env, msg);
    } catch (e) {
      failures.push(`${name}: ${e.message}`);
    }
  }
  const err = new Error(failures.join(" | "));
  err.allProvidersFailed = true;
  throw err;
}

async function sendBrevo(env, { to, subject, text: body, html, replyTo }) {
  const payload = {
    sender: parseAddress(env.MAIL_FROM_BREVO || env.MAIL_FROM),
    to: (Array.isArray(to) ? to : [to]).map((email) => ({ email })),
    subject,
    textContent: body,
  };
  if (html) payload.htmlContent = html;
  if (replyTo) payload.replyTo = { email: replyTo };

  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY,
      "content-type": "application/json",
      "accept": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data.message || `Brevo error ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  return data.messageId || null;
}

async function sendResend(env, { to, subject, text: body, html, replyTo }) {
  const payload = {
    from: env.MAIL_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    text: body,
  };
  if (html) payload.html = html;
  if (replyTo) payload.reply_to = replyTo;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data.message || `Resend error ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  return data.id || null;
}

async function handleStripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) return text("webhook not configured", 500);

  const payload = await request.text();
  const ok = await verifyStripeSignature(
    payload,
    request.headers.get("Stripe-Signature"),
    env.STRIPE_WEBHOOK_SECRET,
    Math.floor(Date.now() / 1000)
  );
  if (!ok) return text("invalid signature", 400);

  let event;
  try { event = JSON.parse(payload); } catch { return text("bad json", 400); }

  // Anything we do not fulfill gets a fast 2xx so Stripe stops retrying it.
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return json({ ignored: event.type }, 200);
  }
  const session = event.data && event.data.object;
  if (!session || session.object !== "checkout.session") return json({ ignored: "not a checkout session" }, 200);
  if (session.payment_status !== "paid") return json({ ignored: "not paid", payment_status: session.payment_status || null }, 200);

  let skus;
  try {
    skus = await digitalSkusFor(session, env);
  } catch (e) {
    // Transient Stripe lookup failure — let Stripe retry.
    return text(`lookup failed: ${e.message}`, 500);
  }
  if (skus.length === 0) return json({ ignored: "no digital items", session: session.id }, 200);

  const to = (session.customer_details && session.customer_details.email) || session.customer_email || null;
  const ttlDays = Number(env.DOWNLOAD_TTL_DAYS) > 0 ? Number(env.DOWNLOAD_TTL_DAYS) : 30;
  const expiresAt = Math.floor(Date.now() / 1000) + ttlDays * 86400;

  const links = [];
  for (const sku of skus) {
    const asset = DIGITAL_ASSETS[sku];
    const token = await mintDownloadToken(env.DOWNLOAD_SIGNING_KEY, session.id, sku, expiresAt);
    links.push({ sku, title: asset.title, url: `${env.PUBLIC_BASE_URL}/download?token=${token}` });
  }

  const claimed = await claimSession(env, session.id, {
    status: "sending", skus, to, at: new Date().toISOString(), expires_at: expiresAt,
  });
  if (!claimed) return json({ ignored: "already fulfilled", session: session.id }, 200);

  const msg = buyerEmail(env, firstName(session), links, expiresAt);
  let emailId = null;
  try {
    if (!to) throw new Error("no customer email on session");
    emailId = await sendEmail(env, {
      to, subject: msg.subject, text: msg.text, html: msg.html, replyTo: env.MAIL_REPLY_TO,
    });
    await markSession(env, session.id, {
      status: "sent", skus, to, email_id: emailId, at: new Date().toISOString(), expires_at: expiresAt,
    });
    return json({ fulfilled: session.id, skus, email_id: emailId }, 200);
  } catch (e) {
    // Could not reach the buyer. Tell Markus once, with the same links, so the
    // order can be finished by hand instead of silently disappearing.
    const alert = [
      `A digital order came through but the automatic email failed.`,
      ``,
      `Session: ${session.id}`,
      `Buyer:   ${to || "(no email on the session)"}`,
      `Items:   ${skus.join(", ")}`,
      `Reason:  ${e.message}`,
      ``,
      `Send these links on manually — they stay valid until ${formatDate(expiresAt)}:`,
      ...links.map((l) => `${l.title}\n${l.url}`),
    ].join("\n");
    try {
      const alertId = await sendEmail(env, {
        to: env.OWNER_EMAIL,
        subject: `Manual send needed — digital order ${session.id}`,
        text: alert,
        replyTo: env.MAIL_REPLY_TO,
      });
      await markSession(env, session.id, {
        status: "needs_manual_send", skus, to, error: e.message,
        owner_alert_id: alertId, at: new Date().toISOString(), expires_at: expiresAt,
      });
      // 200: retrying will not fix a rejected recipient, and Markus has been told.
      return json({ fulfilled: false, session: session.id, owner_alerted: true, error: e.message }, 200);
    } catch (alertErr) {
      // Nobody was reached at all — drop the claim so Stripe's retry tries again.
      await releaseSession(env, session.id);
      return text(`fulfillment failed: ${e.message}; owner alert failed: ${alertErr.message}`, 500);
    }
  }
}

/* -------------------------------------------------------------- downloads -- */

async function handleDownload(request, env, url) {
  const claim = await readDownloadToken(env.DOWNLOAD_SIGNING_KEY, url.searchParams.get("token") || "");
  if (!claim.ok) {
    if (claim.reason === "expired") {
      return text(
        "This download link has expired.\n\nEmail info@nyctailblazers.com with your order and we will send a fresh one.",
        410
      );
    }
    return text("This download link is not valid.", 403);
  }

  const asset = DIGITAL_ASSETS[claim.sku];
  const rangeHeader = request.headers.get("Range");
  const obj = await env.ASSETS.get(asset.r2Key, rangeHeader ? { range: request.headers } : undefined);
  if (!obj || !obj.body) return text("That file is temporarily unavailable. Email info@nyctailblazers.com and we will get it to you.", 404);

  const headers = new Headers();
  headers.set("Content-Type", asset.contentType);
  headers.set("Content-Disposition", `attachment; filename="${asset.filename}"`);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("Accept-Ranges", "bytes");
  if (obj.httpEtag) headers.set("ETag", obj.httpEtag);

  const r = obj.range;
  if (rangeHeader && r) {
    let start, length;
    if (typeof r.suffix === "number") { start = Math.max(0, obj.size - r.suffix); length = obj.size - start; }
    else { start = r.offset || 0; length = typeof r.length === "number" ? r.length : obj.size - start; }
    headers.set("Content-Range", `bytes ${start}-${start + length - 1}/${obj.size}`);
    headers.set("Content-Length", String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(obj.size));
  return new Response(obj.body, { status: 200, headers });
}

/* ------------------------------------------------------------------ entry -- */

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (request.method === "GET" && url.pathname === "/") {
      return json({ ok: true, service: "nyctb-checkout" }, 200, cors);
    }
    if (request.method === "GET" && url.pathname === "/download") {
      return handleDownload(request, env, url);
    }
    if (request.method === "POST" && url.pathname === "/stripe-webhook") {
      return handleStripeWebhook(request, env);
    }
    if (request.method === "POST" && url.pathname === "/create-checkout-session") {
      return createCheckoutSession(request, env, cors);
    }
    return json({ error: "not found" }, 404, cors);
  },
};
