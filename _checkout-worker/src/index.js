/**
 * NYC Tailblazers 3D Studio — Stripe Checkout worker.
 * Holds STRIPE_SECRET_KEY (Worker secret). Prices are AUTHORITATIVE here — the
 * client only sends {sku, qty, note}; we never trust a client-supplied price.
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
};

const ALLOWED_ORIGINS = [
  "https://www.nyctailblazers.com",
  "https://nyctailblazers.com",
  "http://localhost:8791",
  "http://127.0.0.1:8791",
];

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

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      return json({ ok: true, service: "nyctb-checkout" }, 200, cors);
    }
    if (request.method !== "POST" || url.pathname !== "/create-checkout-session") {
      return json({ error: "not found" }, 404, cors);
    }

    let body;
    try { body = await request.json(); } catch { return json({ error: "bad json" }, 400, cors); }
    const items = Array.isArray(body.items) ? body.items : [];

    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("success_url", "https://www.nyctailblazers.com/3d/success.html?session_id={CHECKOUT_SESSION_ID}");
    params.set("cancel_url", "https://www.nyctailblazers.com/3d-printing.html#shop");
    params.set("billing_address_collection", "auto");
    params.set("phone_number_collection[enabled]", "true");
    params.set("shipping_address_collection[allowed_countries][0]", "US");
    params.set("shipping_address_collection[allowed_countries][1]", "CA");

    let i = 0, subtotal = 0;
    for (const it of items) {
      const sku = CATALOG[it && it.sku];
      if (!sku) continue;
      let qty = parseInt(it.qty, 10);
      if (!Number.isFinite(qty)) qty = sku.min;
      qty = Math.max(sku.min, Math.min(999, qty));
      subtotal += sku.cents * qty;
      params.set(`line_items[${i}][quantity]`, String(qty));
      params.set(`line_items[${i}][price_data][currency]`, "usd");
      params.set(`line_items[${i}][price_data][unit_amount]`, String(sku.cents));
      params.set(`line_items[${i}][price_data][product_data][name]`, sku.name);
      const note = (it.note ? String(it.note) : "").trim().slice(0, 400);
      if (note) params.set(`line_items[${i}][price_data][product_data][description]`, note);
      i++;
    }
    if (i === 0) return json({ error: "Your cart is empty or contains no valid items." }, 400, cors);
    if (subtotal < 1200) return json({ error: "Order minimum is $12. Please add a little more to your cart." }, 400, cors);

    // ask for personalization details at checkout too (name/photo instructions)
    params.set("custom_fields[0][key]", "personalization");
    params.set("custom_fields[0][label][type]", "custom");
    params.set("custom_fields[0][label][custom]", "Names / text / photo notes (optional)");
    params.set("custom_fields[0][type]", "text");
    params.set("custom_fields[0][optional]", "true");
    params.set("custom_fields[0][text][maximum_length]", "255");

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
  },
};
