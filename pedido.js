(function () {
  const $ = (selector) => document.querySelector(selector);
  const money = (value) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  const escapeHtml = (value) =>
    String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  const statusOrder = ["pending", "paid", "processing", "ready", "fulfilled"];
  const stepLabels = ["Recibido", "Pagado", "Preparando", "Listo", "Entregado"];
  const statusPosition = {
    pending: 0,
    pending_payment: 0,
    transfer_pending: 0,
    quote_requested: 0,
    payment_failed: 0,
    paid: 1,
    processing: 2,
    ready: 3,
    fulfilled: 4,
  };
  let workerUrl = "";
  let returnPolls = 0;

  async function loadWorkerUrl() {
    const config = window.FANTASMAS_SUPABASE || {};
    if (!window.supabase || !config.url || !config.publishableKey)
      throw new Error("La consulta de pedidos todavía no está configurada");
    const client = window.supabase.createClient(
      config.url,
      config.publishableKey,
    );
    const { data, error } = await client
      .from("shop_settings")
      .select("setting_value")
      .eq("setting_key", "store_info")
      .maybeSingle();
    if (error) throw error;
    workerUrl = String(data?.setting_value?.checkout_worker_url || "")
      .trim()
      .replace(/\/+$/, "");
    if (!/^https:\/\//i.test(workerUrl))
      throw new Error("La consulta de pedidos todavía no está disponible");
  }

  function renderTimeline(order) {
    if (order.status === "cancelled") {
      $("#orderTimeline").innerHTML =
        '<div class="timeline-step current">Pedido cancelado</div>';
      return;
    }
    const position = statusPosition[order.status] ?? 0;
    $("#orderTimeline").innerHTML = statusOrder
      .map(
        (status, index) =>
          `<div class="timeline-step ${index <= position ? "done" : ""} ${index === position ? "current" : ""}">${stepLabels[index]}</div>`,
      )
      .join("");
  }

  function paymentMethodLabel(order) {
    if (order.payment_method === "transfer") return "Transferencia";
    if (order.payment_method !== "mercadopago") return "Cotización";
    return order.payment_status_label ? `Mercado Pago · ${order.payment_status_label}` : "Mercado Pago";
  }

  function updateReturnCard(order) {
    const returnState = new URLSearchParams(location.search).get("retorno_mp");
    const card = $("#paymentReturnCard");
    if (!returnState || !card) return;
    card.hidden = false;
    card.classList.remove("success", "failure");
    if (order.status === "paid" || ["processing", "ready", "fulfilled"].includes(order.status)) {
      card.classList.add("success");
      $("#paymentReturnHeading").textContent = "Pago confirmado por el sistema";
      try { localStorage.setItem("fantasmas_shop_cart_v1", "[]"); } catch (_) {}
    } else if (order.status === "payment_failed" || order.status === "cancelled") {
      card.classList.add("failure");
      $("#paymentReturnHeading").textContent = order.status_label;
    } else {
      $("#paymentReturnHeading").textContent = "Pago todavía pendiente de confirmación";
    }
  }

  function renderOrder(order) {
    $("#resultOrderNumber").textContent = order.order_number;
    $("#resultStatus").textContent = order.status_label;
    $("#resultStatusTitle").textContent = order.status_label;
    $("#resultStatusMessage").textContent = order.status_message;
    $("#resultItems").innerHTML = order.items
      .map(
        (item) =>
          `<p><span>${Number(item.quantity) || 1} × ${escapeHtml(item.name)}</span><b>${money(Number(item.unit_price || 0) * Number(item.quantity || 1))}</b></p>`,
      )
      .join("");
    $("#resultDelivery").textContent =
      order.delivery_method === "pickup"
        ? "Recoger en tienda"
        : "Envío por cotizar";
    $("#resultPayment").textContent = paymentMethodLabel(order);
    const originalSubtotal = Number(order.original_subtotal ?? order.subtotal ?? 0);
    const automaticDiscount = Number(order.automatic_discount ?? 0);
    const couponDiscount = Number(order.coupon_discount ?? 0);
    $("#resultSubtotal").textContent = money(originalSubtotal);
    $("#resultAutomaticDiscountRow").hidden = automaticDiscount <= 0;
    $("#resultAutomaticDiscount").textContent = `−${money(automaticDiscount)}`;
    $("#resultCouponRow").hidden = couponDiscount <= 0;
    $("#resultCouponLabel").textContent = order.coupon_code ? `Cupón ${order.coupon_code}` : "Cupón";
    $("#resultCouponDiscount").textContent = `−${money(couponDiscount)}`;
    $("#resultTotal").textContent = money(order.total);
    $("#resultUpdated").textContent =
      `Última actualización: ${new Date(order.updated_at).toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" })}`;
    renderTimeline(order);
    updateReturnCard(order);
    $("#trackingResult").hidden = false;
    $("#trackingResult").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function lookupOrder(orderNumber) {
    const message = $("#trackingMessage");
    const button = $("#trackingButton");
    message.textContent = "Consultando…";
    button.disabled = true;
    $("#trackingResult").hidden = true;
    try {
      if (!workerUrl) await loadWorkerUrl();
      const result = await fetch(`${workerUrl}/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_number: orderNumber }),
      });
      const data = await result.json().catch(() => ({}));
      if (!result.ok || !data.ok)
        throw new Error(data.error || "No se pudo consultar el pedido");
      message.textContent = "";
      renderOrder(data.order);
      const returnedFromMp = new URLSearchParams(location.search).has("retorno_mp");
      if (returnedFromMp && data.order.payment_method === "mercadopago" && data.order.status === "pending_payment" && returnPolls < 4) {
        returnPolls += 1;
        setTimeout(() => lookupOrder(data.order.order_number), 2500);
      }
    } catch (error) {
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  function submit(event) {
    event.preventDefault();
    lookupOrder(event.currentTarget.elements.order_number.value);
  }

  const folio = new URLSearchParams(location.search).get("folio");
  if (folio) $("#orderNumber").value = folio.toUpperCase();
  $("#trackingForm").addEventListener("submit", submit);
  loadWorkerUrl()
    .then(() => {
      if (folio) lookupOrder(folio);
    })
    .catch((error) => {
      $("#trackingMessage").textContent = error.message;
    });
})();
