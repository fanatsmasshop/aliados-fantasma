-- ============================================================
-- ALIADOS FANTASMA — MATCH + NOTIFICACIONES v1
-- 2026-08-19
-- Depende de: 078_lo_necesito.sql + centro de notificaciones existente
-- ============================================================

begin;

-- ---------- 1) Estado de matching y seguimiento del cliente ----------
alter table public.necesidades
  add column if not exists tracking_token uuid not null default gen_random_uuid(),
  add column if not exists fase_match smallint not null default 0,
  add column if not exists ultimo_match_at timestamptz,
  add column if not exists proximo_escalamiento_at timestamptz,
  add column if not exists sin_cobertura boolean not null default false,
  add column if not exists matches_count integer not null default 0,
  add column if not exists respuestas_count integer not null default 0,
  add column if not exists resuelta_at timestamptz;

create unique index if not exists necesidades_tracking_token_uidx
  on public.necesidades(tracking_token);
create index if not exists necesidades_match_queue_idx
  on public.necesidades(estado, proximo_escalamiento_at)
  where estado='abierta';
create index if not exists necesidades_demanda_idx
  on public.necesidades(categoria_id, municipio, estado_region, created_at desc)
  where estado='abierta';

alter table public.necesidades
  drop constraint if exists necesidades_fase_match_check;
alter table public.necesidades
  add constraint necesidades_fase_match_check check (fase_match between 0 and 3);

-- ---------- 2) Tabla de distribución/matching ----------
create table if not exists public.matches_necesidad (
  id uuid primary key default gen_random_uuid(),
  necesidad_id uuid not null references public.necesidades(id) on delete cascade,
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  score integer not null default 0,
  ola smallint not null default 1,
  razones jsonb not null default '[]'::jsonb,
  estado text not null default 'notificado',
  notificado_at timestamptz not null default now(),
  visto_at timestamptz,
  respondido_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_necesidad_unico unique(necesidad_id, negocio_id),
  constraint matches_necesidad_ola_check check (ola between 1 and 3),
  constraint matches_necesidad_estado_check check (estado in ('notificado','visto','respondido','descartado','expirado'))
);

create index if not exists matches_necesidad_negocio_idx
  on public.matches_necesidad(negocio_id, notificado_at desc);
create index if not exists matches_necesidad_necesidad_idx
  on public.matches_necesidad(necesidad_id, score desc);

alter table public.matches_necesidad enable row level security;
revoke all on table public.matches_necesidad from anon;
revoke all on table public.matches_necesidad from authenticated;
grant select, update on table public.matches_necesidad to authenticated;
grant all on table public.matches_necesidad to service_role;

drop policy if exists "Negocio consulta sus matches" on public.matches_necesidad;
create policy "Negocio consulta sus matches"
on public.matches_necesidad for select
to authenticated
using (
  (select public.es_administrador())
  or (select af_private.af_puede_gestionar_negocio((select auth.uid()), matches_necesidad.negocio_id))
);

drop policy if exists "Negocio marca sus matches" on public.matches_necesidad;
create policy "Negocio marca sus matches"
on public.matches_necesidad for update
to authenticated
using (
  (select public.es_administrador())
  or (select af_private.af_puede_gestionar_negocio((select auth.uid()), matches_necesidad.negocio_id))
)
with check (
  (select public.es_administrador())
  or (select af_private.af_puede_gestionar_negocio((select auth.uid()), matches_necesidad.negocio_id))
);

-- ---------- 3) Notificaciones: acción y metadata ----------
alter table public.notificaciones_plataforma
  add column if not exists accion_url text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists notificaciones_usuario_no_leida_idx
  on public.notificaciones_plataforma(usuario_id, created_at desc)
  where leida=false;

-- ---------- 4) Helpers internos ----------
create schema if not exists af_private;
revoke all on schema af_private from public, anon, authenticated;

create or replace function af_private.af_notificar_match(
  p_necesidad uuid,
  p_negocio uuid,
  p_ola smallint,
  p_score integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_need public.necesidades%rowtype;
  v_member record;
  v_count integer := 0;
  v_importante boolean := false;
begin
  select * into v_need from public.necesidades where id=p_necesidad;
  if not found then return 0; end if;
  v_importante := v_need.urgencia in ('hoy','24_horas');

  for v_member in
    select distinct mn.perfil_id
    from public.miembros_negocio mn
    join public.perfiles p on p.id=mn.perfil_id
    where mn.negocio_id=p_negocio
      and coalesce(mn.activo,false)=true
      and coalesce(p.activo,false)=true
  loop
    insert into public.notificaciones_plataforma(
      usuario_id, para_administracion, negocio_id, tipo, titulo, mensaje,
      leida, importante, obligatoria, source_key, accion_url, metadata
    ) values (
      v_member.perfil_id,
      false,
      p_negocio,
      case when v_importante then 'oportunidad_urgente' else 'nueva_oportunidad' end,
      case when v_importante then '🔥 Oportunidad urgente' else '👻 Nueva oportunidad para tu negocio' end,
      v_need.titulo || ' · ' || coalesce(nullif(v_need.colonia,''),v_need.municipio) ||
        case when v_need.presupuesto_max is not null then ' · Hasta $' || trim(to_char(v_need.presupuesto_max,'FM999G999G990D00')) else '' end,
      false,
      v_importante,
      false,
      'need_match:'||p_necesidad::text||':biz:'||p_negocio::text||':wave:'||p_ola::text||':user:'||v_member.perfil_id::text,
      'oportunidades.html?need='||p_necesidad::text||'&business='||p_negocio::text,
      jsonb_build_object('necesidad_id',p_necesidad,'negocio_id',p_negocio,'ola',p_ola,'score',p_score)
    ) on conflict (source_key) where source_key is not null do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function af_private.af_notificar_match(uuid,uuid,smallint,integer) from public, anon, authenticated;

create or replace function af_private.af_distribuir_necesidad(
  p_necesidad uuid,
  p_ola smallint default 1
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_need public.necesidades%rowtype;
  v_c record;
  v_inserted integer := 0;
  v_match_id uuid;
  v_limit integer := case when p_ola=1 then 3 when p_ola=2 then 3 else 5 end;
  v_delay interval;
  v_total integer;
begin
  if p_ola < 1 or p_ola > 3 then raise exception 'Ola inválida'; end if;

  select * into v_need
  from public.necesidades
  where id=p_necesidad
  for update;

  if not found or v_need.estado <> 'abierta' or v_need.expires_at <= now() then return 0; end if;

  -- Las olas amplían geografía, no categoría: evitamos spam a negocios irrelevantes.
  for v_c in
    with history as (
      select n.id negocio_id,
             count(distinct r.id) filter (where r.estado in ('contactado','cerrada')) as responses,
             count(distinct m.id) as notifications
      from public.negocios n
      left join public.respuestas_necesidad r on r.negocio_id=n.id
      left join public.matches_necesidad m on m.negocio_id=n.id
      group by n.id
    ), candidates as (
      select
        n.id,
        (
          45
          + case when lower(trim(coalesce(n.municipio,'')))=lower(trim(coalesce(v_need.municipio,''))) then 25 else 0 end
          + case when lower(trim(coalesce(n.estado_region,'')))=lower(trim(coalesce(v_need.estado_region,''))) then 10 else 0 end
          + case when coalesce(n.verificado,false) then 5 else 0 end
          + least(15, coalesce(h.responses,0)::integer * 3)
        )::integer score,
        jsonb_strip_nulls(jsonb_build_array(
          'misma categoría',
          case when lower(trim(coalesce(n.municipio,'')))=lower(trim(coalesce(v_need.municipio,''))) then 'mismo municipio' end,
          case when lower(trim(coalesce(n.estado_region,'')))=lower(trim(coalesce(v_need.estado_region,''))) then 'mismo estado' end,
          case when coalesce(n.verificado,false) then 'negocio verificado' end,
          case when coalesce(h.responses,0)>0 then 'historial de respuesta' end
        )) razones
      from public.negocios n
      left join history h on h.negocio_id=n.id
      where n.categoria_id is not distinct from v_need.categoria_id
        and coalesce(n.activo,false)=true
        and n.estado='activo'
        and coalesce(n.estado_operativo,'activo')='activo'
        and exists(select 1 from public.miembros_negocio mn where mn.negocio_id=n.id and coalesce(mn.activo,false)=true)
        and not exists(select 1 from public.matches_necesidad old where old.necesidad_id=v_need.id and old.negocio_id=n.id)
        and (
          (p_ola=1 and lower(trim(coalesce(n.municipio,'')))=lower(trim(coalesce(v_need.municipio,''))))
          or (p_ola=2 and lower(trim(coalesce(n.estado_region,'')))=lower(trim(coalesce(v_need.estado_region,''))))
          or p_ola=3
        )
    )
    select * from candidates order by score desc, id limit v_limit
  loop
    v_match_id := null;
    insert into public.matches_necesidad(necesidad_id,negocio_id,score,ola,razones)
    values(v_need.id,v_c.id,v_c.score,p_ola,v_c.razones)
    on conflict (necesidad_id,negocio_id) do nothing
    returning id into v_match_id;

    if v_match_id is not null then
      v_inserted := v_inserted + 1;
      perform af_private.af_notificar_match(v_need.id,v_c.id,p_ola,v_c.score);
    end if;
  end loop;

  select count(*) into v_total from public.matches_necesidad where necesidad_id=v_need.id;
  v_delay := case
    when v_inserted=0 then interval '5 minutes'
    when v_need.urgencia='hoy' then interval '10 minutes'
    when v_need.urgencia='24_horas' then interval '15 minutes'
    else interval '20 minutes'
  end;

  update public.necesidades
  set fase_match=greatest(fase_match,p_ola),
      ultimo_match_at=now(),
      matches_count=v_total,
      proximo_escalamiento_at=case when p_ola<3 then now()+v_delay else now()+v_delay end,
      updated_at=now()
  where id=v_need.id;

  return v_inserted;
end;
$$;

revoke all on function af_private.af_distribuir_necesidad(uuid,smallint) from public, anon, authenticated;

create or replace function af_private.af_marcar_sin_cobertura(p_necesidad uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_need public.necesidades%rowtype;
begin
  select * into v_need from public.necesidades where id=p_necesidad;
  if not found or v_need.estado<>'abierta' then return; end if;

  update public.necesidades
  set sin_cobertura=true, fase_match=3, proximo_escalamiento_at=null, updated_at=now()
  where id=p_necesidad;

  insert into public.notificaciones_plataforma(
    usuario_id,para_administracion,negocio_id,tipo,titulo,mensaje,leida,importante,obligatoria,source_key,accion_url,metadata
  ) values(
    null,true,null,'demanda_sin_cobertura','🚨 Demanda sin cobertura',
    v_need.titulo||' · '||v_need.categoria_texto||' · '||v_need.municipio,
    false,true,false,'need_gap:'||p_necesidad::text,'demanda.html?need='||p_necesidad::text,
    jsonb_build_object('necesidad_id',p_necesidad,'categoria_id',v_need.categoria_id,'categoria',v_need.categoria_texto,'municipio',v_need.municipio)
  ) on conflict (source_key) where source_key is not null do nothing;
end;
$$;
revoke all on function af_private.af_marcar_sin_cobertura(uuid) from public, anon, authenticated;

create or replace function af_private.af_escalar_necesidades()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_need record;
  v_processed integer := 0;
  v_responses integer;
begin
  update public.necesidades
  set estado='expirada',proximo_escalamiento_at=null,updated_at=now()
  where estado='abierta' and expires_at<=now();

  for v_need in
    select id,fase_match
    from public.necesidades
    where estado='abierta'
      and expires_at>now()
      and proximo_escalamiento_at is not null
      and proximo_escalamiento_at<=now()
    order by proximo_escalamiento_at
    limit 100
    for update skip locked
  loop
    select count(*) into v_responses
    from public.respuestas_necesidad
    where necesidad_id=v_need.id and estado in ('contactado','cerrada');

    if v_responses>0 then
      update public.necesidades set respuestas_count=v_responses,proximo_escalamiento_at=null,updated_at=now() where id=v_need.id;
    elsif v_need.fase_match < 3 then
      perform af_private.af_distribuir_necesidad(v_need.id,(v_need.fase_match+1)::smallint);
    else
      perform af_private.af_marcar_sin_cobertura(v_need.id);
    end if;
    v_processed := v_processed+1;
  end loop;
  return v_processed;
end;
$$;
revoke all on function af_private.af_escalar_necesidades() from public, anon, authenticated;

-- ---------- 5) Triggers: publicar -> matching; responder -> detener escalamiento ----------
create or replace function af_private.af_necesidad_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform af_private.af_distribuir_necesidad(new.id,1::smallint);
  return new;
end;
$$;
revoke all on function af_private.af_necesidad_after_insert() from public, anon, authenticated;

drop trigger if exists trg_necesidad_match_after_insert on public.necesidades;
create trigger trg_necesidad_match_after_insert
after insert on public.necesidades
for each row execute function af_private.af_necesidad_after_insert();

create or replace function af_private.af_respuesta_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.respuestas_necesidad
  where necesidad_id=new.necesidad_id and estado in ('contactado','cerrada');

  update public.necesidades
  set respuestas_count=v_count,
      proximo_escalamiento_at=case when v_count>0 then null else proximo_escalamiento_at end,
      updated_at=now()
  where id=new.necesidad_id;

  update public.matches_necesidad
  set estado='respondido',respondido_at=coalesce(respondido_at,now()),updated_at=now()
  where necesidad_id=new.necesidad_id and negocio_id=new.negocio_id;

  return new;
end;
$$;
revoke all on function af_private.af_respuesta_after_change() from public, anon, authenticated;

drop trigger if exists trg_respuesta_actualiza_match on public.respuestas_necesidad;
create trigger trg_respuesta_actualiza_match
after insert or update of estado,contactado_at on public.respuestas_necesidad
for each row execute function af_private.af_respuesta_after_change();

-- ---------- 6) API pública segura: publicar y consultar por token ----------
create or replace function public.af_publicar_necesidad(
  p_categoria_id uuid,
  p_categoria_texto text,
  p_nombre_cliente text,
  p_whatsapp text,
  p_titulo text,
  p_descripcion text,
  p_estado_region text,
  p_municipio text,
  p_colonia text default null,
  p_presupuesto_min numeric default null,
  p_presupuesto_max numeric default null,
  p_fecha_necesaria date default null,
  p_urgencia text default 'normal'
)
returns table(id uuid,tracking_token uuid,expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_categoria_id is not null and not exists(select 1 from public.categorias c where c.id=p_categoria_id and c.activa=true) then
    raise exception 'Categoría no disponible';
  end if;
  if p_urgencia not in ('normal','esta_semana','24_horas','hoy') then raise exception 'Urgencia inválida'; end if;

  return query
  insert into public.necesidades(
    categoria_id,categoria_texto,nombre_cliente,whatsapp,titulo,descripcion,
    estado_region,municipio,colonia,presupuesto_min,presupuesto_max,
    fecha_necesaria,urgencia,acepta_compartir_contacto,origen
  ) values(
    p_categoria_id,trim(p_categoria_texto),trim(p_nombre_cliente),regexp_replace(p_whatsapp,'[^0-9]','','g'),
    trim(p_titulo),trim(p_descripcion),trim(p_estado_region),trim(p_municipio),nullif(trim(coalesce(p_colonia,'')),''),
    p_presupuesto_min,p_presupuesto_max,p_fecha_necesaria,p_urgencia,true,'web_match_v1'
  )
  returning necesidades.id,necesidades.tracking_token,necesidades.expires_at;
end;
$$;
revoke all on function public.af_publicar_necesidad(uuid,text,text,text,text,text,text,text,text,numeric,numeric,date,text) from public;
grant execute on function public.af_publicar_necesidad(uuid,text,text,text,text,text,text,text,text,numeric,numeric,date,text) to anon,authenticated;

create or replace function public.af_estado_necesidad(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id',n.id,
    'titulo',n.titulo,
    'categoria',n.categoria_texto,
    'estado',n.estado,
    'municipio',n.municipio,
    'estado_region',n.estado_region,
    'urgencia',n.urgencia,
    'fase_match',n.fase_match,
    'sin_cobertura',n.sin_cobertura,
    'matches_count',n.matches_count,
    'respuestas_count',n.respuestas_count,
    'created_at',n.created_at,
    'updated_at',n.updated_at,
    'expires_at',n.expires_at,
    'resuelta_at',n.resuelta_at,
    'respuestas',coalesce((
      select jsonb_agg(jsonb_build_object(
        'negocio',b.nombre,
        'slug',b.slug,
        'precio_estimado',r.precio_estimado,
        'tiempo_estimado',r.tiempo_estimado,
        'mensaje',r.mensaje,
        'contactado_at',r.contactado_at
      ) order by r.contactado_at nulls last,r.created_at)
      from public.respuestas_necesidad r
      join public.negocios b on b.id=r.negocio_id
      where r.necesidad_id=n.id and r.estado in ('contactado','cerrada')
    ),'[]'::jsonb)
  )
  from public.necesidades n
  where n.tracking_token=p_token
  limit 1;
$$;
revoke all on function public.af_estado_necesidad(uuid) from public;
grant execute on function public.af_estado_necesidad(uuid) to anon,authenticated;

create or replace function public.af_cerrar_necesidad(p_token uuid,p_resuelta boolean default true)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.necesidades
  set estado='cerrada',resuelta_at=case when p_resuelta then now() else resuelta_at end,proximo_escalamiento_at=null,updated_at=now()
  where tracking_token=p_token and estado in ('abierta','pausada');
  return found;
end;
$$;
revoke all on function public.af_cerrar_necesidad(uuid,boolean) from public;
grant execute on function public.af_cerrar_necesidad(uuid,boolean) to anon,authenticated;

create or replace function public.af_actividad_publica(p_limite integer default 8)
returns table(
  id uuid,titulo text,categoria text,municipio text,estado_region text,urgencia text,
  created_at timestamptz,matches_count integer,respuestas_count integer,sin_cobertura boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id,n.titulo,n.categoria_texto,n.municipio,n.estado_region,n.urgencia,n.created_at,
         n.matches_count,n.respuestas_count,n.sin_cobertura
  from public.necesidades n
  where n.estado='abierta' and n.expires_at>now()
  order by n.created_at desc
  limit least(greatest(coalesce(p_limite,8),1),20);
$$;
revoke all on function public.af_actividad_publica(integer) from public;
grant execute on function public.af_actividad_publica(integer) to anon,authenticated;

-- ---------- 7) Administración: demanda que necesita proveedor ----------
create or replace function public.af_admin_demanda_resumen()
returns table(
  categoria_id uuid,categoria text,solicitudes bigint,sin_cobertura bigint,respuestas bigint,ultima_solicitud timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_administrador() then raise exception 'No autorizado'; end if;
  return query
  select n.categoria_id,n.categoria_texto,count(*)::bigint,
         count(*) filter(where n.sin_cobertura)::bigint,
         sum(n.respuestas_count)::bigint,max(n.created_at)
  from public.necesidades n
  where n.created_at>=now()-interval '30 days'
  group by n.categoria_id,n.categoria_texto
  order by count(*) filter(where n.sin_cobertura) desc,count(*) desc;
end;
$$;
revoke all on function public.af_admin_demanda_resumen() from public,anon;
grant execute on function public.af_admin_demanda_resumen() to authenticated;

-- ---------- 8) Exposición Data API explícita ----------
grant select on table public.necesidades to authenticated;
grant select,insert,update on table public.respuestas_necesidad to authenticated;
grant select,update,delete on table public.notificaciones_plataforma to authenticated;

-- ---------- 9) Realtime para notificaciones del negocio ----------
do $$
begin
  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='notificaciones_plataforma'
  ) then
    execute 'alter publication supabase_realtime add table public.notificaciones_plataforma';
  end if;
end $$;

commit;

-- ---------- 10) Cron de escalamiento ----------
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

do $$
declare v_job record;
begin
  for v_job in select jobid from cron.job where jobname='aliados-match-escalamiento' loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end $$;

select cron.schedule(
  'aliados-match-escalamiento',
  '*/5 * * * *',
  'select af_private.af_escalar_necesidades();'
);

-- Backfill seguro: las solicitudes previas abiertas (si existieran) arrancan matching.
do $$
declare v_id uuid;
begin
  for v_id in
    select id from public.necesidades
    where estado='abierta' and expires_at>now() and fase_match=0
  loop
    perform af_private.af_distribuir_necesidad(v_id,1::smallint);
  end loop;
end $$;
