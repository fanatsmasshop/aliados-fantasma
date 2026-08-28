(function () {
  const STORAGE_KEY = "fantasmas_shop_cart_v1";
  const CUSTOMER_KEY = "fantasmas_shop_customer_v1";
  const $ = (selector, root = document) => root.querySelector(selector);
  if (new URLSearchParams(location.search).has("preview")) {
    ["#cartOpenButton", "#cartOverlay", "#cartDrawer", "#checkoutDialog", "#paymentReturnNotice"].forEach((selector) => {
      const element = $(selector);
      if (element) element.hidden = true;
    });
    return;
  }
  const money = (value) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(Number(value || 0));
  const escapeHtml = (value) => String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const digits = (value) => String(value || "").replace(/\D/g, "");
  let cart = readStorage(STORAGE_KEY, []);
  let products = Array.isArray(window.FANTASMAS_PRODUCTS) ? window.FANTASMAS_PRODUCTS : [];
  let settings = window.FANTASMAS_STORE_SETTINGS || {};
  let emailAvailabilityWorker = "";
  let checkoutRequestKey = "";
  let appliedCoupon = null;

  function readStorage(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch (_) { return fallback; }
  }

  function writeStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function productById(id) {
    return products.find((product) => product.id === id);
  }

  function normalizedCart() {
    cart = cart.filter((item) => item && item.id && Number(item.quantity) > 0).map((item) => {
      if (item.kind === "raffle_number") {
        return {
          ...item,
          kind: "raffle_number",
          cart_key: item.cart_key || `raffle:${item.raffle_id || item.id}:${item.number}`,
          raffle_id: item.raffle_id || item.id,
          number: Number(item.number),
          price: Number(item.price || 0),
          quantity: 1,
          stock: null
        };
      }
      const product = productById(item.id);
      const stock = product?.stock === null || product?.stock === undefined ? null : Number(product.stock);
      const maximum = stock === null ? 20 : Math.max(0, Math.min(20, stock));
      return {
        id: item.id,
        kind: "product",
        cart_key: item.id,
        name: product?.name || item.name || "Producto",
        price: Number(product?.sale_price ?? product?.price ?? item.price ?? 0),
        image_url: product?.image_url || item.image_url || "",
        stock,
        quantity: Math.max(1, Math.min(maximum || 1, Number(item.quantity) || 1))
      };
    }).filter((item) => item.stock === null || item.stock > 0);
    writeStorage(STORAGE_KEY, cart);
    return cart;
  }

  function cartCount() {
    return normalizedCart().reduce((sum, item) => sum + item.quantity, 0);
  }

  function subtotal() {
    return normalizedCart().reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  function renderCart() {
    const items = normalizedCart();
    $("#cartCount").textContent = cartCount();
    $("#cartSubtotal").textContent = money(subtotal());
    $("#checkoutTotal").textContent = money(subtotal());
    $("#cartCheckoutButton").disabled = items.length === 0;
    $("#cartQuoteButton").disabled = items.length === 0;
    $("#cartItems").innerHTML = items.length ? items.map((item) => `
      <article class="cart-item" data-cart-item="${escapeHtml(item.cart_key)}">
        <div class="cart-item-image">${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="">` : "☠"}</div>
        <div class="cart-item-main"><h3>${escapeHtml(item.name)}</h3><strong>${money(item.price)}</strong>${item.kind === "raffle_number" ? `<div class="cart-raffle-tag">Número ${String(item.number).padStart(2, "0")} · reserva 2 h</div>` : `<div class="cart-item-quantity"><button type="button" data-cart-change="-1" aria-label="Quitar uno">−</button><span>${item.quantity}</span><button type="button" data-cart-change="1" aria-label="Agregar uno">+</button></div>`}</div>
        <button class="cart-item-remove" type="button" data-cart-remove aria-label="Quitar del carrito">×</button>
      </article>`).join("") : '<div class="cart-empty"><div><span>🛒</span><b>Tu carrito está vacío</b><p>Agrega productos desde el catálogo.</p></div></div>';
  }

  function addProduct(id) {
    checkoutRequestKey = "";
    const product = productById(id);
    if (!product || product.price === null || product.price === undefined || product.online_sale === false) return;
    const stock = product.stock === null || product.stock === undefined ? null : Number(product.stock);
    if (stock !== null && stock <= 0) return;
    const existing = cart.find((item) => item.id === id);
    if (existing) existing.quantity = Math.min(stock === null ? 20 : stock, existing.quantity + 1);
    else cart.push({ id, kind: "product", cart_key: id, name: product.name, price: Number(product.price), image_url: product.image_url || "", stock, quantity: 1 });
    writeStorage(STORAGE_KEY, cart);
    renderCart();
    const button = $("#cartOpenButton");
    button.classList.remove("cart-bump");
    void button.offsetWidth;
    button.classList.add("cart-bump");
    openCart();
  }

  function changeQuantity(id, change) {
    checkoutRequestKey = "";
    const item = cart.find((entry) => (entry.cart_key || entry.id) === id);
    if (!item) return;
    if (item.kind === "raffle_number") return;
    const product = productById(id);
    const max = product?.stock === null || product?.stock === undefined ? 20 : Number(product.stock);
    item.quantity = Math.min(max, item.quantity + change);
    if (item.quantity <= 0) cart = cart.filter((entry) => entry.id !== id);
    writeStorage(STORAGE_KEY, cart);
    renderCart();
  }

  function openCart() {
    $("#cartOverlay").hidden = false;
    $("#cartDrawer").classList.add("open");
    $("#cartDrawer").setAttribute("aria-hidden", "false");
    document.body.classList.add("cart-open");
  }

  function closeCart() {
    $("#cartOverlay").hidden = true;
    $("#cartDrawer").classList.remove("open");
    $("#cartDrawer").setAttribute("aria-hidden", "true");
    document.body.classList.remove("cart-open");
  }

  function checkoutOptions(preferredMethod) {
    settings = window.FANTASMAS_STORE_SETTINGS || settings || {};
    const workerReady = /^https:\/\//i.test(String(settings.checkout_worker_url || "").trim());
    const mercadoVisible = workerReady && String(settings.mercadopago_enabled ?? "true") !== "false";
    const transferVisible = workerReady && String(settings.transfer_enabled ?? "true") !== "false";
    $("#mercadoPagoMethod").hidden = !mercadoVisible;
    $("#transferMethod").hidden = !transferVisible;
    const preferred = preferredMethod === "quote" ? "quote" : mercadoVisible ? "mercadopago" : transferVisible ? "transfer" : "quote";
    const radio = $(`input[name="payment_method"][value="${preferred}"]`, $("#checkoutForm"));
    if (radio) radio.checked = true;
    refreshEmailAvailability(workerReady ? String(settings.checkout_worker_url || "").trim().replace(/\/+$/, "") : "");
  }

  async function refreshEmailAvailability(worker) {
    const option = $("#emailNotificationOption");
    if (!worker) {
      option.hidden = true;
      option.querySelector("input").checked = false;
      updateEmailRequired();
      return;
    }
    if (emailAvailabilityWorker === worker && !option.hidden) return;
    try {
      const result = await fetch(`${worker}/health`);
      const data = await result.json();
      const available = Boolean(data.email_notifications);
      option.hidden = !available;
      if (!available) option.querySelector("input").checked = false;
      emailAvailabilityWorker = available ? worker : "";
      updateEmailRequired();
    } catch (_) {
      option.hidden = true;
      option.querySelector("input").checked = false;
      updateEmailRequired();
    }
  }

  function restoreCustomer() {
    const customer = readStorage(CUSTOMER_KEY, {});
    const form = $("#checkoutForm");
    ["name","phone","email"].forEach((key) => { if (customer[key]) form.elements[key].value = customer[key]; });
  }

  function openCheckout(preferredMethod) {
    if (!cart.length) return;
    closeCart();
    const dialog = $("#checkoutDialog");
    dialog.dataset.preferredPayment = preferredMethod || "";
    $("#checkoutForm").hidden = false;
    $("#transferResult").hidden = true;
    $("#checkoutStatus").textContent = "";
    $("#checkoutStatus").classList.remove("error");
    appliedCoupon = null;
    $("#couponFeedback").textContent = "";
    $("#couponFeedback").className = "coupon-feedback";
    updateCheckoutSummary();
    checkoutOptions(preferredMethod);
    restoreCustomer();
    updateDeliveryFields();
    updateEmailRequired();
    dialog.showModal();
  }

  function closeCheckout() {
    $("#checkoutDialog").close();
    $("#checkoutSubmitButton").disabled = false;
    $("#checkoutSubmitButton").textContent = "Continuar";
  }

  function updateDeliveryFields() {
    const form = $("#checkoutForm");
    const shipping = form.elements.delivery_method.value === "shipping_quote";
    $("#shippingAddressField").hidden = !shipping;
    form.elements.delivery_address.required = shipping;
    if (shipping) {
      $("#mercadoPagoMethod").hidden = true;
      $("#transferMethod").hidden = true;
      form.elements.payment_method.value = "quote";
      $("#checkoutDeliveryNote").textContent = "Primero cotizaremos el envío por WhatsApp; todavía no se realizará ningún cobro";
    } else {
      checkoutOptions($("#checkoutDialog").dataset.preferredPayment || undefined);
      $("#checkoutDeliveryNote").textContent = "Recoger en tienda · sin costo de envío";
    }
  }

  function updateEmailRequired() {
    const form = $("#checkoutForm");
    form.elements.email.required = form.elements.email_notifications.checked;
  }

  function updateCheckoutSummary(quote = null) {
    const base = quote ? Number(quote.original_subtotal || 0) : subtotal();
    const automatic = quote ? Number(quote.automatic_subtotal || base) : base;
    const coupon = quote ? Number(quote.coupon_discount || 0) : 0;
    const total = quote ? Number(quote.subtotal || 0) : base;
    $("#checkoutTotal").textContent = money(total);
    const lines = [];
    if (base > automatic) lines.push(`<p class="discount"><span>Oferta automática</span><b>−${money(base - automatic)}</b></p>`);
    if (coupon) lines.push(`<p class="discount"><span>Código ${escapeHtml(appliedCoupon?.code || "")}</span><b>−${money(coupon)}</b></p>`);
    $("#checkoutDiscountLines").innerHTML = lines.join("");
  }

  async function applyCoupon() {
    const input = $("#couponCodeInput");
    const button = $("#applyCouponButton");
    const feedback = $("#couponFeedback");
    const code = input.value.trim().toUpperCase();
    appliedCoupon = null;
    updateCheckoutSummary();
    if (!code) { feedback.textContent = "Escribe un código promocional."; feedback.className = "coupon-feedback error"; return; }
    button.disabled = true;
    feedback.textContent = "Verificando código…";
    feedback.className = "coupon-feedback";
    try {
      const result = await postWorker("/coupon/validate", {
        coupon_code: code,
        items: normalizedCart().map((item) => item.kind === "raffle_number" ? { kind: "raffle_number", raffle_id: item.raffle_id, number: item.number, quantity: 1 } : { kind: "product", id: item.id, quantity: item.quantity })
      });
      appliedCoupon = { code, ...result };
      feedback.textContent = `Código aplicado. Ahorras ${money(result.coupon_discount)} adicionales.`;
      feedback.className = "coupon-feedback success";
      updateCheckoutSummary(result);
    } catch (error) {
      feedback.textContent = error.message;
      feedback.className = "coupon-feedback error";
    } finally { button.disabled = false; }
  }

  function orderPayload(form) {
    if (!checkoutRequestKey) checkoutRequestKey = crypto.randomUUID();
    return {
      request_key: checkoutRequestKey,
      customer: { name: form.elements.name.value.trim(), phone: form.elements.phone.value.trim(), email: form.elements.email.value.trim() },
      delivery_method: form.elements.delivery_method.value,
      delivery_address: form.elements.delivery_address.value.trim(),
      notes: form.elements.notes.value.trim(),
      coupon_code: form.elements.coupon_code.value.trim().toUpperCase(),
      email_notifications: form.elements.email_notifications.checked,
      payment_method: form.elements.payment_method.value,
      items: normalizedCart().map((item) => item.kind === "raffle_number"
        ? { kind: "raffle_number", raffle_id: item.raffle_id, number: item.number, quantity: 1 }
        : { kind: "product", id: item.id, quantity: item.quantity })
    };
  }

  function cartMessage(payload, orderNumber = "") {
    const itemLines = normalizedCart().map((item) => `• ${item.quantity} × ${item.name} — ${money(item.price * item.quantity)}`);
    const delivery = payload.delivery_method === "pickup" ? "Recoger en tienda" : `Cotizar envío: ${payload.delivery_address}`;
    return [
      "Hola, quiero continuar con este pedido de Fantasmas Biker's Shop:",
      orderNumber ? `Pedido: ${orderNumber}` : "",
      "",
      ...itemLines,
      "",
      `Subtotal: ${money(subtotal())}`,
      `Entrega: ${delivery}`,
      payload.notes ? `Notas: ${payload.notes}` : "",
      "",
      `Cliente: ${payload.customer.name}`,
      `Teléfono: ${payload.customer.phone}`,
      orderNumber ? `Consulta tu pedido: ${location.origin}/pedido.html?folio=${encodeURIComponent(orderNumber)}` : ""
    ].filter(Boolean).join("\n");
  }

  function whatsappUrl(message) {
    const number = digits(settings.whatsapp || "5610329215");
    const international = number.length === 10 ? `52${number}` : number;
    return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
  }

  async function postWorker(path, payload) {
    const worker = String(settings.checkout_worker_url || "").trim().replace(/\/+$/, "");
    if (!/^https:\/\//i.test(worker)) throw new Error("Falta configurar la URL del Worker de cobros en el panel");
    const result = await fetch(`${worker}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await result.json().catch(() => ({}));
    if (!result.ok || !data.ok) throw new Error(data.error || "No se pudo procesar el pedido");
    return data;
  }

  function bankDetailsHtml() {
    const rows = [
      ["Banco", settings.bank_name],
      ["Titular", settings.bank_holder],
      ["CLABE", settings.bank_clabe],
      ["Cuenta o tarjeta", settings.bank_account],
      ["Indicaciones", settings.transfer_instructions]
    ].filter((row) => String(row[1] || "").trim());
    return rows.length ? rows.map(([label, value]) => `<p><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></p>`).join("") : '<p><span>Datos bancarios</span><b>Solicítalos por WhatsApp</b></p>';
  }

  function showTransferResult(payload, order) {
    $("#checkoutForm").hidden = true;
    $("#transferResult").hidden = false;
    $("#transferOrderNumber").textContent = order.order_number;
    $("#bankDetails").innerHTML = bankDetailsHtml();
    $("#transferWhatsappButton").href = whatsappUrl(`Hola, envío el comprobante del pedido ${order.order_number} por ${money(order.total)}.\nCliente: ${payload.customer.name}`);
    $("#transferTrackingButton").href = `pedido.html?folio=${encodeURIComponent(order.order_number)}`;
    cart = [];
    checkoutRequestKey = "";
    writeStorage(STORAGE_KEY, cart);
    renderCart();
  }

  async function submitCheckout(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!cart.length) return closeCheckout();
    const payload = orderPayload(form);
    writeStorage(CUSTOMER_KEY, payload.customer);
    const status = $("#checkoutStatus");
    const submit = $("#checkoutSubmitButton");
    status.classList.remove("error");
    status.textContent = "Procesando pedido…";
    submit.disabled = true;
    submit.textContent = "Procesando…";
    try {
      if (payload.payment_method === "mercadopago") {
        const order = await postWorker("/checkout", payload);
        status.textContent = "Abriendo Mercado Pago…";
        checkoutRequestKey = "";
        location.href = order.checkout_url;
        return;
      }
      if (payload.payment_method === "transfer") {
        const order = await postWorker("/order", payload);
        showTransferResult(payload, order);
        return;
      }
      let orderNumber = "";
      try {
        const order = await postWorker("/order", payload);
        orderNumber = order.order_number || "";
      } catch (_) {}
      window.open(whatsappUrl(cartMessage(payload, orderNumber)), "_blank", "noopener");
      if (orderNumber) checkoutRequestKey = "";
      status.textContent = orderNumber ? `Cotización registrada como ${orderNumber}.` : "La cotización se abrió en WhatsApp.";
    } catch (error) {
      status.textContent = error.message;
      status.classList.add("error");
    } finally {
      submit.disabled = false;
      submit.textContent = "Continuar";
    }
  }

  function showPaymentReturn() {
    const query = new URLSearchParams(location.search);
    const state = query.get("payment");
    if (!state) return;
    const notice = $("#paymentReturnNotice");
    const values = {
      success: ["Regreso de Mercado Pago", "La pantalla de regreso no confirma por sí sola el cobro. Consulta tu folio para ver el estado real del pedido.", ""],
      pending: ["Pago en verificación", "Consulta tu folio: el estado definitivo se obtiene desde nuestro sistema.", ""],
      failure: ["Pago no completado", "Consulta tu folio para confirmar el estado real o intentar otra forma de pago.", "failure"]
    };
    const value = values[state] || values.pending;
    $("#paymentReturnTitle").textContent = value[0];
    $("#paymentReturnText").textContent = value[1];
    notice.classList.add(value[2]);
    notice.hidden = false;
    history.replaceState({}, "", `${location.pathname}${location.hash || ""}`);
  }

  document.addEventListener("click", (event) => {
    const add = event.target.closest("[data-add-to-cart]");
    if (add) addProduct(add.dataset.addToCart);
    const row = event.target.closest("[data-cart-item]");
    if (row && event.target.closest("[data-cart-change]")) changeQuantity(row.dataset.cartItem, Number(event.target.closest("[data-cart-change]").dataset.cartChange));
    if (row && event.target.closest("[data-cart-remove]")) { checkoutRequestKey = ""; cart = cart.filter((item) => (item.cart_key || item.id) !== row.dataset.cartItem); writeStorage(STORAGE_KEY, cart); renderCart(); }
  });

  $("#cartOpenButton").addEventListener("click", openCart);
  $("#cartCloseButton").addEventListener("click", closeCart);
  $("#cartOverlay").addEventListener("click", closeCart);
  $("#cartCheckoutButton").addEventListener("click", () => openCheckout());
  $("#cartQuoteButton").addEventListener("click", () => openCheckout("quote"));
  $("#checkoutCloseButton").addEventListener("click", closeCheckout);
  $("#checkoutCancelButton").addEventListener("click", closeCheckout);
  $("#transferFinishButton").addEventListener("click", closeCheckout);
  $("#checkoutForm").addEventListener("submit", submitCheckout);
  $("#checkoutForm").elements.delivery_method.addEventListener("change", updateDeliveryFields);
  $("#checkoutForm").elements.email_notifications.addEventListener("change", updateEmailRequired);
  $("#applyCouponButton").addEventListener("click", applyCoupon);
  $("#couponCodeInput").addEventListener("input", () => { if (appliedCoupon && $("#couponCodeInput").value.trim().toUpperCase() !== appliedCoupon.code) { appliedCoupon = null; $("#couponFeedback").textContent = "Pulsa Aplicar para validar el nuevo código."; $("#couponFeedback").className = "coupon-feedback"; updateCheckoutSummary(); } });
  $("#closePaymentNotice").addEventListener("click", () => $("#paymentReturnNotice").hidden = true);
  window.addEventListener("fantasmas:products-ready", (event) => { products = Array.isArray(event.detail) ? event.detail : []; renderCart(); });
  window.addEventListener("fantasmas:settings-ready", () => { settings = window.FANTASMAS_STORE_SETTINGS || {}; });

  renderCart();
  showPaymentReturn();
  if (new URLSearchParams(location.search).get("cart") === "open") {
    openCart();
    history.replaceState({}, "", `${location.pathname}${location.hash || ""}`);
  }
})();
