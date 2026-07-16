import { supabase } from "./supabase-client.js";

const grid = document.querySelector("#business-grid");
const total = document.querySelector("#business-total");
const search = document.querySelector("#business-search");
const menuButton = document.querySelector("#menu-button");
const nav = document.querySelector("#main-nav");

let businesses = [];

menuButton.addEventListener("click", () => {
  nav.classList.toggle("open");
});

nav.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => nav.classList.remove("open"));
});

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function render(items) {
  total.textContent = `${items.length} negocio${items.length === 1 ? "" : "s"} disponible${items.length === 1 ? "" : "s"}`;

  if (!items.length) {
    grid.innerHTML = `
      <article class="business-placeholder">
        No encontramos negocios con esa búsqueda.
      </article>
    `;
    return;
  }

  grid.innerHTML = items.map((business) => {
    const location = [business.colonia, business.municipio]
      .filter(Boolean)
      .join(", ");

    return `
      <article class="business-card">
        <div class="business-cover"
             ${business.portada_url ? `style="background-image:url('${escapeHtml(business.portada_url)}')"` : ""}>
          <div class="business-logo">
            ${business.logo_url
              ? `<img src="${escapeHtml(business.logo_url)}" alt="Logo de ${escapeHtml(business.nombre)}">`
              : escapeHtml(business.nombre.charAt(0))}
          </div>
        </div>

        <div class="business-content">
          <small>${escapeHtml(business.categorias?.nombre || "Negocio aliado")}</small>
          <h3>${escapeHtml(business.nombre)}</h3>
          <p>${escapeHtml(business.descripcion_corta || "Conoce este negocio participante de Aliados Fantasma.")}</p>
          <span class="business-location">${escapeHtml(location || "Ubicación por confirmar")}</span>
          <a href="perfil.html?slug=${encodeURIComponent(business.slug)}">Ver perfil digital →</a>
        </div>
      </article>
    `;
  }).join("");
}

async function loadBusinesses() {
  if (!supabase) {
    grid.innerHTML = '<article class="business-placeholder">La conexión con Supabase aún no está configurada.</article>';
    total.textContent = "Demo sin conexión";
    return;
  }

  const { data, error } = await supabase
    .from("negocios")
    .select(`
      nombre,
      slug,
      descripcion_corta,
      logo_url,
      portada_url,
      colonia,
      municipio,
      categorias(nombre)
    `)
    .eq("activo", true)
    .order("destacado", { ascending: false })
    .order("nombre", { ascending: true });

  if (error) {
    console.error(error);
    grid.innerHTML = '<article class="business-placeholder">No fue posible cargar los negocios en este momento.</article>';
    total.textContent = "Información no disponible";
    return;
  }

  businesses = data || [];
  render(businesses);
}

search.addEventListener("input", () => {
  const term = search.value.trim().toLowerCase();

  const filtered = businesses.filter((business) => [
    business.nombre,
    business.descripcion_corta,
    business.colonia,
    business.municipio,
    business.categorias?.nombre
  ].some((value) => (value || "").toLowerCase().includes(term)));

  render(filtered);
});

loadBusinesses();
