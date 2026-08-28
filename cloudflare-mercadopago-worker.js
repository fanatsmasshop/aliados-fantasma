// FANTASMAS BIKER'S SHOP — WORKER SEGURO PARA MERCADO PAGO
// Este archivo se pega en un Worker de Cloudflare. NO va en GitHub Pages.
// Secrets: MP_ACCESS_TOKEN (opcional), MP_WEBHOOK_SECRET (recomendado/producción),
//          SUPABASE_SERVICE_ROLE_KEY, GMAIL_WEB_APP_SECRET (opcional),
//          RESEND_API_KEY (opcional)
// Variables: SUPABASE_URL, SITE_URL, ALLOWED_ORIGIN,
//            GMAIL_WEB_APP_URL (opcional), EMAIL_FROM (opcional para Resend)

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORKER_VERSION = "14.1.0";
const RATE_BUCKETS = new Map();

function enforceRateLimit(request, scope, limit, windowMs) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const bucket = RATE_BUCKETS.get(key);
  if (!bucket || bucket.resetAt <= now) {
    RATE_BUCKETS.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    bucket.count += 1;
    if (bucket.count > limit) {
      const error = new Error("Demasiados intentos. Espera unos minutos y vuelve a intentarlo.");
      error.status = 429;
      throw error;
    }
  }
  if (RATE_BUCKETS.size > 5000) {
    for (const [bucketKey, value] of RATE_BUCKETS) if (value.resetAt <= now) RATE_BUCKETS.delete(bucketKey);
  }
}

function cleanUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function allowedOrigin(request, env) {
  const configured = cleanUrl(env.ALLOWED_ORIGIN || env.SITE_URL);
  const origin = cleanUrl(request.headers.get("Origin"));
  return origin && origin === configured ? origin : configured;
}

function response(request, env, payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...JSON_HEADERS,
      "Access-Control-Allow-Origin": allowedOrigin(request, env),
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Fantasmas-Worker-Version": WORKER_VERSION
    }
  });
}

async function readJson(request) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 100000) throw new Error("Solicitud demasiado grande");
  try {
    return await request.json();
  } catch (_) {
    throw new Error("Datos de pedido inválidos");
  }
}

function hexToBytes(hex) {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function verifyMercadoPagoWebhookSignature(request, env, url) {
  if (!env.MP_WEBHOOK_SECRET) {
    const error = new Error("Falta configurar MP_WEBHOOK_SECRET en el Worker");
    error.status = 503;
    throw error;
  }
  const signatureHeader = String(request.headers.get("x-signature") || "").trim();
  const requestId = String(request.headers.get("x-request-id") || "").trim();
  const dataId = String(url.searchParams.get("data.id") || url.searchParams.get("data_id") || "").trim().toLowerCase();
  const parts = Object.fromEntries(signatureHeader.split(",").map((part) => {
    const index = part.indexOf("=");
    return index > 0 ? [part.slice(0, index).trim().toLowerCase(), part.slice(index + 1).trim()] : ["", ""];
  }).filter(([key, value]) => key && value));
  const ts = parts.ts || "";
  const received = hexToBytes(parts.v1 || "");
  if (!ts || !received) {
    const error = new Error("Firma de Webhook de Mercado Pago inválida");
    error.status = 401;
    throw error;
  }
  const manifest = `${dataId ? `id:${dataId};` : ""}${requestId ? `request-id:${requestId};` : ""}ts:${ts};`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(String(env.MP_WEBHOOK_SECRET)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify("HMAC", key, received, encoder.encode(manifest));
  if (!valid) {
    const error = new Error("Firma de Webhook de Mercado Pago no válida");
    error.status = 401;
    throw error;
  }
}

async function supabaseRequest(env, path, options = {}) {
  const url = `${cleanUrl(env.SUPABASE_URL)}/rest/v1/${path}`;
  const result = await fetch(url, {
    ...options,
    headers: {
      "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await result.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!result.ok) throw new Error(data?.message || data?.hint || `Error de base de datos (${result.status})`);
  return data;
}

function normalizeCustomer(source = {}) {
  const name = String(source.name || "").trim().slice(0, 120);
  const phone = String(source.phone || "").replace(/\D/g, "").slice(0, 15);
  const email = String(source.email || "").trim().toLowerCase().slice(0, 160);
  if (name.length < 2) throw new Error("Escribe el nombre del cliente");
  if (phone.length < 10) throw new Error("Escribe un teléfono válido");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("El correo no es válido");
  return { name, phone, email };
}

function activeNow(item, now = Date.now()) {
  return item.active !== false && (!item.starts_at || new Date(item.starts_at).getTime() <= now) && (!item.ends_at || new Date(item.ends_at).getTime() >= now);
}

function ruleMatchesProduct(rule, product) {
  if (rule.scope === "products") return Array.isArray(rule.product_ids) && rule.product_ids.includes(product.id);
  if (rule.scope === "categories") return Array.isArray(rule.category_names) && rule.category_names.includes(product.category);
  return true;
}

function applyDiscount(amount, type, value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return amount;
  return Math.max(0, type === "percentage" ? amount * (1 - Math.min(100, numeric) / 100) : amount - numeric);
}

async function canonicalOrder(env, payload) {
  const customer = normalizeCustomer(payload.customer);
  const emailNotifications = Boolean(payload.email_notifications) && Boolean(customer.email);
  const deliveryMethod = ["pickup", "shipping_quote"].includes(payload.delivery_method) ? payload.delivery_method : "pickup";
  const address = String(payload.delivery_address || "").trim().slice(0, 500);
  const notes = String(payload.notes || "").trim().slice(0, 500);
  const requestKey = UUID_PATTERN.test(String(payload.request_key || "")) ? String(payload.request_key) : crypto.randomUUID();
  if (deliveryMethod === "shipping_quote" && address.length < 8) throw new Error("Escribe la zona o dirección para cotizar el envío");
  if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > 50) throw new Error("El carrito está vacío o es demasiado grande");

  const quantities = new Map();
  const raffleSelections = [];
  const raffleKeys = new Set();
  payload.items.forEach((item) => {
    if (item.kind === "raffle_number") {
      const raffleId = String(item.raffle_id || "");
      const number = Number(item.number);
      const key = `${raffleId}:${number}`;
      if (!UUID_PATTERN.test(raffleId) || !Number.isInteger(number) || number < 1 || raffleKeys.has(key)) throw new Error("Hay un número de rifa inválido o repetido");
      raffleKeys.add(key);
      raffleSelections.push({ raffle_id: raffleId, number });
      return;
    }
    const id = String(item.id || "");
    const quantity = Number(item.quantity);
    if (!UUID_PATTERN.test(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new Error("Hay un producto o cantidad inválida");
    quantities.set(id, Math.min(20, (quantities.get(id) || 0) + quantity));
  });

  const ids = [...quantities.keys()];
  const products = ids.length ? await supabaseRequest(env, `shop_products?select=id,name,category,price,image_url,active,online_sale,stock&id=in.(${ids.join(",")})`) : [];
  if (!Array.isArray(products) || products.length !== ids.length) throw new Error("Uno de los productos ya no está disponible");

  const promotions = products.length ? await supabaseRequest(env, "shop_promotions?select=id,title,discount_type,discount_value,scope,product_ids,category_names,minimum_purchase,active,starts_at,ends_at&active=eq.true&discount_value=not.is.null") : [];
  const activePromotions = Array.isArray(promotions) ? promotions.filter((promo) => activeNow(promo)) : [];
  const items = products.map((product) => {
    const quantity = quantities.get(product.id);
    const unitPrice = Number(product.price);
    if (!product.active || product.online_sale === false || !Number.isFinite(unitPrice) || unitPrice < 0) throw new Error(`${product.name} no está disponible para compra en línea`);
    if (product.stock !== null && quantity > Number(product.stock)) throw new Error(`Solo quedan ${product.stock} unidades de ${product.name}`);
    let salePrice = unitPrice;
    const appliedPromotions = [];
    activePromotions.forEach((promo) => {
      if (!ruleMatchesProduct(promo, product) || unitPrice * quantity < Number(promo.minimum_purchase || 0)) return;
      salePrice = applyDiscount(salePrice, promo.discount_type, promo.discount_value);
      appliedPromotions.push(promo.id);
    });
    return {
      id: product.id,
      kind: "product",
      name: String(product.name).slice(0, 180),
      original_unit_price: Math.round(unitPrice * 100) / 100,
      unit_price: Math.round(salePrice * 100) / 100,
      automatic_promotions: appliedPromotions,
      quantity,
      image_url: product.image_url || ""
    };
  });

  if (raffleSelections.length) {
    const raffleIds = [...new Set(raffleSelections.map((item) => item.raffle_id))];
    const raffles = await supabaseRequest(env, `shop_raffles?select=id,price,total_numbers,main_prize,image_url,active,sales_open,max_numbers_per_order&id=in.(${raffleIds.join(",")})`);
    if (!Array.isArray(raffles) || raffles.length !== raffleIds.length) throw new Error("Una rifa ya no está disponible");
    for (const raffle of raffles) {
      const selected = raffleSelections.filter((item) => item.raffle_id === raffle.id);
      if (!raffle.active || !raffle.sales_open) throw new Error("La venta de una rifa está cerrada");
      if (selected.length > Number(raffle.max_numbers_per_order || 5)) throw new Error(`Máximo ${raffle.max_numbers_per_order || 5} números de esa rifa por pedido`);
      for (const selection of selected) {
        if (selection.number > Number(raffle.total_numbers)) throw new Error("Uno de los números ya no existe");
        items.push({
          id: raffle.id,
          kind: "raffle_number",
          raffle_id: raffle.id,
          raffle_number: selection.number,
          name: `Rifa ${raffle.main_prize} · Número ${String(selection.number).padStart(2, "0")}`,
          unit_price: Math.round(Number(raffle.price) * 100) / 100,
          quantity: 1,
          image_url: raffle.image_url || ""
        });
      }
    }
  }

  const automaticSubtotal = Math.round(items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0) * 100) / 100;
  const originalSubtotal = Math.round(items.reduce((sum, item) => sum + Number(item.original_unit_price ?? item.unit_price) * item.quantity, 0) * 100) / 100;
  const couponCode = String(payload.coupon_code || "").trim().toUpperCase().slice(0, 32);
  let coupon = null;
  let couponDiscount = 0;
  if (couponCode) {
    const rows = await supabaseRequest(env, `shop_discount_codes?select=*&code=eq.${encodeURIComponent(couponCode)}&limit=1`);
    coupon = rows?.[0];
    if (!coupon || !activeNow(coupon)) throw new Error("El código promocional no existe o no está vigente");
    if (coupon.max_uses !== null && Number(coupon.uses_count) >= Number(coupon.max_uses)) throw new Error("Este código promocional alcanzó su límite de usos");
    if (automaticSubtotal < Number(coupon.minimum_purchase || 0)) throw new Error(`Este código requiere una compra mínima de $${Number(coupon.minimum_purchase).toLocaleString("es-MX")}`);
    const eligible = items.reduce((sum, item) => {
      const product = products.find((entry) => entry.id === item.id);
      return product && ruleMatchesProduct(coupon, product) ? sum + item.unit_price * item.quantity : sum;
    }, 0);
    couponDiscount = Math.round((eligible - applyDiscount(eligible, coupon.discount_type, coupon.discount_value)) * 100) / 100;
  }
  const subtotal = Math.max(0, Math.round((automaticSubtotal - couponDiscount) * 100) / 100);
  return { customer, emailNotifications, deliveryMethod, address, notes, items, raffleSelections, subtotal, originalSubtotal, automaticSubtotal, couponDiscount, coupon, requestKey };
}

async function createOrder(env, canonical, paymentMethod) {
  const existing = await supabaseRequest(env, `shop_orders?select=*&metadata->>request_key=eq.${encodeURIComponent(canonical.requestKey)}&limit=1`);
  if (Array.isArray(existing) && existing[0]) return existing[0];
  const status = paymentMethod === "mercadopago" ? "pending_payment" : paymentMethod === "transfer" ? "transfer_pending" : "quote_requested";
  const payload = {
    customer_name: canonical.customer.name,
    customer_phone: canonical.customer.phone,
    customer_email: canonical.customer.email,
    email_notifications: canonical.emailNotifications,
    delivery_method: canonical.deliveryMethod,
    delivery_address: canonical.address,
    customer_notes: canonical.notes,
    payment_method: paymentMethod,
    status,
    items: canonical.items,
    subtotal: canonical.subtotal,
    shipping_cost: null,
    total: canonical.subtotal,
    metadata: { source: "web_cart_v14", request_key: canonical.requestKey, original_subtotal: canonical.originalSubtotal, automatic_discount: Math.max(0, canonical.originalSubtotal - canonical.automaticSubtotal), coupon_code: canonical.coupon?.code || null, coupon_discount: canonical.couponDiscount }
  };
  const rows = await supabaseRequest(env, "shop_orders?select=*", {
    method: "POST",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify(payload)
  });
  if (!Array.isArray(rows) || !rows[0]) throw new Error("No se pudo crear el pedido");
  const order = rows[0];
  if (canonical.coupon?.id) {
    await supabaseRequest(env, `shop_discount_codes?id=eq.${canonical.coupon.id}&uses_count=eq.${Number(canonical.coupon.uses_count || 0)}`, {
      method: "PATCH", headers: { "Prefer": "return=minimal" },
      body: JSON.stringify({ uses_count: Number(canonical.coupon.uses_count || 0) + 1, updated_at: new Date().toISOString() })
    });
  }
  if (canonical.raffleSelections.length) {
    try {
      await supabaseRequest(env, "rpc/reserve_shop_raffle_numbers", {
        method: "POST",
        body: JSON.stringify({ p_order_id: order.id, p_selections: canonical.raffleSelections })
      });
    } catch (error) {
      await supabaseRequest(env, `shop_orders?id=eq.${order.id}`, { method: "DELETE" }).catch(() => null);
      throw error;
    }
  }
  return order;
}

const ORDER_STATUS = {
  pending: { label: "Pedido recibido", message: "Recibimos tu pedido y pronto lo revisaremos." },
  pending_payment: { label: "Esperando pago", message: "Tu pedido fue creado y está esperando la confirmación del pago." },
  transfer_pending: { label: "Esperando transferencia", message: "Recibimos tu pedido. Envía tu comprobante para confirmar el pago." },
  quote_requested: { label: "Cotización solicitada", message: "Recibimos tu solicitud y te contactaremos para confirmar precio y entrega." },
  paid: { label: "Pago confirmado", message: "Tu pago fue confirmado. En breve comenzaremos a preparar el pedido." },
  processing: { label: "En preparación", message: "Ya estamos preparando tu pedido." },
  ready: { label: "Pedido listo", message: "Tu pedido ya está listo. Si elegiste recoger, puedes pasar a la tienda." },
  fulfilled: { label: "Pedido entregado", message: "Tu pedido fue marcado como entregado. Gracias por comprar con nosotros." },
  cancelled: { label: "Pedido cancelado", message: "El pedido fue cancelado. Contáctanos si necesitas más información." },
  payment_failed: { label: "Pago no completado", message: "No se pudo confirmar el pago. Puedes contactarnos para elegir otra forma de pago." }
};

function escapeEmailHtml(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

async function deliverEmail(env, message) {
  const gmailReady = Boolean(env.GMAIL_WEB_APP_URL && env.GMAIL_WEB_APP_SECRET);
  const resendReady = Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
  const attempts = [];

  if (gmailReady) {
    try {
      const result = await fetch(cleanUrl(env.GMAIL_WEB_APP_URL), {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ secret: env.GMAIL_WEB_APP_SECRET, to: message.to, subject: message.subject, html: message.html })
      });
      const bodyText = await result.text();
      let data = {};
      try { data = bodyText ? JSON.parse(bodyText) : {}; } catch (_) { data = {}; }
      if (result.ok && data.ok === true) return { sent: true, provider: "gmail", remaining: data.remaining ?? null, attempts };
      attempts.push({ provider: "gmail", status: result.status, error: data.error || bodyText.slice(0, 240) || "Respuesta inválida de Apps Script" });
    } catch (error) {
      attempts.push({ provider: "gmail", status: 0, error: error.message || "No se pudo conectar con Apps Script" });
    }
  }

  if (resendReady) {
    try {
      const result = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: env.EMAIL_FROM, to: [message.to], subject: message.subject, html: message.html })
      });
      const data = await result.json().catch(() => ({}));
      if (result.ok) return { sent: true, provider: "resend", remaining: null, attempts };
      attempts.push({ provider: "resend", status: result.status, error: data.message || "Resend rechazó el correo" });
    } catch (error) {
      attempts.push({ provider: "resend", status: 0, error: error.message || "No se pudo conectar con Resend" });
    }
  }

  if (!gmailReady && !resendReady) attempts.push({ provider: null, status: 0, error: "No hay proveedor de correo configurado" });
  return { sent: false, provider: null, remaining: null, attempts };
}

function paymentStatusInfo(order) {
  const status = String(order.mp_payment_status || "").toLowerCase();
  const labels = {
    approved: ["Pago aprobado", "Mercado Pago confirmó el cobro."],
    pending: ["Pago pendiente", "Mercado Pago todavía está procesando el pago."],
    in_process: ["Pago en proceso", "Mercado Pago todavía está validando el pago."],
    rejected: ["Pago rechazado", "Mercado Pago rechazó el cobro. Puedes intentar nuevamente con otro medio de pago."],
    cancelled: ["Pago cancelado", "El intento de pago fue cancelado y no se confirmó ningún cobro."],
    refunded: ["Pago reembolsado", "Mercado Pago reporta que este pago fue reembolsado."],
    charged_back: ["Pago con contracargo", "Mercado Pago reporta un contracargo sobre este pago."]
  };
  const value = labels[status];
  return { status, label: value?.[0] || "", message: value?.[1] || "" };
}

function publicOrder(order) {
  const payment = paymentStatusInfo(order);
  let statusLabel = ORDER_STATUS[order.status]?.label || order.status;
  let statusMessage = ORDER_STATUS[order.status]?.message || "Consulta la información actual de tu pedido.";
  if (order.payment_method === "mercadopago" && payment.status && order.status !== "paid" && !["processing", "ready", "fulfilled"].includes(order.status)) {
    statusLabel = payment.label || statusLabel;
    statusMessage = payment.message || statusMessage;
  }
  return {
    order_number: order.order_number,
    status: order.status,
    status_label: statusLabel,
    status_message: statusMessage,
    payment_status: payment.status,
    payment_status_label: payment.label,
    items: Array.isArray(order.items) ? order.items.map((item) => ({ name: item.name, quantity: item.quantity, unit_price: item.unit_price })) : [],
    subtotal: order.subtotal,
    original_subtotal: Number(order.metadata?.original_subtotal ?? order.subtotal ?? 0),
    automatic_discount: Number(order.metadata?.automatic_discount ?? 0),
    coupon_code: order.metadata?.coupon_code || "",
    coupon_discount: Number(order.metadata?.coupon_discount ?? 0),
    shipping_cost: order.shipping_cost,
    total: order.total,
    payment_method: order.payment_method,
    delivery_method: order.delivery_method,
    created_at: order.created_at,
    updated_at: order.updated_at
  };
}

async function sendOrderEmail(env, order) {
  const gmailReady = Boolean(env.GMAIL_WEB_APP_URL && env.GMAIL_WEB_APP_SECRET);
  const resendReady = Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
  if (!order.email_notifications || !order.customer_email || (!gmailReady && !resendReady)) return false;
  if (order.email_last_status === order.status) return false;
  const status = ORDER_STATUS[order.status] || { label: order.status, message: "Tu pedido tiene una actualización." };
  const trackingUrl = `${cleanUrl(env.SITE_URL)}/pedido.html?folio=${encodeURIComponent(order.order_number)}`;
  const itemRows = (Array.isArray(order.items) ? order.items : []).map((item) => `<tr><td style="padding:8px;border-bottom:1px solid #292d36">${Number(item.quantity) || 1} × ${escapeEmailHtml(item.name)}</td><td style="padding:8px;border-bottom:1px solid #292d36;text-align:right">$${(Number(item.unit_price || 0) * Number(item.quantity || 1)).toFixed(2)}</td></tr>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#07080b;color:#f5f3ef;font-family:Arial,sans-serif"><div style="max-width:620px;margin:auto;padding:32px"><div style="border-top:5px solid #ff3da1;background:#111318;padding:28px"><p style="margin:0;color:#28a8ff;font-size:12px;font-weight:bold;letter-spacing:2px">FANTASMAS BIKER'S SHOP</p><h1 style="margin:12px 0 4px">${escapeEmailHtml(status.label)}</h1><p style="color:#adb1ba">Pedido ${escapeEmailHtml(order.order_number)}</p><p style="font-size:16px;line-height:1.6">Hola ${escapeEmailHtml(order.customer_name)}, ${escapeEmailHtml(status.message)}</p><table style="width:100%;border-collapse:collapse;margin:22px 0;color:#f5f3ef">${itemRows}</table><p style="font-size:22px;font-weight:bold;text-align:right">Total: $${Number(order.total || 0).toFixed(2)} MXN</p><a href="${escapeEmailHtml(trackingUrl)}" style="display:block;padding:14px;background:#ff3da1;color:white;text-align:center;text-decoration:none;font-weight:bold">CONSULTAR MI PEDIDO</a><p style="margin-top:24px;color:#8f939c;font-size:12px;line-height:1.6">Este correo corresponde a una actualización solicitada durante tu compra. Si necesitas ayuda, contáctanos por WhatsApp.</p></div></div></body></html>`;
  const subject = `${status.label} · ${order.order_number}`;
  try {
    const delivery = await deliverEmail(env, { to: order.customer_email, subject, html });
    if (!delivery.sent) return false;
    await patchOrder(env, order.id, { email_last_status: order.status, email_last_sent_at: new Date().toISOString() });
    return true;
  } catch (_) {
    return false;
  }
}

async function handleAdminEmailTest(request, env) {
  const user = await authenticateAdmin(request, env);
  const payload = await readJson(request);
  const to = String(payload.email || user.email || "").trim().toLowerCase().slice(0, 160);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("Escribe un correo válido para la prueba");
  const html = `<!doctype html><html><body style="margin:0;background:#07080b;color:#f5f3ef;font-family:Arial,sans-serif"><div style="max-width:600px;margin:auto;padding:35px"><div style="padding:30px;border-top:5px solid #ff3da1;background:#111318"><p style="color:#28a8ff;font-weight:bold;letter-spacing:2px">FANTASMAS BIKER'S SHOP</p><h1>Correo conectado correctamente</h1><p style="color:#c8cbd2;line-height:1.7">Esta prueba confirma que Cloudflare Worker puede solicitar a Gmail el envío de actualizaciones de pedidos.</p><p style="color:#8f939c;font-size:12px">Worker ${WORKER_VERSION} · ${new Date().toISOString()}</p></div></div></body></html>`;
  const delivery = await deliverEmail(env, { to, subject: "Prueba de correos · Fantasmas Biker's Shop", html });
  return response(request, env, { ok: delivery.sent, ...delivery }, delivery.sent ? 200 : 502);
}

async function patchOrder(env, id, changes) {
  return supabaseRequest(env, `shop_orders?id=eq.${id}`, {
    method: "PATCH",
    headers: { "Prefer": "return=minimal" },
    body: JSON.stringify({ ...changes, updated_at: new Date().toISOString() })
  });
}

async function createMercadoPagoPreference(request, env, canonical, order) {
  if (!env.MP_ACCESS_TOKEN) throw new Error("Falta configurar MP_ACCESS_TOKEN en el Worker");
  const siteUrl = cleanUrl(env.SITE_URL);
  const workerUrl = new URL(request.url).origin;
  const nameParts = canonical.customer.name.split(/\s+/);
  const payer = {
    name: nameParts.shift() || canonical.customer.name,
    surname: nameParts.join(" "),
    phone: { number: canonical.customer.phone }
  };
  if (canonical.customer.email) payer.email = canonical.customer.email;

  const preference = {
    items: canonical.items.map((item) => ({
      id: item.id,
      title: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      currency_id: "MXN",
      picture_url: item.image_url || undefined
    })),
    payer,
    external_reference: order.id,
    statement_descriptor: "FANTASMAS BIKERS",
    // El regreso del cliente NO decide si el pedido está pagado.
    // Siempre vuelve a la pantalla del folio, que consulta el estado real al Worker.
    back_urls: {
      success: `${siteUrl}/pedido.html?folio=${encodeURIComponent(order.order_number)}&retorno_mp=success`,
      pending: `${siteUrl}/pedido.html?folio=${encodeURIComponent(order.order_number)}&retorno_mp=pending`,
      failure: `${siteUrl}/pedido.html?folio=${encodeURIComponent(order.order_number)}&retorno_mp=failure`
    },
    auto_return: "approved",
    expires: true,
    expiration_date_from: new Date().toISOString(),
    expiration_date_to: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    notification_url: `${workerUrl}/webhook`,
    metadata: { order_id: order.id, order_number: order.order_number }
  };

  const result = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": order.id
    },
    body: JSON.stringify(preference)
  });
  const data = await result.json();
  if (!result.ok || !data.id || !data.init_point) throw new Error(data.message || "Mercado Pago no pudo iniciar el cobro");
  await patchOrder(env, order.id, { mp_preference_id: data.id });
  return { preference_id: data.id, checkout_url: data.init_point };
}

async function handleCheckout(request, env) {
  const payload = await readJson(request);
  const canonical = await canonicalOrder(env, payload);
  if (canonical.deliveryMethod === "shipping_quote") {
    throw new Error("Primero debemos cotizar el envío antes de cobrar en línea");
  }
  const order = await createOrder(env, canonical, "mercadopago");
  try {
    const payment = await createMercadoPagoPreference(request, env, canonical, order);
    const emailSent = await sendOrderEmail(env, order);
    return response(request, env, { ok: true, order_id: order.id, order_number: order.order_number, email_sent: emailSent, ...payment });
  } catch (error) {
    await patchOrder(env, order.id, { status: "payment_failed" });
    await supabaseRequest(env, "rpc/release_shop_order_raffles", { method: "POST", body: JSON.stringify({ p_order_id: order.id }) }).catch(() => null);
    throw error;
  }
}

async function handleManualOrder(request, env) {
  const payload = await readJson(request);
  const canonical = await canonicalOrder(env, payload);
  const paymentMethod = canonical.deliveryMethod === "shipping_quote" ? "quote" : payload.payment_method === "transfer" ? "transfer" : "quote";
  const order = await createOrder(env, canonical, paymentMethod);
  const emailSent = await sendOrderEmail(env, order);
  return response(request, env, { ok: true, order_id: order.id, order_number: order.order_number, total: order.total, payment_method: paymentMethod, email_sent: emailSent });
}

async function handleCouponValidation(request, env) {
  const payload = await readJson(request);
  const code = String(payload.coupon_code || "").trim().toUpperCase();
  if (!code) throw new Error("Escribe un código promocional");
  const canonical = await canonicalOrder(env, {
    ...payload,
    coupon_code: code,
    customer: { name: "Cliente", phone: "5512345678" },
    delivery_method: "pickup",
    payment_method: "quote",
    request_key: crypto.randomUUID()
  });
  if (!canonical.coupon) throw new Error("El código promocional no existe o no está vigente");
  return response(request, env, {
    ok: true,
    code: canonical.coupon.code,
    title: canonical.coupon.title || `Código ${canonical.coupon.code}`,
    original_subtotal: canonical.originalSubtotal,
    automatic_subtotal: canonical.automaticSubtotal,
    coupon_discount: canonical.couponDiscount,
    subtotal: canonical.subtotal
  });
}

async function handleTrackOrder(request, env) {
  const payload = await readJson(request);
  const orderNumber = String(payload.order_number || "").trim().toUpperCase().slice(0, 20);
  if (!/^FBS-[A-F0-9]{8}(?:[A-F0-9]{4})?$/.test(orderNumber)) throw new Error("Escribe un folio válido");
  const rows = await supabaseRequest(env, `shop_orders?select=*&order_number=eq.${encodeURIComponent(orderNumber)}&limit=1`);
  const order = rows?.[0];
  if (!order) throw new Error("No encontramos un pedido con ese folio");
  return response(request, env, { ok: true, order: publicOrder(order) });
}

async function authenticateAdmin(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new Error("Sesión administrativa no válida");
  const userResponse = await fetch(`${cleanUrl(env.SUPABASE_URL)}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: authorization }
  });
  const user = await userResponse.json().catch(() => null);
  if (!userResponse.ok || !UUID_PATTERN.test(String(user?.id || ""))) throw new Error("Sesión administrativa no válida");
  const admins = await supabaseRequest(env, `shop_admins?select=user_id&user_id=eq.${user.id}&limit=1`);
  if (!admins?.[0]) throw new Error("Este usuario no tiene permiso de administrador");
  return user;
}

async function handleAdminOrderStatus(request, env) {
  await authenticateAdmin(request, env);
  const payload = await readJson(request);
  const orderId = String(payload.order_id || "");
  const nextStatus = String(payload.status || "");
  if (!UUID_PATTERN.test(orderId)) throw new Error("Pedido inválido");
  if (!["paid", "processing", "ready", "fulfilled", "cancelled"].includes(nextStatus)) throw new Error("Estado inválido");
  const currentRows = await supabaseRequest(env, `shop_orders?select=id,status,stock_applied,payment_method&id=eq.${orderId}&limit=1`);
  const currentOrder = currentRows?.[0];
  if (!currentOrder) throw new Error("Pedido no encontrado");
  if (nextStatus === "paid") {
    await supabaseRequest(env, "rpc/confirm_shop_order_payment", {
      method: "POST",
      body: JSON.stringify({ p_order_id: orderId, p_payment_id: `manual-${Date.now()}`, p_payment_status: "approved" })
    });
  } else {
    if (nextStatus === "cancelled" && !currentOrder.stock_applied) {
      await supabaseRequest(env, "rpc/release_shop_order_raffles", { method: "POST", body: JSON.stringify({ p_order_id: orderId }) });
    }
    await patchOrder(env, orderId, { status: nextStatus });
  }
  const rows = await supabaseRequest(env, `shop_orders?select=*&id=eq.${orderId}&limit=1`);
  const order = rows?.[0];
  if (!order) throw new Error("Pedido no encontrado");
  const emailSent = await sendOrderEmail(env, order);
  return response(request, env, { ok: true, order: publicOrder(order), email_sent: emailSent });
}

async function handleAdminOrderDelete(request, env) {
  await authenticateAdmin(request, env);
  const payload = await readJson(request);
  const orderId = String(payload.order_id || "");
  if (!UUID_PATTERN.test(orderId)) throw new Error("Pedido inválido");
  const rows = await supabaseRequest(env, `shop_orders?select=id,status,stock_applied&id=eq.${orderId}&limit=1`);
  const order = rows?.[0];
  if (!order) throw new Error("Pedido no encontrado");
  if (!order.stock_applied) await supabaseRequest(env, "rpc/release_shop_order_raffles", { method: "POST", body: JSON.stringify({ p_order_id: orderId }) }).catch(() => null);
  await supabaseRequest(env, `shop_orders?id=eq.${orderId}`, { method: "DELETE", headers: { "Prefer": "return=minimal" } });
  return response(request, env, { ok: true, deleted: orderId });
}

async function mercadoPagoPayment(env, paymentId) {
  const result = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { "Authorization": `Bearer ${env.MP_ACCESS_TOKEN}` }
  });
  const data = await result.json();
  if (!result.ok) throw new Error(data.message || "No se pudo verificar el pago");
  return data;
}

async function handleWebhook(request, env) {
  const url = new URL(request.url);
  await verifyMercadoPagoWebhookSignature(request, env, url);
  let body = {};
  try { body = await request.json(); } catch (_) { body = {}; }
  const type = body.type || url.searchParams.get("type") || "";
  const paymentId = body.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id");
  if (type !== "payment" || !paymentId) return response(request, env, { ok: true, ignored: true });

  const payment = await mercadoPagoPayment(env, paymentId);
  const orderId = String(payment.external_reference || "");
  if (!UUID_PATTERN.test(orderId)) return response(request, env, { ok: true, ignored: true });

  const orders = await supabaseRequest(env, `shop_orders?select=id,total,status,stock_applied&id=eq.${orderId}&limit=1`);
  const order = orders?.[0];
  if (!order) return response(request, env, { ok: true, ignored: true });
  if (Math.abs(Number(order.total) - Number(payment.transaction_amount)) > 0.01 || payment.currency_id !== "MXN") {
    return response(request, env, { ok: false, error: "El importe no coincide" }, 409);
  }

  if (payment.status === "approved") {
    await supabaseRequest(env, "rpc/confirm_shop_order_payment", {
      method: "POST",
      body: JSON.stringify({ p_order_id: orderId, p_payment_id: String(payment.id), p_payment_status: payment.status })
    });
  } else {
    // Rechazado = no pagado. Cancelado = pedido cancelado.
    // Reembolsos/contracargos se conservan como incidencia de pago y NO liberan
    // automáticamente inventario/números que ya hayan sido confirmados.
    const nextStatus = payment.status === "cancelled" ? "cancelled"
      : ["rejected", "refunded", "charged_back"].includes(payment.status) ? "payment_failed"
      : "pending_payment";
    await patchOrder(env, orderId, { status: nextStatus, mp_payment_id: String(payment.id), mp_payment_status: payment.status });
    if (!order.stock_applied && ["rejected", "cancelled"].includes(payment.status)) {
      await supabaseRequest(env, "rpc/release_shop_order_raffles", { method: "POST", body: JSON.stringify({ p_order_id: orderId }) });
    }
  }
  const updatedRows = await supabaseRequest(env, `shop_orders?select=*&id=eq.${orderId}&limit=1`);
  if (updatedRows?.[0]) await sendOrderEmail(env, updatedRows[0]);
  return response(request, env, { ok: true });
}

function assertConfigured(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Falta configurar Supabase en el Worker");
  if (!env.SITE_URL || !env.ALLOWED_ORIGIN) throw new Error("Falta configurar SITE_URL y ALLOWED_ORIGIN");
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return response(request, env, { ok: true });
    const url = new URL(request.url);
    try {
      assertConfigured(env);
      if (request.method === "GET" && url.pathname === "/health") {
        const emailProvider = env.GMAIL_WEB_APP_URL && env.GMAIL_WEB_APP_SECRET ? "gmail" : env.RESEND_API_KEY && env.EMAIL_FROM ? "resend" : null;
        return response(request, env, { ok: true, version: WORKER_VERSION, mercado_pago: Boolean(env.MP_ACCESS_TOKEN), webhook_signature: Boolean(env.MP_WEBHOOK_SECRET), email_notifications: Boolean(emailProvider), email_provider: emailProvider });
      }
      if (request.method === "POST" && url.pathname === "/checkout") { enforceRateLimit(request, "checkout", 12, 300000); return await handleCheckout(request, env); }
      if (request.method === "POST" && url.pathname === "/order") { enforceRateLimit(request, "order", 12, 300000); return await handleManualOrder(request, env); }
      if (request.method === "POST" && url.pathname === "/coupon/validate") { enforceRateLimit(request, "coupon", 30, 300000); return await handleCouponValidation(request, env); }
      if (request.method === "POST" && url.pathname === "/track") { enforceRateLimit(request, "track", 20, 600000); return await handleTrackOrder(request, env); }
      if (request.method === "POST" && url.pathname === "/admin/order-status") return await handleAdminOrderStatus(request, env);
      if (request.method === "POST" && url.pathname === "/admin/order-delete") return await handleAdminOrderDelete(request, env);
      if (request.method === "POST" && url.pathname === "/admin/email-test") return await handleAdminEmailTest(request, env);
      if (request.method === "POST" && url.pathname === "/webhook") return await handleWebhook(request, env);
      return response(request, env, { ok: false, error: "Ruta no encontrada" }, 404);
    } catch (error) {
      return response(request, env, { ok: false, error: error.message || "No se pudo procesar la solicitud" }, Number(error.status) || 400);
    }
  }
};
