import { supabase } from './supabase-client.js?v=20260720-600';

const $ = s => document.querySelector(s);
const featured = $('#featured-businesses');
const chipList = $('#category-chips');
const statBusinesses = $('#stat-businesses');
const statCategories = $('#stat-categories');
const businessCta = $('#business-cta');
const businessCtaCopy = $('#business-cta-copy');
const searchForm = $('#quick-search-form');
const searchInput = $('#quick-search-input');

const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const safeText = (value, fallback='') => String(value || fallback || '').trim();

searchForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const q = (searchInput?.value || '').trim();
  const url = q ? `explorar.html?q=${encodeURIComponent(q)}` : 'explorar.html';
  window.location.href = url;
});

function businessCard(biz, categoryMap){
  const slug = biz.slug ? `perfil.html?slug=${encodeURIComponent(biz.slug)}` : `perfil.html?id=${encodeURIComponent(biz.id)}`;
  const img = biz.logo_url || 'aliados-fantasma-icono.png';
  const category = categoryMap.get(biz.categoria_id) || safeText(biz.categoria, 'Negocio aliado');
  const desc = safeText(biz.descripcion_corta, 'Conoce este negocio dentro de la red Aliados Fantasma.');
  const place = [biz.municipio, biz.estado_region].filter(Boolean).join(', ') || 'México';
  return `
    <article class="business-card">
      <div class="business-top">
        <img src="${esc(img)}" alt="${esc(biz.nombre || 'Negocio')}">
        <div>
          <h3>${esc(biz.nombre || 'Negocio aliado')}</h3>
          <small>${esc(category)}</small>
        </div>
      </div>
      <p>${esc(desc)}</p>
      <div class="business-meta">
        <span>📍 ${esc(place)}</span>
        ${biz.destacado ? '<span>⭐ Destacado</span>' : ''}
      </div>
      <div class="business-actions">
        <a class="btn btn-secondary" href="${slug}">Ver perfil</a>
      </div>
    </article>
  `;
}

async function loadHome(){
  if(!supabase){
    if(featured) featured.innerHTML = '<div class="empty-card">La conexión no está disponible en este momento.</div>';
    if(chipList) chipList.innerHTML = '<span class="chip muted">No fue posible cargar categorías.</span>';
    return;
  }

  try{
    const [categoriesRes, businessesRes, businessCountRes] = await Promise.all([
      supabase.from('categorias').select('id,nombre,slug').eq('activa', true).order('nombre'),
      supabase.from('negocios').select('id,slug,nombre,descripcion_corta,municipio,estado_region,logo_url,categoria_id,destacado').eq('activo', true).limit(6),
      supabase.from('negocios').select('id', { count:'exact', head:true }).eq('activo', true)
    ]);

    const categories = categoriesRes.data || [];
    const businesses = businessesRes.data || [];
    const categoryMap = new Map(categories.map(c => [c.id, c.nombre]));

    if(statBusinesses) statBusinesses.textContent = String(businessCountRes.count ?? businesses.length ?? 0);
    if(statCategories) statCategories.textContent = String(categories.length || 0);

    if(chipList){
      if(categories.length){
        chipList.innerHTML = categories.slice(0, 10).map(cat => `<a class="chip" href="explorar.html?categoria=${encodeURIComponent(cat.slug || cat.nombre)}">${esc(cat.nombre)}</a>`).join('');
      } else {
        chipList.innerHTML = '<span class="chip muted">Aún no hay categorías disponibles.</span>';
      }
    }

    if(featured){
      if(businesses.length){
        featured.innerHTML = businesses.map(b => businessCard(b, categoryMap)).join('');
      } else {
        featured.innerHTML = '<div class="empty-card">Todavía no hay negocios visibles aquí, pero ya puedes publicar lo que necesitas desde “Necesito algo”.</div>';
      }
    }
  }catch(error){
    console.warn('[Aliados] No se pudo cargar el inicio simple', error);
    if(featured) featured.innerHTML = '<div class="empty-card">No pudimos cargar los negocios por ahora.</div>';
    if(chipList) chipList.innerHTML = '<span class="chip muted">Intenta de nuevo en unos momentos.</span>';
  }
}

async function personalizeBusinessCta(){
  if(!supabase || !businessCta) return;
  try{
    const { data: { user } } = await supabase.auth.getUser();
    if(!user) return;
    const { data: memberships } = await supabase
      .from('miembros_negocio')
      .select('negocio_id,activo,negocios(id,nombre,estado_operativo)')
      .eq('perfil_id', user.id)
      .eq('activo', true);
    const activeMembership = (memberships || []).find(row => row.negocios && !['suspendido','eliminacion_programada'].includes(row.negocios.estado_operativo));
    if(activeMembership){
      businessCta.href = `oportunidades.html?business=${encodeURIComponent(activeMembership.negocios.id)}`;
      businessCta.querySelector('strong').textContent = 'Ver oportunidades';
      if(businessCtaCopy) businessCtaCopy.textContent = `${activeMembership.negocios.nombre}: entra directo a tus oportunidades.`;
    } else {
      businessCta.href = 'panel.html';
      businessCta.querySelector('strong').textContent = 'Completar mi negocio';
      if(businessCtaCopy) businessCtaCopy.textContent = 'Tu sesión está activa. Entra a tu panel para completar tu perfil.';
    }
  }catch(error){
    console.warn('[Aliados] No se pudo personalizar CTA de negocio', error);
  }
}

loadHome();
personalizeBusinessCta();
