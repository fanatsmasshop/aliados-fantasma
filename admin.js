(function () {
  const config = window.FANTASMAS_SUPABASE || {};
  const configured = config.url && config.publishableKey &&
    !config.url.includes("PON_AQUI") && !config.publishableKey.includes("PON_AQUI");

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const loginView = $("#loginView");
  const adminApp = $("#adminApp");
  let client = null;
  let products = [];
  let productPage = 1;
  const PRODUCTS_PER_PAGE = 25;
  let orderPage = 1;
  const ORDERS_PER_PAGE = 30;
  let promotions = [];
  let discountCodes = [];
  let orders = [];
  let storeSettings = {};

  function toast(message, error = false) {
    const element = $("#toast");
    element.textContent = message;
    element.className = `toast show${error ? " error" : ""}`;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.className = "toast", 3200);
  }

  function escapeHtml(text) {
    return String(text || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function money(value) {
    if (value === null || value === undefined || value === "") return "Consultar";
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(value);
  }

  function toLocalInput(value) {
    if (!value) return "";
    const date = new Date(value);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  async function fetchAllProducts() {
    const rows = [];
    let offset = 0;
    let total = null;
    for (let request = 0; request < 500; request += 1) {
      const { data, error, count } = await client.from("shop_products")
        .select("*", { count: request === 0 ? "exact" : undefined })
        .order("sort_order").order("created_at", { ascending: false }).order("id")
        .range(offset, offset + 499);
      if (error) throw error;
      if (request === 0 && Number.isFinite(count)) total = count;
      if (!data?.length) break;
      rows.push(...data);
      offset += data.length;
      if (total !== null && offset >= total) break;
      if (total === null && data.length < 500) break;
    }
    return rows;
  }

  function showConfigurationError() {
    $("#loginMessage").innerHTML = "Falta configurar <b>supabase-config.js</b> con Project URL y Publishable key.";
    $$("#loginForm input, #loginForm button").forEach((el) => el.disabled = true);
  }

  async function verifyAdmin(user) {
    if (!user) return false;
    const { data, error } = await client.from("shop_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    return !error && Boolean(data);
  }

  async function enterApp(user) {
    const allowed = await verifyAdmin(user);
    if (!allowed) {
      await client.auth.signOut();
      $("#loginMessage").textContent = "Este usuario existe, pero no tiene permiso de administrador.";
      return;
    }
    loginView.hidden = true;
    adminApp.hidden = false;
    $("#adminEmail").textContent = user.email || "Administrador";
    if ($("#testEmailAddress")) $("#testEmailAddress").value = user.email || "";
    await loadAll();
  }

  async function initialize() {
    if (!configured || !window.supabase) return showConfigurationError();
    client = window.supabase.createClient(config.url, config.publishableKey);

    const { data } = await client.auth.getSession();
    if (data.session?.user) await enterApp(data.session.user);

    $("#loginForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      $("#loginMessage").textContent = "Comprobando acceso...";
      const { data: result, error } = await client.auth.signInWithPassword({
        email: $("#loginEmail").value.trim(),
        password: $("#loginPassword").value
      });
      if (error) {
        $("#loginMessage").textContent = "Correo o contraseña incorrectos.";
        return;
      }
      await enterApp(result.user);
    });
  }

  async function loadAll() {
    await Promise.all([loadProducts(), loadPromotions(), loadSettings(), loadOrders()]);
    updateStats();
  }

  async function loadProducts() {
    try {
      products = await fetchAllProducts();
    } catch (error) {
      return toast(`No se pudieron cargar los productos: ${error.message}`, true);
    }
    renderProducts();
  }

  async function loadPromotions() {
    const [{ data, error }, codesResult] = await Promise.all([
      client.from("shop_promotions").select("*").order("sort_order").order("created_at", { ascending: false }),
      client.from("shop_discount_codes").select("*").order("created_at", { ascending: false })
    ]);
    if (error) return toast(`No se pudieron cargar las promociones: ${error.message}`, true);
    promotions = data || [];
    discountCodes = codesResult.error ? [] : (codesResult.data || []);
    renderPromotions();
  }

  async function loadOrders() {
    const allRows = [];
    let offset = 0;
    let total = null;
    let loadError = null;
    for (let request = 0; request < 100; request += 1) {
      const { data, error, count } = await client.from("shop_orders").select("*", { count: request === 0 ? "exact" : undefined })
        .order("created_at", { ascending: false }).order("id").range(offset, offset + 499);
      if (error) { loadError = error; break; }
      if (request === 0 && Number.isFinite(count)) total = count;
      if (!data?.length) break;
      allRows.push(...data); offset += data.length;
      if (total !== null && offset >= total) break;
      if (total === null && data.length < 500) break;
    }
    if (loadError) {
      orders = [];
      $("#ordersList").innerHTML = '<div class="empty">Ejecuta <b>database_shop_checkout.sql</b> en Supabase para activar pedidos.</div>';
      $("#ordersSummary").innerHTML = "";
      $("#ordersPagination").innerHTML = "";
      updateStats();
      return;
    }
    orders = allRows;
    renderOrders();
    updateStats();
  }

  async function loadSettings() {
    const { data, error } = await client.from("shop_settings").select("setting_value").eq("setting_key", "store_info").maybeSingle();
    if (error || !data) return;
    storeSettings = data.setting_value || {};
    const form = $("#settingsForm");
    Object.entries(storeSettings).forEach(([key, value]) => {
      if (form.elements[key]) form.elements[key].value = value || "";
    });
  }

  function updateStats() {
    $("#totalProducts").textContent = products.length;
    $("#activeProducts").textContent = `${products.filter((p) => p.active).length} activos`;
    $("#featuredProducts").textContent = products.filter((p) => p.featured && p.active).length;
    $("#totalPromotions").textContent = promotions.length;
    $("#activePromotions").textContent = `${promotions.filter((p) => p.active).length} activas`;
    const openOrders = orders.filter((order) => ["pending","pending_payment","transfer_pending","quote_requested"].includes(order.status));
    $("#totalOrders").textContent = openOrders.length;
    $("#pendingOrders").textContent = `${orders.filter((order) => order.status === "paid").length} pagados por preparar`;
  }

  function renderProducts() {
    const search = $("#productSearch").value.trim().toLowerCase();
    const filter = $("#productFilter").value;
    const visible = products.filter((product) => {
      const matchSearch = !search || `${product.sku || ""} ${product.name} ${product.category}`.toLowerCase().includes(search);
      const matchFilter = filter === "all" ||
        (filter === "active" && product.active) ||
        (filter === "inactive" && !product.active) ||
        (filter === "featured" && product.featured) ||
        (filter === "low_stock" && product.stock !== null && product.stock !== undefined && Number(product.stock) > 0 && Number(product.stock) <= 5) ||
        (filter === "out_of_stock" && Number(product.stock) === 0) ||
        (filter === "unlimited" && (product.stock === null || product.stock === undefined));
      return matchSearch && matchFilter;
    });

    const totalPages = Math.max(1, Math.ceil(visible.length / PRODUCTS_PER_PAGE));
    productPage = Math.min(Math.max(1, productPage), totalPages);
    const start = (productPage - 1) * PRODUCTS_PER_PAGE;
    const pageRows = visible.slice(start, start + PRODUCTS_PER_PAGE);

    $("#productsList").innerHTML = pageRows.length ? pageRows.map((product) => {
      const limitedStock = product.stock !== null && product.stock !== undefined;
      const stock = limitedStock ? Math.max(0, Number(product.stock) || 0) : null;
      const stockClass = stock === 0 ? "stock-out" : stock !== null && stock <= 5 ? "stock-low" : "stock-ok";
      return `
      <article class="list-card">
        <div class="list-image">${product.image_url ? `<img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}" loading="lazy">` : "☠"}</div>
        <div class="list-main"><h3>${escapeHtml(product.name)} · ${money(product.price)}</h3><p>${product.sku ? `SKU ${escapeHtml(product.sku)} · ` : ""}${escapeHtml(product.category)} · Orden ${product.sort_order}</p><div class="badges"><span class="badge ${product.active ? "active" : "inactive"}">${product.active ? "VISIBLE" : "OCULTO"}</span>${product.featured ? '<span class="badge featured">DESTACADO</span>' : ""}<span class="badge ${product.online_sale === false ? "inactive" : "active"}">${product.online_sale === false ? "SIN CARRITO" : "VENTA ONLINE"}</span><span class="badge ${stockClass}">${limitedStock ? `${stock} EN EXISTENCIA` : "SIN LÍMITE"}</span></div></div>
        <div class="product-management">
          ${limitedStock ? `<div class="stock-stepper" aria-label="Ajustar existencias"><button type="button" data-stock-delta="-1" data-stock-product="${product.id}" ${stock === 0 ? "disabled" : ""}>−</button><b>${stock}</b><button type="button" data-stock-delta="1" data-stock-product="${product.id}">＋</button></div>` : '<span class="unlimited-stock">∞ Inventario libre</span>'}
          <div class="list-actions"><button data-edit-product="${product.id}">Editar</button><button data-toggle-product="${product.id}">${product.active ? "Ocultar" : "Mostrar"}</button><button class="delete" data-delete-product="${product.id}">Eliminar</button></div>
        </div>
      </article>`;
    }).join("") : '<div class="empty">No hay productos que coincidan.</div>';
    $("#productsPagination").innerHTML = visible.length ? `
      <span>Mostrando ${start + 1}–${Math.min(start + PRODUCTS_PER_PAGE, visible.length)} de <b>${visible.length}</b></span>
      <div><button type="button" data-product-page="prev" ${productPage === 1 ? "disabled" : ""}>← Anterior</button><b>Página ${productPage} de ${totalPages}</b><button type="button" data-product-page="next" ${productPage === totalPages ? "disabled" : ""}>Siguiente →</button></div>` : "";
  }

  function parseCsv(text) {
    const source = String(text || "").replace(/^\uFEFF/, "");
    const firstLine = source.split(/\r?\n/, 1)[0] || "";
    const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (char === '"') {
        if (quoted && source[index + 1] === '"') { cell += '"'; index += 1; }
        else quoted = !quoted;
      } else if (char === delimiter && !quoted) { row.push(cell.trim()); cell = ""; }
      else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && source[index + 1] === "\n") index += 1;
        row.push(cell.trim()); cell = "";
        if (row.some(Boolean)) rows.push(row);
        row = [];
      } else cell += char;
    }
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
    return rows;
  }

  const csvBoolean = (value, fallback) => {
    if (value === undefined || value === null || value === "") return fallback;
    return !["0", "false", "no", "inactivo", "oculto"].includes(String(value).trim().toLowerCase());
  };
  const csvNumber = (value) => {
    const source = String(value ?? "").trim();
    if (!source) return null;
    const normalized = source.replace(/[$\s]/g, "").replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, "");
    const result = Number(normalized);
    return Number.isFinite(result) ? result : null;
  };

  async function importProductsCsv(file) {
    const rows = parseCsv(await file.text());
    if (rows.length < 2) throw new Error("El CSV no contiene productos.");
    const headers = rows.shift().map((value) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_"));
    const read = (row, names) => {
      const index = names.map((name) => headers.indexOf(name)).find((position) => position >= 0);
      return index === undefined ? "" : String(row[index] ?? "");
    };
    const imported = rows.map((row, index) => {
      const name = read(row, ["nombre", "name"]).trim();
      if (!name) throw new Error(`La fila ${index + 2} no tiene nombre.`);
      return {
        name,
        sku: read(row, ["sku", "codigo", "codigo_interno"]).trim().toUpperCase() || null,
        category: read(row, ["categoria", "category"]).trim() || "General",
        description: read(row, ["descripcion", "description"]).trim(),
        price: csvNumber(read(row, ["precio", "price"])),
        previous_price: csvNumber(read(row, ["precio_anterior", "previous_price"])),
        stock: (() => { const value = csvNumber(read(row, ["existencias", "stock"])); return value === null ? null : Math.max(0, Math.trunc(value)); })(),
        sort_order: csvNumber(read(row, ["orden", "sort_order"])) || 0,
        active: csvBoolean(read(row, ["visible", "activo", "active"]), true),
        featured: csvBoolean(read(row, ["destacado", "featured"]), false),
        online_sale: csvBoolean(read(row, ["venta_online", "online_sale"]), true),
        image_url: read(row, ["imagen_url", "image_url"]).trim() || null,
        updated_at: new Date().toISOString()
      };
    });
    if (imported.length > 1000) throw new Error("Importa máximo 1,000 productos por archivo.");
    if (!confirm(`Se procesarán ${imported.length} productos. Los SKU existentes se actualizarán y los nuevos se agregarán. ¿Continuar?`)) return null;
    const { data, error } = await client.rpc("import_shop_products", { p_products: imported });
    if (error) throw new Error(`${error.message}. Ejecuta database_catalog_inventory_v12.sql en Supabase.`);
    return data || { total: imported.length, inserted: imported.length, updated: 0 };
  }

  function downloadProductsTemplate() {
    const content = '\uFEFFsku;nombre;categoria;descripcion;precio;precio_anterior;existencias;orden;visible;destacado;venta_online;imagen_url\nEJEMPLO-001;Ejemplo de producto;Accesorios;Descripción del producto;120;;10;0;si;no;si;';
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    link.download = "plantilla-productos-fantasmas.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function renderPromotions() {
    const rows = [...promotions.map((item) => ({ ...item, promotion_kind: item.discount_value ? "automatic" : "display" })), ...discountCodes.map((item) => ({ ...item, promotion_kind: "code", badge: `CÓDIGO ${item.code}`, sort_order: 0 }))];
    $("#promotionsList").innerHTML = rows.length ? rows.map((promo) => `
      <article class="list-card">
        <div class="list-image">${promo.image_url ? `<img src="${escapeHtml(promo.image_url)}" alt="">` : "⚡"}</div>
        <div class="list-main"><h3>${escapeHtml(promo.title)}</h3><p>${escapeHtml(promo.badge || "PROMOCIÓN")}${promo.discount_value ? ` · ${promo.discount_type === "percentage" ? `${promo.discount_value}%` : money(promo.discount_value)}` : ""}${promo.ends_at ? ` · Termina ${new Date(promo.ends_at).toLocaleDateString("es-MX")}` : ""}</p><div class="badges"><span class="badge ${promo.active ? "active" : "inactive"}">${promo.active ? "ACTIVA" : "INACTIVA"}</span><span class="badge">${promo.promotion_kind === "code" ? `${promo.uses_count}/${promo.max_uses || "∞"} usos` : promo.promotion_kind === "automatic" ? "AUTOMÁTICA" : "ANUNCIO"}</span></div></div>
        <div class="list-actions"><button data-edit-promotion="${promo.id}" data-promotion-kind="${promo.promotion_kind}">Editar</button><button data-toggle-promotion="${promo.id}" data-promotion-kind="${promo.promotion_kind}">${promo.active ? "Desactivar" : "Activar"}</button><button class="delete" data-delete-promotion="${promo.id}" data-promotion-kind="${promo.promotion_kind}">Eliminar</button></div>
      </article>`).join("") : '<div class="empty">Aún no has creado promociones.</div>';
  }

  function refreshPromotionFields() {
    const form = $("#promotionForm");
    const kind = form.elements.promotion_kind.value;
    const scope = form.elements.scope.value;
    $$('[data-code-field]', form).forEach((node) => node.hidden = kind !== "code");
    $$('[data-scope-products]', form).forEach((node) => node.hidden = scope !== "products");
    $$('[data-scope-categories]', form).forEach((node) => node.hidden = scope !== "categories");
    form.elements.discount_type.disabled = kind === "display";
    form.elements.discount_value.disabled = kind === "display";
  }

  const orderStatusLabels = {
    pending: "NUEVO", pending_payment: "ESPERANDO PAGO", transfer_pending: "ESPERANDO TRANSFERENCIA", quote_requested: "COTIZACIÓN",
    paid: "PAGADO", processing: "EN PREPARACIÓN", ready: "LISTO", fulfilled: "ENTREGADO", cancelled: "CANCELADO", payment_failed: "NO PAGADO"
  };

  function visibleOrderStatus(order) {
    const mp = String(order.mp_payment_status || "").toLowerCase();
    if (order.payment_method === "mercadopago") {
      if (mp === "rejected") return "PAGO RECHAZADO";
      if (mp === "cancelled") return "PAGO CANCELADO";
      if (mp === "refunded") return "REEMBOLSADO";
      if (mp === "charged_back") return "CONTRACARGO";
      if (["pending", "in_process"].includes(mp)) return "PAGO PENDIENTE";
    }
    return orderStatusLabels[order.status] || order.status;
  }

  function orderMatchesFilter(order, filter) {
    if (filter === "all") return true;
    if (filter === "new") return ["pending","pending_payment","transfer_pending","quote_requested","payment_failed"].includes(order.status);
    if (filter === "paid") return order.status === "paid";
    if (filter === "processing") return ["processing","ready"].includes(order.status);
    if (filter === "fulfilled") return order.status === "fulfilled";
    if (filter === "cancelled") return order.status === "cancelled";
    return true;
  }

  function renderOrders() {
    const search = $("#orderSearch").value.trim().toLowerCase();
    const filter = $("#orderFilter").value;
    const visible = orders.filter((order) => {
      const haystack = `${order.order_number} ${order.customer_name} ${order.customer_phone} ${order.customer_email}`.toLowerCase();
      return (!search || haystack.includes(search)) && orderMatchesFilter(order, filter);
    });
    const newCount = orders.filter((order) => ["pending","pending_payment","transfer_pending","quote_requested"].includes(order.status)).length;
    const paidCount = orders.filter((order) => order.status === "paid").length;
    const processingCount = orders.filter((order) => ["processing","ready"].includes(order.status)).length;
    $("#ordersSummary").innerHTML = `<span><b>${newCount}</b> nuevos</span><span><b>${paidCount}</b> pagados</span><span><b>${processingCount}</b> preparando</span>`;
    const totalPages = Math.max(1, Math.ceil(visible.length / ORDERS_PER_PAGE));
    orderPage = Math.min(Math.max(1, orderPage), totalPages);
    const start = (orderPage - 1) * ORDERS_PER_PAGE;
    const pageRows = visible.slice(start, start + ORDERS_PER_PAGE);
    $("#ordersPagination").innerHTML = visible.length ? `<span>Mostrando ${start + 1}–${Math.min(start + ORDERS_PER_PAGE, visible.length)} de <b>${visible.length}</b></span><div><button type="button" data-order-page="prev" ${orderPage === 1 ? "disabled" : ""}>← Anterior</button><b>Página ${orderPage} de ${totalPages}</b><button type="button" data-order-page="next" ${orderPage === totalPages ? "disabled" : ""}>Siguiente →</button></div>` : "";
    $("#ordersList").innerHTML = pageRows.length ? pageRows.map((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      const payment = order.payment_method === "mercadopago" ? "Mercado Pago" : order.payment_method === "transfer" ? "Transferencia" : "Cotización";
      const delivery = order.delivery_method === "pickup" ? "Recoge en tienda" : `Envío por cotizar${order.delivery_address ? ` · ${order.delivery_address}` : ""}`;
      const metadata = order.metadata || {};
      const automaticDiscount = Number(metadata.automatic_discount || 0);
      const couponDiscount = Number(metadata.coupon_discount || 0);
      const message = encodeURIComponent(`Hola ${order.customer_name}, te contactamos de Fantasmas Biker's Shop por tu pedido ${order.order_number}.`);
      return `<article class="order-card">
        <div class="order-card-head"><div><small>${new Date(order.created_at).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}</small><h3>${escapeHtml(order.order_number)}</h3></div><span class="order-status status-${escapeHtml(order.status)}">${escapeHtml(visibleOrderStatus(order))}</span></div>
        <div class="order-customer"><b>${escapeHtml(order.customer_name)}</b><span>${escapeHtml(order.customer_phone)}${order.customer_email ? ` · ${escapeHtml(order.customer_email)}` : ""}</span><small>${escapeHtml(delivery)}</small></div>
        <div class="order-items">${items.map((item) => `<p><span>${Number(item.quantity) || 1} × ${escapeHtml(item.name)}</span><b>${money(Number(item.unit_price || 0) * Number(item.quantity || 1))}</b></p>`).join("")}</div>
        ${order.customer_notes ? `<p class="order-notes"><b>Notas:</b> ${escapeHtml(order.customer_notes)}</p>` : ""}
        ${(automaticDiscount > 0 || couponDiscount > 0) ? `<div class="order-discounts">${automaticDiscount > 0 ? `<span>Oferta automática <b>−${money(automaticDiscount)}</b></span>` : ""}${couponDiscount > 0 ? `<span>Cupón ${escapeHtml(metadata.coupon_code || "")} <b>−${money(couponDiscount)}</b></span>` : ""}</div>` : ""}
        <div class="order-total"><span>${escapeHtml(payment)}${order.mp_payment_status ? ` · ${escapeHtml(order.mp_payment_status)}` : ""}</span><strong>${money(order.total)}</strong></div>
        <div class="order-actions">
          <a href="https://wa.me/52${escapeHtml(String(order.customer_phone).replace(/\D/g, "").replace(/^52(?=\d{10}$)/, ""))}?text=${message}" target="_blank">WhatsApp</a>
          ${order.payment_method !== "mercadopago" && !["paid","processing","ready","fulfilled","cancelled"].includes(order.status) ? `<button data-order-paid="${order.id}">Confirmar pago</button>` : ""}
          ${order.payment_method === "mercadopago" && !["paid","processing","ready","fulfilled"].includes(order.status) ? `<span class="payment-auto-note">Pago verificado automáticamente</span>` : ""}
          ${order.status === "paid" ? `<button data-order-status="processing" data-order-id="${order.id}">Preparar</button>` : ""}
          ${order.status === "processing" ? `<button data-order-status="ready" data-order-id="${order.id}">Marcar listo</button>` : ""}
          ${order.status === "ready" ? `<button data-order-status="fulfilled" data-order-id="${order.id}">Entregado</button>` : ""}
          ${!["fulfilled","cancelled"].includes(order.status) ? `<button class="delete" data-order-status="cancelled" data-order-id="${order.id}">Cancelar</button>` : ""}
          <button class="delete" data-delete-order="${order.id}">Eliminar</button>
        </div>
      </article>`;
    }).join("") : '<div class="empty">No hay pedidos con ese filtro.</div>';
  }

  function openProduct(product = null) {
    const form = $("#productForm");
    form.reset();
    form.elements.active.checked = true;
    form.elements.online_sale.checked = true;
    form.elements.sort_order.value = 0;
    $("#productDialogTitle").textContent = product ? "Editar producto" : "Nuevo producto";
    if (product) {
      ["id","sku","name","category","description","price","previous_price","stock","sort_order"].forEach((key) => form.elements[key].value = product[key] ?? "");
      form.elements.current_image_url.value = product.image_url || "";
      form.elements.current_image_path.value = product.image_path || "";
      form.elements.active.checked = product.active;
      form.elements.featured.checked = product.featured;
      form.elements.online_sale.checked = product.online_sale !== false;
    }
    $("#productStatus").textContent = "";
    $("#productDialog").showModal();
  }

  function openPromotion(promo = null) {
    const form = $("#promotionForm");
    form.reset();
    form.elements.active.checked = true;
    form.elements.badge.value = "PROMOCIÓN";
    form.elements.button_text.value = "Pedir por WhatsApp";
    form.elements.button_url.value = "https://wa.me/525610329215";
    form.elements.sort_order.value = 0;
    form.elements.promotion_kind.value = promo?.promotion_kind || "automatic";
    form.elements.discount_type.value = promo?.discount_type || "percentage";
    form.elements.scope.value = promo?.scope || "all";
    form.elements.minimum_purchase.value = promo?.minimum_purchase || 0;
    form.elements.product_ids.innerHTML = products.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}${item.sku ? ` · ${escapeHtml(item.sku)}` : ""}</option>`).join("");
    form.elements.category_names.innerHTML = [...new Set(products.map((item) => item.category).filter(Boolean))].sort().map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
    $("#promotionDialogTitle").textContent = promo ? "Editar promoción" : "Nueva promoción";
    if (promo) {
      ["id","title","subtitle","badge","button_text","button_url","sort_order","discount_value","minimum_purchase","max_uses","code"].forEach((key) => { if (form.elements[key]) form.elements[key].value = promo[key] ?? ""; });
      form.elements.starts_at.value = toLocalInput(promo.starts_at);
      form.elements.ends_at.value = toLocalInput(promo.ends_at);
      form.elements.current_image_url.value = promo.image_url || "";
      form.elements.current_image_path.value = promo.image_path || "";
      form.elements.active.checked = promo.active;
      form.elements.discount_type.value = promo.discount_type || "percentage";
      form.elements.scope.value = promo.scope || "all";
      [...form.elements.product_ids.options].forEach((option) => option.selected = (promo.product_ids || []).includes(option.value));
      [...form.elements.category_names.options].forEach((option) => option.selected = (promo.category_names || []).includes(option.value));
    }
    refreshPromotionFields();
    $("#promotionStatus").textContent = "";
    $("#promotionDialog").showModal();
  }

  async function uploadImage(file, folder) {
    if (!file || file.size === 0) return null;
    if (file.size > 5 * 1024 * 1024) throw new Error("La imagen supera el límite de 5 MB.");
    const extension = file.name.split(".").pop().toLowerCase();
    const path = `${folder}/${crypto.randomUUID()}.${extension}`;
    const { error } = await client.storage.from("shop-media").upload(path, file, { cacheControl: "3600", upsert: false });
    if (error) throw error;
    const { data } = client.storage.from("shop-media").getPublicUrl(path);
    return { path, url: data.publicUrl };
  }

  async function removeImage(path) {
    if (!path) return;
    await client.storage.from("shop-media").remove([path]);
  }

  $("#productForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = $("#productStatus");
    status.textContent = "Guardando...";
    try {
      const file = form.elements.image.files[0];
      const uploaded = await uploadImage(file, "products");
      const payload = {
        name: form.elements.name.value.trim(), sku: form.elements.sku.value.trim().toUpperCase() || null, category: form.elements.category.value.trim(),
        description: form.elements.description.value.trim(),
        price: form.elements.price.value ? Number(form.elements.price.value) : null,
        previous_price: form.elements.previous_price.value ? Number(form.elements.previous_price.value) : null,
        stock: form.elements.stock.value === "" ? null : Number(form.elements.stock.value),
        sort_order: Number(form.elements.sort_order.value || 0), active: form.elements.active.checked,
        featured: form.elements.featured.checked, online_sale: form.elements.online_sale.checked, updated_at: new Date().toISOString(),
        image_url: uploaded?.url || form.elements.current_image_url.value || null,
        image_path: uploaded?.path || form.elements.current_image_path.value || null
      };
      const id = form.elements.id.value;
      const query = id ? client.from("shop_products").update(payload).eq("id", id) : client.from("shop_products").insert(payload);
      const { error } = await query;
      if (error) throw error;
      if (uploaded && form.elements.current_image_path.value) await removeImage(form.elements.current_image_path.value);
      $("#productDialog").close(); await loadProducts(); updateStats(); toast("Producto guardado correctamente.");
    } catch (error) { status.textContent = error.message; }
  });

  $("#promotionForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = $("#promotionStatus");
    status.textContent = "Guardando...";
    try {
      const file = form.elements.image.files[0];
      const uploaded = await uploadImage(file, "promotions");
      const kind = form.elements.promotion_kind.value;
      const commonRule = {
        discount_type: kind === "display" ? null : form.elements.discount_type.value,
        discount_value: kind === "display" ? null : Number(form.elements.discount_value.value),
        scope: form.elements.scope.value,
        product_ids: [...form.elements.product_ids.selectedOptions].map((option) => option.value),
        category_names: [...form.elements.category_names.selectedOptions].map((option) => option.value),
        minimum_purchase: Number(form.elements.minimum_purchase.value || 0),
        starts_at: form.elements.starts_at.value ? new Date(form.elements.starts_at.value).toISOString() : null,
        ends_at: form.elements.ends_at.value ? new Date(form.elements.ends_at.value).toISOString() : null,
        active: form.elements.active.checked, updated_at: new Date().toISOString()
      };
      if (kind !== "display" && (!Number.isFinite(commonRule.discount_value) || commonRule.discount_value <= 0)) throw new Error("Escribe un descuento mayor a cero.");
      if (commonRule.discount_type === "percentage" && commonRule.discount_value > 100) throw new Error("El porcentaje no puede ser mayor a 100%.");
      const payload = {
        title: form.elements.title.value.trim(), subtitle: form.elements.subtitle.value.trim(), badge: form.elements.badge.value.trim(),
        button_text: form.elements.button_text.value.trim(), button_url: form.elements.button_url.value.trim(),
        ...commonRule, sort_order: Number(form.elements.sort_order.value || 0),
        image_url: uploaded?.url || form.elements.current_image_url.value || null,
        image_path: uploaded?.path || form.elements.current_image_path.value || null
      };
      const id = form.elements.id.value;
      const table = kind === "code" ? "shop_discount_codes" : "shop_promotions";
      const storedPayload = kind === "code" ? {
        code: form.elements.code.value.trim().toUpperCase(), title: payload.title, ...commonRule,
        max_uses: form.elements.max_uses.value ? Number(form.elements.max_uses.value) : null
      } : payload;
      if (kind === "code" && !/^[A-Z0-9_-]{3,32}$/.test(storedPayload.code)) throw new Error("El código debe tener entre 3 y 32 letras, números, guion o guion bajo.");
      const query = id ? client.from(table).update(storedPayload).eq("id", id) : client.from(table).insert(storedPayload);
      const { error } = await query;
      if (error) throw error;
      if (kind !== "code" && uploaded && form.elements.current_image_path.value) await removeImage(form.elements.current_image_path.value);
      $("#promotionDialog").close(); await loadPromotions(); updateStats(); toast("Promoción guardada correctamente.");
    } catch (error) { status.textContent = error.message; }
  });

  $("#settingsForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const value = Object.fromEntries(new FormData(form).entries());
    $("#settingsStatus").textContent = "Guardando...";
    const { data: current } = await client.from("shop_settings").select("setting_value").eq("setting_key", "store_info").maybeSingle();
    const mergedSettings = { ...(current?.setting_value || {}), ...value };
    const { error } = await client.from("shop_settings").upsert({ setting_key: "store_info", setting_value: mergedSettings, updated_at: new Date().toISOString() });
    $("#settingsStatus").textContent = error ? error.message : "Información guardada.";
    if (!error) { storeSettings = mergedSettings; toast("Información pública actualizada."); }
  });

  async function updateOrderFromWorker(orderId, status) {
    const worker = String(storeSettings.checkout_worker_url || "").trim().replace(/\/+$/, "");
    if (!/^https:\/\//i.test(worker)) throw new Error("Falta configurar la URL del Worker de cobros en Información.");
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("La sesión administrativa terminó. Vuelve a iniciar sesión.");
    const result = await fetch(`${worker}/admin/order-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ order_id: orderId, status })
    });
    const response = await result.json().catch(() => ({}));
    if (!result.ok || !response.ok) throw new Error(response.error || "No se pudo actualizar el pedido");
    return response;
  }

  function configuredWorkerUrl() {
    const formValue = $("#settingsForm")?.elements.checkout_worker_url?.value || storeSettings.checkout_worker_url || "";
    const worker = String(formValue).trim().replace(/\/+$/, "");
    if (!/^https:\/\//i.test(worker)) throw new Error("Primero guarda una URL válida del Worker.");
    return worker;
  }

  async function adminWorkerRequest(path, payload = {}) {
    const worker = configuredWorkerUrl();
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("La sesión administrativa terminó. Vuelve a iniciar sesión.");
    const result = await fetch(`${worker}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    const responseBody = await result.json().catch(() => ({}));
    if (!result.ok || !responseBody.ok) {
      const detail = Array.isArray(responseBody.attempts) && responseBody.attempts.length
        ? responseBody.attempts.map((attempt) => `${attempt.provider || "correo"}: ${attempt.error}`).join(" · ")
        : responseBody.error;
      throw new Error(detail || `El Worker respondió con error ${result.status}.`);
    }
    return responseBody;
  }

  async function checkWorkerConnection() {
    const status = $("#workerDiagnostics");
    const button = $("#checkWorkerButton");
    status.textContent = "Comprobando…"; button.disabled = true;
    try {
      const result = await fetch(`${configuredWorkerUrl()}/health`, { cache: "no-store" });
      const data = await result.json().catch(() => ({}));
      if (!result.ok || !data.ok) throw new Error(data.error || `Error ${result.status}`);
      const email = data.email_notifications ? `Correo activo mediante ${data.email_provider}` : "Correo sin configurar";
      const webhook = data.webhook_signature ? "Webhook firmado" : "FALTA firma Webhook";
      status.textContent = `Worker ${data.version || "anterior"} conectado · ${email} · Mercado Pago ${data.mercado_pago ? "activo" : "inactivo"} · ${webhook}.`;
      status.className = data.email_notifications && (!data.mercado_pago || data.webhook_signature) ? "diagnostic-ok" : "diagnostic-warning";
    } catch (error) {
      status.textContent = `No se pudo conectar: ${error.message}`;
      status.className = "diagnostic-error";
    } finally { button.disabled = false; }
  }

  async function sendTestEmail() {
    const status = $("#emailTestStatus");
    const button = $("#sendTestEmailButton");
    const email = $("#testEmailAddress").value.trim();
    status.textContent = "Enviando prueba…"; status.className = ""; button.disabled = true;
    try {
      const data = await adminWorkerRequest("/admin/email-test", { email });
      status.textContent = `Correo enviado mediante ${data.provider}${data.remaining !== null && data.remaining !== undefined ? ` · cuota restante: ${data.remaining}` : ""}.`;
      status.className = "diagnostic-ok";
    } catch (error) {
      status.textContent = `Falló la prueba: ${error.message}`;
      status.className = "diagnostic-error";
    } finally { button.disabled = false; }
  }

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.matches("[data-product-page]")) {
      productPage += button.dataset.productPage === "next" ? 1 : -1;
      renderProducts();
      $("#view-products").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (button.matches("[data-order-page]")) {
      orderPage += button.dataset.orderPage === "next" ? 1 : -1;
      renderOrders();
      $("#view-orders").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (button.matches("[data-edit-product]")) openProduct(products.find((p) => p.id === button.dataset.editProduct));
    if (button.matches("[data-edit-promotion]")) openPromotion(button.dataset.promotionKind === "code" ? { ...discountCodes.find((p) => p.id === button.dataset.editPromotion), promotion_kind: "code" } : { ...promotions.find((p) => p.id === button.dataset.editPromotion), promotion_kind: promotions.find((p) => p.id === button.dataset.editPromotion)?.discount_value ? "automatic" : "display" });
    if (button.matches("[data-toggle-product]")) {
      const item = products.find((p) => p.id === button.dataset.toggleProduct);
      const { error } = await client.from("shop_products").update({ active: !item.active, updated_at: new Date().toISOString() }).eq("id", item.id);
      if (!error) { await loadProducts(); updateStats(); }
    }
    if (button.matches("[data-stock-delta]")) {
      const item = products.find((product) => product.id === button.dataset.stockProduct);
      if (!item || item.stock === null || item.stock === undefined) return;
      button.disabled = true;
      try {
        const { data, error } = await client.rpc("adjust_shop_product_stock", {
          p_product_id: item.id,
          p_delta: Number(button.dataset.stockDelta)
        });
        if (error) throw error;
        item.stock = Number(data?.stock ?? item.stock);
        renderProducts();
        updateStats();
      } catch (error) {
        toast(`${error.message}. Ejecuta database_catalog_inventory_v12.sql.`, true);
        button.disabled = false;
      }
    }
    if (button.matches("[data-toggle-promotion]")) {
      const code = button.dataset.promotionKind === "code";
      const item = code ? discountCodes.find((p) => p.id === button.dataset.togglePromotion) : promotions.find((p) => p.id === button.dataset.togglePromotion);
      const { error } = await client.from(code ? "shop_discount_codes" : "shop_promotions").update({ active: !item.active, updated_at: new Date().toISOString() }).eq("id", item.id);
      if (!error) { await loadPromotions(); updateStats(); }
    }
    if (button.matches("[data-delete-product]")) {
      const item = products.find((p) => p.id === button.dataset.deleteProduct);
      if (!confirm(`¿Eliminar definitivamente “${item.name}”?`)) return;
      const { error } = await client.from("shop_products").delete().eq("id", item.id);
      if (!error) { await removeImage(item.image_path); await loadProducts(); updateStats(); toast("Producto eliminado."); }
    }
    if (button.matches("[data-delete-promotion]")) {
      const code = button.dataset.promotionKind === "code";
      const item = code ? discountCodes.find((p) => p.id === button.dataset.deletePromotion) : promotions.find((p) => p.id === button.dataset.deletePromotion);
      if (!confirm(`¿Eliminar definitivamente “${item.title}”?`)) return;
      const { error } = await client.from(code ? "shop_discount_codes" : "shop_promotions").delete().eq("id", item.id);
      if (!error) { await removeImage(item.image_path); await loadPromotions(); updateStats(); toast("Promoción eliminada."); }
    }
    if (button.matches("[data-order-paid]")) {
      if (!confirm("¿Confirmar que este pedido ya fue pagado? También se descontarán las existencias.")) return;
      try {
        const result = await updateOrderFromWorker(button.dataset.orderPaid, "paid");
        await Promise.all([loadOrders(), loadProducts()]);
        toast(result.email_sent ? "Pago confirmado; existencias y correo actualizados." : "Pago confirmado y existencias actualizadas.");
      } catch (error) { toast(error.message, true); }
    }
    if (button.matches("[data-order-status]")) {
      const next = button.dataset.orderStatus;
      if (next === "cancelled" && !confirm("¿Cancelar este pedido?")) return;
      try {
        const result = await updateOrderFromWorker(button.dataset.orderId, next);
        await loadOrders();
        toast(result.email_sent ? "Estado actualizado y correo enviado." : "Estado del pedido actualizado.");
      } catch (error) { toast(error.message, true); }
    }
    if (button.matches("[data-delete-order]")) {
      const order = orders.find((item) => item.id === button.dataset.deleteOrder);
      if (!order) return;
      const warning = order.stock_applied ? " El inventario ya aplicado no se restaurará." : "";
      if (!confirm(`¿Eliminar definitivamente el pedido ${order.order_number}? Esta acción no se puede deshacer.${warning}`)) return;
      button.disabled = true;
      try {
        await adminWorkerRequest("/admin/order-delete", { order_id: order.id });
        await loadOrders();
        toast("Pedido eliminado definitivamente.");
      } catch (error) { button.disabled = false; toast(error.message, true); }
    }
  });

  $$(".nav-item").forEach((button) => button.addEventListener("click", () => {
    $$(".nav-item").forEach((item) => item.classList.remove("active")); button.classList.add("active");
    $$(".view").forEach((view) => view.classList.remove("active")); $(`#view-${button.dataset.view}`).classList.add("active");
    $("#viewTitle").textContent = button.querySelector("span").textContent; $("#sidebar").classList.remove("open");
  }));
  $$(".close-dialog").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  $("#newProductButton").addEventListener("click", () => openProduct());
  $("#downloadProductsTemplate").addEventListener("click", downloadProductsTemplate);
  $("#importProductsButton").addEventListener("click", () => $("#productsCsvFile").click());
  $("#productsCsvFile").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const result = await importProductsCsv(file);
      if (result) {
        productPage = 1;
        await loadProducts(); updateStats();
        toast(`${result.total} productos procesados: ${result.inserted} nuevos y ${result.updated} actualizados.`);
      }
    } catch (error) { toast(error.message, true); }
    event.target.value = "";
  });
  $("#newPromotionButton").addEventListener("click", () => openPromotion());
  $("#promotionForm").elements.promotion_kind.addEventListener("change", refreshPromotionFields);
  $("#promotionForm").elements.scope.addEventListener("change", refreshPromotionFields);
  $("#productSearch").addEventListener("input", () => { productPage = 1; renderProducts(); });
  $("#productFilter").addEventListener("change", () => { productPage = 1; renderProducts(); });
  $("#orderSearch").addEventListener("input", () => { orderPage = 1; renderOrders(); });
  $("#orderFilter").addEventListener("change", () => { orderPage = 1; renderOrders(); });
  $("#refreshOrdersButton").addEventListener("click", loadOrders);
  $("#checkWorkerButton").addEventListener("click", checkWorkerConnection);
  $("#sendTestEmailButton").addEventListener("click", sendTestEmail);
  $$(".refresh-data").forEach((button) => button.addEventListener("click", loadAll));
  $("#openMenu").addEventListener("click", () => $("#sidebar").classList.add("open"));
  $("#closeMenu").addEventListener("click", () => $("#sidebar").classList.remove("open"));
  $("#logoutButton").addEventListener("click", async () => { await client.auth.signOut(); location.reload(); });

  initialize();
})();
