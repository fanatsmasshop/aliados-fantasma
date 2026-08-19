-- ALIADOS FANTASMA — 078 · "LO NECESITO"
-- Marketplace de necesidades / oportunidades para negocios.
-- Ejecutar una sola vez en Supabase > SQL Editor.
-- Diseñado para convivir con la estructura actual de negocios y miembros.

begin;

create schema if not exists af_private;
revoke all on schema af_private from public;
grant usage on schema af_private to authenticated;

-- ---------------------------------------------------------------------------
-- 1) SOLICITUDES DE CLIENTES
-- ---------------------------------------------------------------------------
create table if not exists public.necesidades (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid null references public.categorias(id) on delete set null,
  categoria_texto text not null,
  nombre_cliente text not null,
  whatsapp text not null,
  titulo text not null,
  descripcion text not null,
  estado_region text not null default 'Estado de México',
  municipio text not null,
  colonia text null,
  presupuesto_min numeric(12,2) null,
  presupuesto_max numeric(12,2) null,
  fecha_necesaria date null,
  urgencia text not null default 'normal',
  estado text not null default 'abierta',
  acepta_compartir_contacto boolean not null default false,
  origen text not null default 'web',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  constraint necesidades_categoria_texto_check check (char_length(trim(categoria_texto)) between 2 and 80),
  constraint necesidades_nombre_cliente_check check (char_length(trim(nombre_cliente)) between 2 and 80),
  constraint necesidades_whatsapp_check check (whatsapp ~ '^[0-9]{10,15}$'),
  constraint necesidades_titulo_check check (char_length(trim(titulo)) between 4 and 100),
  constraint necesidades_descripcion_check check (char_length(trim(descripcion)) between 10 and 1500),
  constraint necesidades_estado_region_check check (char_length(trim(estado_region)) between 2 and 80),
  constraint necesidades_municipio_check check (char_length(trim(municipio)) between 2 and 100),
  constraint necesidades_urgencia_check check (urgencia in ('normal','esta_semana','24_horas','hoy')),
  constraint necesidades_estado_check check (estado in ('abierta','cerrada','pausada','expirada')),
  constraint necesidades_presupuesto_check check (
    (presupuesto_min is null or presupuesto_min >= 0)
    and (presupuesto_max is null or presupuesto_max >= 0)
    and (presupuesto_min is null or presupuesto_max is null or presupuesto_max >= presupuesto_min)
  )
);

create index if not exists idx_necesidades_estado_fecha
  on public.necesidades (estado, created_at desc);
create index if not exists idx_necesidades_categoria
  on public.necesidades (categoria_id, created_at desc);
create index if not exists idx_necesidades_ubicacion
  on public.necesidades (estado_region, municipio, created_at desc);
create index if not exists idx_necesidades_expira
  on public.necesidades (expires_at)
  where estado = 'abierta';

-- Normaliza el alta pública y limita abuso por número de WhatsApp.
create or replace function af_private.af_preparar_necesidad()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recientes integer;
begin
  new.nombre_cliente := trim(regexp_replace(coalesce(new.nombre_cliente,''), '[[:space:]]+', ' ', 'g'));
  new.whatsapp := regexp_replace(coalesce(new.whatsapp,''), '[^0-9]', '', 'g');
  new.titulo := trim(regexp_replace(coalesce(new.titulo,''), '[[:space:]]+', ' ', 'g'));
  new.descripcion := trim(coalesce(new.descripcion,''));
  new.categoria_texto := trim(regexp_replace(coalesce(new.categoria_texto,''), '[[:space:]]+', ' ', 'g'));
  new.estado_region := trim(regexp_replace(coalesce(new.estado_region,''), '[[:space:]]+', ' ', 'g'));
  new.municipio := trim(regexp_replace(coalesce(new.municipio,''), '[[:space:]]+', ' ', 'g'));
  new.colonia := nullif(trim(regexp_replace(coalesce(new.colonia,''), '[[:space:]]+', ' ', 'g')), '');

  -- Estos campos nunca los decide el navegador.
  new.estado := 'abierta';
  new.origen := 'web';
  new.created_at := now();
  new.updated_at := now();
  new.expires_at := now() + interval '7 days';

  if new.acepta_compartir_contacto is not true then
    raise exception 'Debes autorizar compartir tu contacto con negocios registrados.';
  end if;

  select count(*) into v_recientes
  from public.necesidades n
  where n.whatsapp = new.whatsapp
    and n.created_at >= now() - interval '24 hours';

  if v_recientes >= 3 then
    raise exception 'Límite alcanzado: máximo 3 solicitudes por WhatsApp cada 24 horas.';
  end if;

  return new;
end;
$$;

revoke all on function af_private.af_preparar_necesidad() from public;

drop trigger if exists trg_af_preparar_necesidad on public.necesidades;
create trigger trg_af_preparar_necesidad
before insert on public.necesidades
for each row execute function af_private.af_preparar_necesidad();

-- ---------------------------------------------------------------------------
-- 2) AUTORIZACIÓN DE NEGOCIOS
-- ---------------------------------------------------------------------------
create or replace function af_private.af_es_miembro_activo(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.perfiles p
      where p.id = p_usuario
        and p.rol = 'administrador'
        and coalesce(p.activo,false) = true
    )
    or exists (
      select 1
      from public.miembros_negocio mn
      join public.negocios n on n.id = mn.negocio_id
      where mn.perfil_id = p_usuario
        and coalesce(mn.activo,false) = true
        and coalesce(n.estado_operativo,'activo') not in ('suspendido','eliminacion_programada')
    );
$$;

create or replace function af_private.af_puede_gestionar_negocio(p_usuario uuid, p_negocio uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.perfiles p
      where p.id = p_usuario
        and p.rol = 'administrador'
        and coalesce(p.activo,false) = true
    )
    or exists (
      select 1
      from public.miembros_negocio mn
      where mn.perfil_id = p_usuario
        and mn.negocio_id = p_negocio
        and coalesce(mn.activo,false) = true
    );
$$;

revoke all on function af_private.af_es_miembro_activo(uuid) from public;
revoke all on function af_private.af_puede_gestionar_negocio(uuid,uuid) from public;
grant execute on function af_private.af_es_miembro_activo(uuid) to authenticated;
grant execute on function af_private.af_puede_gestionar_negocio(uuid,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) COTIZACIONES / CONTACTOS REALIZADOS POR NEGOCIOS
-- ---------------------------------------------------------------------------
create table if not exists public.respuestas_necesidad (
  id uuid primary key default gen_random_uuid(),
  necesidad_id uuid not null references public.necesidades(id) on delete cascade,
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  respondido_por uuid not null references public.perfiles(id) on delete cascade,
  precio_estimado numeric(12,2) null,
  tiempo_estimado text null,
  mensaje text not null,
  estado text not null default 'contactado',
  contactado_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint respuestas_necesidad_precio_check check (precio_estimado is null or precio_estimado >= 0),
  constraint respuestas_necesidad_tiempo_check check (tiempo_estimado is null or char_length(tiempo_estimado) <= 120),
  constraint respuestas_necesidad_mensaje_check check (char_length(trim(mensaje)) between 3 and 1200),
  constraint respuestas_necesidad_estado_check check (estado in ('preparada','contactado','cerrada')),
  constraint respuestas_necesidad_unica unique (necesidad_id, negocio_id)
);

create index if not exists idx_respuestas_necesidad_negocio
  on public.respuestas_necesidad (negocio_id, created_at desc);
create index if not exists idx_respuestas_necesidad_solicitud
  on public.respuestas_necesidad (necesidad_id, created_at desc);

create or replace function af_private.af_actualizar_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function af_private.af_actualizar_updated_at() from public;

drop trigger if exists trg_respuestas_necesidad_updated_at on public.respuestas_necesidad;
create trigger trg_respuestas_necesidad_updated_at
before update on public.respuestas_necesidad
for each row execute function af_private.af_actualizar_updated_at();

-- ---------------------------------------------------------------------------
-- 4) RLS + GRANTS
-- ---------------------------------------------------------------------------
alter table public.necesidades enable row level security;
alter table public.respuestas_necesidad enable row level security;

-- Alta pública: no hay lectura anónima del teléfono ni de las solicitudes.
drop policy if exists "Publico crea necesidades" on public.necesidades;
create policy "Publico crea necesidades"
on public.necesidades
for insert
to anon, authenticated
with check (
  acepta_compartir_contacto = true
  and char_length(trim(nombre_cliente)) between 2 and 80
  and whatsapp ~ '^[0-9]{10,15}$'
  and char_length(trim(titulo)) between 4 and 100
  and char_length(trim(descripcion)) between 10 and 1500
);

-- Solo cuentas vinculadas a un negocio (o admin) ven oportunidades.
drop policy if exists "Negocios consultan necesidades" on public.necesidades;
create policy "Negocios consultan necesidades"
on public.necesidades
for select
to authenticated
using ((select af_private.af_es_miembro_activo((select auth.uid()))));

-- Un negocio solo ve y administra sus propias respuestas.
drop policy if exists "Negocio consulta sus respuestas" on public.respuestas_necesidad;
create policy "Negocio consulta sus respuestas"
on public.respuestas_necesidad
for select
to authenticated
using ((select af_private.af_puede_gestionar_negocio((select auth.uid()), negocio_id)));

drop policy if exists "Negocio crea sus respuestas" on public.respuestas_necesidad;
create policy "Negocio crea sus respuestas"
on public.respuestas_necesidad
for insert
to authenticated
with check (
  respondido_por = (select auth.uid())
  and (select af_private.af_puede_gestionar_negocio((select auth.uid()), negocio_id))
);

drop policy if exists "Negocio actualiza sus respuestas" on public.respuestas_necesidad;
create policy "Negocio actualiza sus respuestas"
on public.respuestas_necesidad
for update
to authenticated
using ((select af_private.af_puede_gestionar_negocio((select auth.uid()), negocio_id)))
with check (
  respondido_por = (select auth.uid())
  and (select af_private.af_puede_gestionar_negocio((select auth.uid()), negocio_id))
);

-- La API puede insertar las columnas del formulario, pero no escoger estado/fechas.
revoke all on table public.necesidades from anon, authenticated;
grant insert (
  categoria_id,
  categoria_texto,
  nombre_cliente,
  whatsapp,
  titulo,
  descripcion,
  estado_region,
  municipio,
  colonia,
  presupuesto_min,
  presupuesto_max,
  fecha_necesaria,
  urgencia,
  acepta_compartir_contacto
) on public.necesidades to anon, authenticated;
grant select on table public.necesidades to authenticated;

revoke all on table public.respuestas_necesidad from anon, authenticated;
grant select, insert, update on table public.respuestas_necesidad to authenticated;

commit;

-- Verificación rápida después de ejecutar:
-- select relname, relrowsecurity from pg_class where relname in ('necesidades','respuestas_necesidad');
-- select policyname, tablename, cmd, roles from pg_policies where tablename in ('necesidades','respuestas_necesidad');
