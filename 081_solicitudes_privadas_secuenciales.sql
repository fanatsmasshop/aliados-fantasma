-- Aliados Fantasma · Solicitudes privadas secuenciales
-- 2026-08-20

alter table public.matches_necesidad
  add column if not exists turno_estado text not null default 'espera',
  add column if not exists turno_expires_at timestamptz,
  add column if not exists decidido_at timestamptz;

alter table public.matches_necesidad drop constraint if exists matches_necesidad_turno_estado_check;
alter table public.matches_necesidad add constraint matches_necesidad_turno_estado_check
  check (turno_estado in ('espera','activo','aceptado','rechazado','expirado'));

create index if not exists idx_matches_necesidad_turno
  on public.matches_necesidad(necesidad_id, turno_estado, score desc, created_at);

create or replace function af_private.af_notificar_match(p_necesidad uuid, p_negocio uuid, p_ola smallint, p_score integer)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare v_need public.necesidades%rowtype; v_member record; v_count integer:=0; v_importante boolean:=false;
begin
  select * into v_need from public.necesidades where id=p_necesidad;
  if not found then return 0; end if;
  v_importante:=v_need.urgencia in ('hoy','24_horas');
  for v_member in
    select distinct mn.perfil_id
    from public.miembros_negocio mn
    join public.perfiles p on p.id=mn.perfil_id
    where mn.negocio_id=p_negocio and coalesce(mn.activo,false)=true and coalesce(p.activo,false)=true
  loop
    insert into public.notificaciones_plataforma(
      usuario_id,para_administracion,negocio_id,tipo,titulo,mensaje,leida,importante,obligatoria,source_key,accion_url,metadata,push_estado
    ) values(
      v_member.perfil_id,false,p_negocio,
      case when v_importante then 'solicitud_urgente' else 'solicitud_recomendada' end,
      case when v_importante then '🔥 Nueva solicitud urgente' else '👻 Nueva solicitud para tu negocio' end,
      v_need.titulo || ' · ' || coalesce(nullif(v_need.colonia,''),v_need.municipio) || case when v_need.presupuesto_max is not null then ' · Hasta $' || trim(to_char(v_need.presupuesto_max,'FM999G999G990D00')) else '' end,
      false,v_importante,false,
      'need_turn:'||p_necesidad::text||':biz:'||p_negocio::text||':user:'||v_member.perfil_id::text,
      'oportunidades.html?need='||p_necesidad::text||'&business='||p_negocio::text,
      jsonb_build_object('necesidad_id',p_necesidad,'negocio_id',p_negocio,'score_interno',p_score),
      'pendiente'
    ) on conflict (source_key) where source_key is not null do nothing;
    if found then v_count:=v_count+1; end if;
  end loop;
  return v_count;
end;
$$;

create or replace function af_private.af_activar_siguiente(p_necesidad uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_need public.necesidades%rowtype; v_match public.matches_necesidad%rowtype; v_timeout interval;
begin
  select * into v_need from public.necesidades where id=p_necesidad for update;
  if not found or v_need.estado<>'abierta' or v_need.expires_at<=now() then return null; end if;
  if exists(select 1 from public.respuestas_necesidad r where r.necesidad_id=p_necesidad and r.estado in ('contactado','cerrada')) then return null; end if;
  if exists(select 1 from public.matches_necesidad m where m.necesidad_id=p_necesidad and m.turno_estado='activo' and (m.turno_expires_at is null or m.turno_expires_at>now())) then return null; end if;

  update public.matches_necesidad
  set turno_estado='expirado',estado='expirado',decidido_at=coalesce(decidido_at,now()),updated_at=now()
  where necesidad_id=p_necesidad and turno_estado='activo' and turno_expires_at<=now();

  select * into v_match
  from public.matches_necesidad
  where necesidad_id=p_necesidad and turno_estado='espera'
  order by score desc, ola asc, created_at asc
  limit 1 for update skip locked;
  if not found then return null; end if;

  v_timeout:=case when v_need.urgencia='hoy' then interval '8 minutes' when v_need.urgencia='24_horas' then interval '12 minutes' else interval '20 minutes' end;
  update public.matches_necesidad
  set turno_estado='activo',estado='notificado',notificado_at=coalesce(notificado_at,now()),turno_expires_at=now()+v_timeout,updated_at=now()
  where id=v_match.id;
  perform af_private.af_notificar_match(p_necesidad,v_match.negocio_id,v_match.ola,v_match.score);
  return v_match.id;
end;
$$;

create or replace function af_private.af_distribuir_necesidad(p_necesidad uuid, p_ola smallint default 1)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_need public.necesidades%rowtype; v_c record; v_inserted integer:=0; v_match_id uuid;
  v_limit integer:=case when p_ola=1 then 3 when p_ola=2 then 3 else 5 end;
  v_total integer; v_req text; v_req_norm text;
begin
  if p_ola<1 or p_ola>3 then raise exception 'Ola inválida'; end if;
  select * into v_need from public.necesidades where id=p_necesidad for update;
  if not found or v_need.estado<>'abierta' or v_need.expires_at<=now() then return 0; end if;
  v_req:=concat_ws(' ',v_need.titulo,v_need.descripcion,v_need.categoria_texto);
  v_req_norm:=af_private.af_normalizar_texto(v_req);

  for v_c in
    with req_concepts as (
      select l.concepto,max(l.peso)::int peso
      from af_private.match_ai_lexico l
      where position(' '||af_private.af_normalizar_texto(l.variante)||' ' in ' '||v_req_norm||' ')>0
         or to_tsvector('spanish',v_req) @@ plainto_tsquery('spanish',l.variante)
      group by l.concepto
    ), history as (
      select n.id negocio_id,count(distinct r.id) filter(where r.estado in ('contactado','cerrada')) responses
      from public.negocios n left join public.respuestas_necesidad r on r.negocio_id=n.id group by n.id
    ), candidates as (
      select n.id,
        (case when v_need.categoria_id is not null and n.categoria_id=v_need.categoria_id then 30 else 0 end
         + coalesce(cap.direct_score,0)+coalesce(cap.concept_score,0)+coalesce(cap.profile_score,0)
         + case when af_private.af_misma_zona(n.municipio,v_need.municipio) then 25 else 0 end
         + case when af_private.af_misma_zona(n.estado_region,v_need.estado_region) then 10 else 0 end
         + case when coalesce(n.verificado,false) then 5 else 0 end
         + least(15,coalesce(h.responses,0)::integer*3))::integer score,
        (case when cap.concept_reason is not null then jsonb_build_array('concepto '||cap.concept_reason) else '[]'::jsonb end
         || case when cap.direct_reason is not null then jsonb_build_array('producto/servicio '||cap.direct_reason) else '[]'::jsonb end
         || case when cap.profile_score>0 then jsonb_build_array('texto del negocio relacionado') else '[]'::jsonb end
         || case when v_need.categoria_id is not null and n.categoria_id=v_need.categoria_id then jsonb_build_array('categoría relacionada') else '[]'::jsonb end
         || case when af_private.af_misma_zona(n.municipio,v_need.municipio) then jsonb_build_array('misma zona') else '[]'::jsonb end
         || case when af_private.af_misma_zona(n.estado_region,v_need.estado_region) then jsonb_build_array('mismo estado') else '[]'::jsonb end) razones
      from public.negocios n
      left join history h on h.negocio_id=n.id
      left join public.match_ai_perfiles aip on aip.negocio_id=n.id
      left join lateral (
        select
          coalesce((select greatest(55,round(c.peso*0.75))::int from public.capacidades_match_negocio c
            where c.negocio_id=n.id and c.activo=true and (
              position(' '||af_private.af_normalizar_texto(c.termino)||' ' in ' '||v_req_norm||' ')>0
              or to_tsvector('spanish',v_req) @@ plainto_tsquery('spanish',c.termino)
              or extensions.word_similarity(af_private.af_normalizar_texto(c.termino),v_req_norm)>=0.72
            ) order by c.peso desc limit 1),0) direct_score,
          (select c.termino from public.capacidades_match_negocio c
            where c.negocio_id=n.id and c.activo=true and (
              position(' '||af_private.af_normalizar_texto(c.termino)||' ' in ' '||v_req_norm||' ')>0
              or to_tsvector('spanish',v_req) @@ plainto_tsquery('spanish',c.termino)
              or extensions.word_similarity(af_private.af_normalizar_texto(c.termino),v_req_norm)>=0.72
            ) order by c.peso desc limit 1) direct_reason,
          coalesce((select greatest(70,rc.peso)::int from req_concepts rc where exists(
            select 1 from public.capacidades_match_negocio c where c.negocio_id=n.id and c.activo=true and af_private.af_normalizar_texto(c.termino)=af_private.af_normalizar_texto(rc.concepto)
          ) order by rc.peso desc limit 1),0) concept_score,
          (select rc.concepto from req_concepts rc where exists(
            select 1 from public.capacidades_match_negocio c where c.negocio_id=n.id and c.activo=true and af_private.af_normalizar_texto(c.termino)=af_private.af_normalizar_texto(rc.concepto)
          ) order by rc.peso desc limit 1) concept_reason,
          case when aip.texto_fuente is not null and extensions.word_similarity(v_req_norm,af_private.af_normalizar_texto(aip.texto_fuente))>=0.42
            then round(extensions.word_similarity(v_req_norm,af_private.af_normalizar_texto(aip.texto_fuente))*45)::int else 0 end profile_score
      ) cap on true
      where coalesce(n.activo,false)=true and n.estado='activo' and coalesce(n.estado_operativo,'activo')='activo'
        and exists(select 1 from public.miembros_negocio mn where mn.negocio_id=n.id and coalesce(mn.activo,false)=true)
        and not exists(select 1 from public.matches_necesidad old where old.necesidad_id=v_need.id and old.negocio_id=n.id)
        and (coalesce(cap.direct_score,0)>=55 or coalesce(cap.concept_score,0)>=70 or coalesce(cap.profile_score,0)>=18 or (v_need.categoria_id is not null and n.categoria_id=v_need.categoria_id))
        and ((p_ola=1 and af_private.af_misma_zona(n.municipio,v_need.municipio)) or (p_ola=2 and af_private.af_misma_zona(n.estado_region,v_need.estado_region)) or p_ola=3)
    ) select * from candidates where score>=55 order by score desc,id limit v_limit
  loop
    insert into public.matches_necesidad(necesidad_id,negocio_id,score,ola,razones,turno_estado,estado)
    values(v_need.id,v_c.id,v_c.score,p_ola,v_c.razones,'espera','espera')
    on conflict(necesidad_id,negocio_id) do nothing returning id into v_match_id;
    if v_match_id is not null then v_inserted:=v_inserted+1; end if;
  end loop;

  select count(*) into v_total from public.matches_necesidad where necesidad_id=v_need.id;
  update public.necesidades set fase_match=greatest(fase_match,p_ola),ultimo_match_at=now(),matches_count=v_total,
    proximo_escalamiento_at=now()+interval '5 minutes',sin_cobertura=false,updated_at=now() where id=v_need.id;
  perform af_private.af_activar_siguiente(v_need.id);
  return v_inserted;
end;
$$;

create or replace function af_private.af_escalar_necesidades()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare v_need record; v_processed integer:=0; v_responses integer; v_waiting integer; v_active integer;
begin
  update public.necesidades set estado='expirada',proximo_escalamiento_at=null,updated_at=now() where estado='abierta' and expires_at<=now();
  update public.matches_necesidad set turno_estado='expirado',estado='expirado',decidido_at=coalesce(decidido_at,now()),updated_at=now()
    where turno_estado='activo' and turno_expires_at is not null and turno_expires_at<=now();

  for v_need in select id,fase_match from public.necesidades where estado='abierta' and expires_at>now() order by created_at limit 100 for update skip locked loop
    select count(*) into v_responses from public.respuestas_necesidad where necesidad_id=v_need.id and estado in ('contactado','cerrada');
    if v_responses>0 then
      update public.necesidades set respuestas_count=v_responses,proximo_escalamiento_at=null,updated_at=now() where id=v_need.id;
      continue;
    end if;
    select count(*) into v_active from public.matches_necesidad where necesidad_id=v_need.id and turno_estado='activo' and (turno_expires_at is null or turno_expires_at>now());
    if v_active>0 then continue; end if;
    select count(*) into v_waiting from public.matches_necesidad where necesidad_id=v_need.id and turno_estado='espera';
    if v_waiting>0 then
      perform af_private.af_activar_siguiente(v_need.id);
    elsif v_need.fase_match<3 then
      perform af_private.af_distribuir_necesidad(v_need.id,(v_need.fase_match+1)::smallint);
    else
      perform af_private.af_marcar_sin_cobertura(v_need.id);
    end if;
    v_processed:=v_processed+1;
  end loop;
  return v_processed;
end;
$$;

-- Solo administración puede consultar la tabla cruda con teléfono.
drop policy if exists "Negocios consultan necesidades" on public.necesidades;
drop policy if exists "Administradores consultan necesidades" on public.necesidades;
create policy "Administradores consultan necesidades" on public.necesidades for select to authenticated
using ((select public.es_administrador()));

-- Respuestas solo para el negocio al que le toca.
drop policy if exists "Negocio crea sus respuestas" on public.respuestas_necesidad;
create policy "Negocio crea sus respuestas" on public.respuestas_necesidad for insert to authenticated
with check (
  respondido_por=(select auth.uid())
  and (select af_private.af_puede_gestionar_negocio((select auth.uid()),negocio_id))
  and exists(select 1 from public.matches_necesidad m where m.necesidad_id=respuestas_necesidad.necesidad_id and m.negocio_id=respuestas_necesidad.negocio_id and m.turno_estado='activo')
);

create or replace function public.af_solicitudes_para_negocio(p_negocio uuid)
returns table(
  id uuid,categoria_id uuid,categoria_texto text,titulo text,descripcion text,estado_region text,municipio text,colonia text,
  presupuesto_min numeric,presupuesto_max numeric,fecha_necesaria date,urgencia text,created_at timestamptz,
  turno_expires_at timestamptz,estado_turno text,ya_respondio boolean
)
language sql
stable
security definer
set search_path=''
as $$
  select n.id,n.categoria_id,n.categoria_texto,n.titulo,n.descripcion,n.estado_region,n.municipio,n.colonia,
         n.presupuesto_min,n.presupuesto_max,n.fecha_necesaria,n.urgencia,n.created_at,
         m.turno_expires_at,m.turno_estado,
         exists(select 1 from public.respuestas_necesidad r where r.necesidad_id=n.id and r.negocio_id=p_negocio and r.estado in ('contactado','cerrada'))
  from public.matches_necesidad m
  join public.necesidades n on n.id=m.necesidad_id
  where m.negocio_id=p_negocio
    and (select af_private.af_puede_gestionar_negocio((select auth.uid()),p_negocio))
    and n.estado='abierta' and n.expires_at>now()
    and m.turno_estado in ('activo','aceptado')
  order by case when m.turno_estado='activo' then 0 else 1 end,n.created_at desc;
$$;
revoke all on function public.af_solicitudes_para_negocio(uuid) from public;
grant execute on function public.af_solicitudes_para_negocio(uuid) to authenticated;

create or replace function public.af_responder_solicitud(
  p_necesidad uuid,p_negocio uuid,p_precio numeric default null,p_tiempo text default null,p_mensaje text default null
) returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_match uuid;
begin
  if v_uid is null or not af_private.af_puede_gestionar_negocio(v_uid,p_negocio) then raise exception 'No autorizado'; end if;
  select id into v_match from public.matches_necesidad
   where necesidad_id=p_necesidad and negocio_id=p_negocio and turno_estado='activo'
     and (turno_expires_at is null or turno_expires_at>now()) for update;
  if v_match is null then raise exception 'Esta solicitud ya fue asignada a otra opción'; end if;

  insert into public.respuestas_necesidad(necesidad_id,negocio_id,respondido_por,precio_estimado,tiempo_estimado,mensaje,estado,contactado_at)
  values(p_necesidad,p_negocio,v_uid,p_precio,nullif(trim(coalesce(p_tiempo,'')),''),nullif(trim(coalesce(p_mensaje,'')),''),'contactado',now())
  on conflict(necesidad_id,negocio_id) do update set respondido_por=excluded.respondido_por,precio_estimado=excluded.precio_estimado,
    tiempo_estimado=excluded.tiempo_estimado,mensaje=excluded.mensaje,estado='contactado',contactado_at=now(),updated_at=now();

  update public.matches_necesidad set turno_estado='aceptado',estado='respondido',respondido_at=now(),decidido_at=now(),turno_expires_at=null,updated_at=now() where id=v_match;
  update public.matches_necesidad set turno_estado='expirado',estado='expirado',decidido_at=coalesce(decidido_at,now()),updated_at=now()
    where necesidad_id=p_necesidad and id<>v_match and turno_estado in ('activo','espera');
  update public.necesidades set respuestas_count=1,proximo_escalamiento_at=null,updated_at=now() where id=p_necesidad;
  return true;
end;
$$;
revoke all on function public.af_responder_solicitud(uuid,uuid,numeric,text,text) from public;
grant execute on function public.af_responder_solicitud(uuid,uuid,numeric,text,text) to authenticated;

create or replace function public.af_rechazar_solicitud(p_necesidad uuid,p_negocio uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_changed boolean;
begin
  if v_uid is null or not af_private.af_puede_gestionar_negocio(v_uid,p_negocio) then raise exception 'No autorizado'; end if;
  update public.matches_necesidad set turno_estado='rechazado',estado='expirado',decidido_at=now(),turno_expires_at=null,updated_at=now()
    where necesidad_id=p_necesidad and negocio_id=p_negocio and turno_estado='activo';
  v_changed:=found;
  if v_changed then perform af_private.af_activar_siguiente(p_necesidad); end if;
  return v_changed;
end;
$$;
revoke all on function public.af_rechazar_solicitud(uuid,uuid) from public;
grant execute on function public.af_rechazar_solicitud(uuid,uuid) to authenticated;

create or replace function public.af_estado_necesidad(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
select jsonb_build_object(
  'id',n.id,'titulo',n.titulo,'descripcion',n.descripcion,'categoria',n.categoria_texto,'estado',n.estado,
  'municipio',n.municipio,'estado_region',n.estado_region,'urgencia',n.urgencia,'sin_cobertura',n.sin_cobertura,
  'respuestas_count',n.respuestas_count,'created_at',n.created_at,'updated_at',n.updated_at,'expires_at',n.expires_at,'resuelta_at',n.resuelta_at,
  'estado_busqueda',case
    when n.estado='cerrada' then 'cerrada'
    when exists(select 1 from public.respuestas_necesidad r where r.necesidad_id=n.id and r.estado in ('contactado','cerrada')) then 'opcion_encontrada'
    when exists(select 1 from public.matches_necesidad m where m.necesidad_id=n.id and m.turno_estado='activo') then 'consultando_negocio'
    when n.sin_cobertura then 'busqueda_manual'
    else 'buscando' end,
  'opcion',(
    select jsonb_build_object(
      'negocio',b.nombre,'slug',b.slug,'logo_url',b.logo_url,
      'whatsapp',coalesce(nullif(b.whatsapp,''),b.telefono),
      'precio_estimado',r.precio_estimado,'tiempo_estimado',r.tiempo_estimado,'mensaje',r.mensaje,'contactado_at',r.contactado_at
    )
    from public.respuestas_necesidad r join public.negocios b on b.id=r.negocio_id
    where r.necesidad_id=n.id and r.estado in ('contactado','cerrada')
    order by r.contactado_at desc nulls last,r.created_at desc limit 1
  )
) from public.necesidades n where n.tracking_token=p_token limit 1;
$$;
revoke all on function public.af_estado_necesidad(uuid) from public;
grant execute on function public.af_estado_necesidad(uuid) to anon,authenticated;

-- Acomoda solicitudes abiertas actuales: solo una opción activa por solicitud.
with ranked as (
  select id,necesidad_id,row_number() over(partition by necesidad_id order by score desc,ola asc,created_at asc) rn
  from public.matches_necesidad
  where necesidad_id in (select id from public.necesidades where estado='abierta' and expires_at>now())
    and estado<>'respondido'
)
update public.matches_necesidad m
set turno_estado=case when r.rn=1 then 'activo' else 'espera' end,
    estado=case when r.rn=1 then 'notificado' else 'espera' end,
    turno_expires_at=case when r.rn=1 then now()+interval '20 minutes' else null end,
    updated_at=now()
from ranked r where r.id=m.id;
