/* NYC Tailblazers 3D Studio — cart + Stripe checkout (client side).
   State in localStorage; checkout goes to the Cloudflare Worker which holds the
   Stripe secret and re-validates every price server-side. */
(function () {
  "use strict";
  var WORKER_URL = "https://nyctb-checkout.markususeche.workers.dev/create-checkout-session";
  var KEY = "tb3_cart_v1";
  var MIN_ORDER_CENTS = 1200;

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function save(c) { localStorage.setItem(KEY, JSON.stringify(c)); }
  var cart = load();

  function money(cents) { return "$" + (cents / 100).toFixed(2).replace(/\.00$/, ""); }
  function count() { return cart.reduce(function (n, i) { return n + i.qty; }, 0); }
  function subtotal() { return cart.reduce(function (n, i) { return n + i.price * i.qty; }, 0); }

  function add(item) {
    var ex = cart.filter(function (i) { return i.sku === item.sku; })[0];
    if (ex) { ex.qty += item.min || 1; }
    else { cart.push({ sku: item.sku, name: item.name, price: item.price, min: item.min || 1, qty: item.min || 1, note: "" }); }
    save(cart); render(); open();
  }
  function setQty(sku, q) {
    var it = cart.filter(function (i) { return i.sku === sku; })[0]; if (!it) return;
    it.qty = Math.max(it.min || 1, Math.min(999, q)); save(cart); render();
  }
  function setNote(sku, v) { var it = cart.filter(function (i) { return i.sku === sku; })[0]; if (it) { it.note = v; save(cart); } }
  function remove(sku) { cart = cart.filter(function (i) { return i.sku !== sku; }); save(cart); render(); }

  // ---- build DOM ----
  var btn, badge, drawer, overlay, body, totalEl, checkoutBtn, msgEl;
  function build() {
    btn = document.createElement("button");
    btn.className = "tb3-cartbtn"; btn.type = "button"; btn.setAttribute("aria-label", "Open cart");
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 12.2a1.5 1.5 0 0 0 1.5 1.2h8.2a1.5 1.5 0 0 0 1.5-1.2L22 7H6"/></svg><span class="tb3-cartcount" hidden>0</span>';
    badge = btn.querySelector(".tb3-cartcount");
    btn.addEventListener("click", open);

    overlay = document.createElement("div"); overlay.className = "tb3-cartoverlay"; overlay.addEventListener("click", close);
    drawer = document.createElement("aside"); drawer.className = "tb3-cartdrawer"; drawer.setAttribute("aria-label", "Shopping cart");
    drawer.innerHTML =
      '<div class="tb3-carthead"><h3>Your cart</h3><button type="button" class="tb3-cartclose" aria-label="Close cart">&times;</button></div>' +
      '<div class="tb3-cartbody"></div>' +
      '<div class="tb3-cartfoot"><div class="tb3-cartmsg" hidden></div>' +
      '<div class="tb3-cartrow"><span>Subtotal</span><strong class="tb3-carttotal">$0</strong></div>' +
      '<p class="tb3-cartnote">Made to order · printed in NYC · shipped to you. Shipping calculated at checkout.</p>' +
      '<button type="button" class="tb3-checkout btn btn-blue">Checkout securely</button></div>';
    body = drawer.querySelector(".tb3-cartbody");
    totalEl = drawer.querySelector(".tb3-carttotal");
    msgEl = drawer.querySelector(".tb3-cartmsg");
    checkoutBtn = drawer.querySelector(".tb3-checkout");
    drawer.querySelector(".tb3-cartclose").addEventListener("click", close);
    checkoutBtn.addEventListener("click", checkout);
    document.body.appendChild(btn); document.body.appendChild(overlay); document.body.appendChild(drawer);
  }

  function render() {
    var n = count();
    badge.textContent = n; badge.hidden = n === 0;
    btn.classList.toggle("has-items", n > 0);
    if (!cart.length) {
      body.innerHTML = '<p class="tb3-cartempty">Your cart is empty.<br>Browse a product line and add something made just for you.</p>';
    } else {
      body.innerHTML = cart.map(function (i) {
        return '<div class="tb3-item" data-sku="' + i.sku + '">' +
          '<div class="tb3-item-top"><span class="tb3-item-name">' + i.name + '</span>' +
          '<button type="button" class="tb3-item-rm" aria-label="Remove">&times;</button></div>' +
          '<div class="tb3-item-mid"><div class="tb3-qty"><button type="button" data-a="dec" aria-label="Decrease">&minus;</button>' +
          '<span>' + i.qty + '</span><button type="button" data-a="inc" aria-label="Increase">+</button></div>' +
          '<span class="tb3-item-price">' + money(i.price * i.qty) + '</span></div>' +
          (i.min > 1 ? '<div class="tb3-item-min">Minimum ' + i.min + '</div>' : '') +
          '<input class="tb3-item-note" type="text" maxlength="200" placeholder="Personalization: name, text, color…" value="' + (i.note ? i.note.replace(/"/g, "&quot;") : "") + '">' +
          '</div>';
      }).join("");
    }
    totalEl.textContent = money(subtotal());
    var under = subtotal() > 0 && subtotal() < MIN_ORDER_CENTS;
    checkoutBtn.disabled = cart.length === 0 || under;
    if (under) { msgEl.hidden = false; msgEl.textContent = "Order minimum is $12 — add a little more."; }
    else { msgEl.hidden = true; }
    // wire item controls
    body.querySelectorAll(".tb3-item").forEach(function (el) {
      var sku = el.getAttribute("data-sku");
      el.querySelector(".tb3-item-rm").addEventListener("click", function () { remove(sku); });
      el.querySelectorAll(".tb3-qty button").forEach(function (b) {
        b.addEventListener("click", function () {
          var it = cart.filter(function (x) { return x.sku === sku; })[0]; if (!it) return;
          setQty(sku, it.qty + (b.getAttribute("data-a") === "inc" ? 1 : -1));
        });
      });
      el.querySelector(".tb3-item-note").addEventListener("change", function (e) { setNote(sku, e.target.value); });
    });
  }

  function open() { overlay.classList.add("on"); drawer.classList.add("on"); document.body.style.overflow = "hidden"; }
  function close() { overlay.classList.remove("on"); drawer.classList.remove("on"); document.body.style.overflow = ""; }

  function checkout() {
    if (!cart.length) return;
    checkoutBtn.disabled = true; checkoutBtn.textContent = "Redirecting…"; msgEl.hidden = true;
    fetch(WORKER_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cart.map(function (i) { return { sku: i.sku, qty: i.qty, note: i.note }; }) }),
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.url) { window.location.href = d.url; }
      else { throw new Error(d.error || "Checkout failed"); }
    }).catch(function (e) {
      msgEl.hidden = false; msgEl.textContent = e.message || "Something went wrong. Please try again or email us.";
      checkoutBtn.disabled = false; checkoutBtn.textContent = "Checkout securely";
    });
  }

  // ---- enhance product cards ----
  function enhance() {
    document.querySelectorAll(".prod[data-sku]").forEach(function (card) {
      if (card.querySelector(".add-cart, .quote-link")) return;
      var info = card.querySelector(".info"); if (!info) return;
      if (card.getAttribute("data-bespoke") === "1") {
        var a = document.createElement("a");
        a.className = "quote-link btn btn-ghost";
        a.href = "mailto:info@nyctailblazers.com?subject=" + encodeURIComponent("Custom quote: " + card.getAttribute("data-name"));
        a.textContent = "Request a quote";
        info.appendChild(a); return;
      }
      var b = document.createElement("button");
      b.type = "button"; b.className = "add-cart btn btn-ink";
      b.innerHTML = 'Add to cart <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
      b.addEventListener("click", function () {
        add({ sku: card.getAttribute("data-sku"), name: card.getAttribute("data-name"),
              price: parseInt(card.getAttribute("data-price"), 10) || 0, min: parseInt(card.getAttribute("data-min"), 10) || 1 });
        b.classList.add("added"); b.childNodes[0].nodeValue = "Added ";
        setTimeout(function () { b.classList.remove("added"); b.childNodes[0].nodeValue = "Add to cart "; }, 1400);
      });
      info.appendChild(b);
    });
  }

  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  build(); enhance(); render();
})();
