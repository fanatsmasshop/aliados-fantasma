-- Aliados Fantasma · MATCH 2.0 · respaldo canónico de la lógica aplicada en producción 2026-08-31
create schema if not exists af_private;
alter table public.negocios add column if not exists match_keywords text[] not null default '{}'::text[];

create or replace function af_private.af_match_normalize(p_text text) returns text language sql immutable strict set search_path='' as $$
 select trim(regexp_replace(translate(lower(coalesce(p_text,'')),'áéíóúüñÁÉÍÓÚÜÑ','aeiouunAEIOUUN'),'[^a-z0-9]+',' ','g'));
$$;
create or replace function af_private.af_match_business_text(p_nombre text,p_corta text,p_descripcion text,p_categoria text,p_keywords text[]) returns text language sql immutable set search_path='' as $$
 select af_private.af_match_normalize(concat_ws(' ',coalesce(p_nombre,''),coalesce(p_corta,''),coalesce(p_descripcion,''),coalesce(p_categoria,''),array_to_string(coalesce(p_keywords,'{}'::text[]),' ')));
$$;
create or replace function af_private.af_match_same_place(p_a text,p_b text) returns boolean language sql immutable set search_path='' as $$
 with x as(select af_private.af_match_normalize(coalesce(p_a,'')) a,af_private.af_match_normalize(coalesce(p_b,'')) b)
 select case when length(a)<4 or length(b)<4 then a=b else a=b or position(a in b)>0 or position(b in a)>0 end from x;
$$;

create or replace function af_private.af_notificar_match(p_necesidad uuid,p_negocio uuid,p_ola smallint,p_score integer) returns integer language plpgsql security definer set search_path='' as $$
declare v_need public.necesidades%rowtype; v_member record; v_count integer:=0; v_importante boolean:=false;
begin
 select * into v_need from public.necesidades where id=p_necesidad;if not found then return 0;end if;v_importante:=v_need.urgencia in('hoy','24_horas');
 for v_member in select distinct mn.perfil_id from public.miembros_negocio mn join public.perfiles p on p.id=mn.perfil_id where mn.negocio_id=p_negocio and coalesce(mn.activo,false)=true and coalesce(p.activo,false)=true loop
  insert into public.notificaciones_plataforma(usuario_id,para_administracion,negocio_id,tipo,titulo,mensaje,leida,importante,obligatoria,source_key,accion_url,metadata)
  values(v_member.perfil_id,false,p_negocio,case when v_importante then 'oportunidad_urgente' else 'nueva_oportunidad' end,case when v_importante then '🔥 Match '||p_score||'% · oportunidad urgente' else '👻 Match '||p_score||'% para tu negocio' end,v_need.titulo||' · '||coalesce(nullif(v_need.colonia,''),v_need.municipio)||case when v_need.presupuesto_max is not null then ' · Hasta $'||trim(to_char(v_need.presupuesto_max,'FM999G999G990D00')) else '' end,false,v_importante,false,'need_match:'||p_necesidad::text||':biz:'||p_negocio::text||':wave:'||p_ola::text||':user:'||v_member.perfil_id::text,'oportunidades.html?need='||p_necesidad::text||'&business='||p_negocio::text,jsonb_build_object('necesidad_id',p_necesidad,'negocio_id',p_negocio,'ola',p_ola,'score',p_score)) on conflict(source_key) where source_key is not null do nothing;
  if found then v_count:=v_count+1;end if;
 end loop;return v_count;
end;$$;

create or replace function af_private.af_distribuir_necesidad(p_necesidad uuid,p_ola smallint default 1) returns integer language plpgsql security definer set search_path='' as $$
declare v_need public.necesidades%rowtype;v_c record;v_inserted integer:=0;v_match_id uuid;v_limit integer:=case when p_ola=1 then 4 when p_ola=2 then 4 else 6 end;v_delay interval;v_total integer;v_need_title text;v_need_description text;v_need_full text;
begin
 if p_ola<1 or p_ola>3 then raise exception 'Ola inválida';end if;select * into v_need from public.necesidades where id=p_necesidad for update;if not found or v_need.estado<>'abierta' or v_need.expires_at<=now() then return 0;end if;
 v_need_title:=af_private.af_match_normalize(v_need.titulo);v_need_description:=af_private.af_match_normalize(v_need.descripcion);v_need_full:=af_private.af_match_normalize(concat_ws(' ',v_need.titulo,v_need.descripcion,v_need.categoria_texto));
 for v_c in
  with history as(select n.id negocio_id,count(distinct r.id) filter(where r.estado in('contactado','cerrada')) as responses from public.negocios n left join public.respuestas_necesidad r on r.negocio_id=n.id group by n.id),
  raw_candidates as(select n.id,n.categoria_id,n.municipio,n.estado_region,n.verificado,coalesce(h.responses,0)::integer responses,af_private.af_match_business_text(n.nombre,n.descripcion_corta,n.descripcion,c.nombre,n.match_keywords) biz_text from public.negocios n left join public.categorias c on c.id=n.categoria_id left join history h on h.negocio_id=n.id where coalesce(n.activo,false)=true and n.estado='activo' and coalesce(n.estado_operativo,'activo')='activo' and exists(select 1 from public.miembros_negocio mn where mn.negocio_id=n.id and coalesce(mn.activo,false)=true) and not exists(select 1 from public.matches_necesidad old where old.necesidad_id=v_need.id and old.negocio_id=n.id) and ((p_ola=1 and af_private.af_match_same_place(n.municipio,v_need.municipio)) or (p_ola=2 and lower(trim(coalesce(n.estado_region,'')))=lower(trim(coalesce(v_need.estado_region,'')))) or p_ola=3)),
  scored as(select r.*,(r.categoria_id is not distinct from v_need.categoria_id and v_need.categoria_id is not null) same_category,greatest(extensions.word_similarity(v_need_title,r.biz_text),extensions.word_similarity(v_need_description,r.biz_text),extensions.word_similarity(v_need_full,r.biz_text)) text_similarity from raw_candidates r),
  candidates as(select s.id,least(100,greatest(0,(case when s.same_category then 25 else 0 end)+round(45*s.text_similarity)::integer+case when af_private.af_match_same_place(s.municipio,v_need.municipio) then 15 else 0 end+case when lower(trim(coalesce(s.estado_region,'')))=lower(trim(coalesce(v_need.estado_region,''))) then 5 else 0 end+case when coalesce(s.verificado,false) then 5 else 0 end+least(5,s.responses)))::integer score,jsonb_build_array(case when s.text_similarity>=.70 then 'coincidencia alta por producto/servicio' when s.text_similarity>=.42 then 'coincidencia por producto/servicio' when s.text_similarity>=.20 then 'coincidencia textual relacionada' end,case when s.same_category then 'misma categoría' end,case when af_private.af_match_same_place(s.municipio,v_need.municipio) then 'misma zona/municipio' end,case when lower(trim(coalesce(s.estado_region,'')))=lower(trim(coalesce(v_need.estado_region,''))) then 'mismo estado' end,case when coalesce(s.verificado,false) then 'negocio verificado' end,case when s.responses>0 then 'historial de respuesta' end) razones,s.text_similarity from scored s where s.same_category or s.text_similarity>=.20)
  select * from candidates where score>=case when p_ola=1 then 35 when p_ola=2 then 30 else 25 end order by score desc,text_similarity desc,id limit v_limit
 loop
  v_match_id:=null;insert into public.matches_necesidad(necesidad_id,negocio_id,score,ola,razones) values(v_need.id,v_c.id,v_c.score,p_ola,v_c.razones) on conflict(necesidad_id,negocio_id) do nothing returning id into v_match_id;if v_match_id is not null then v_inserted:=v_inserted+1;perform af_private.af_notificar_match(v_need.id,v_c.id,p_ola,v_c.score);end if;
 end loop;
 select count(*) into v_total from public.matches_necesidad where necesidad_id=v_need.id;v_delay:=case when v_inserted=0 then interval '5 minutes' when v_need.urgencia='hoy' then interval '10 minutes' when v_need.urgencia='24_horas' then interval '15 minutes' else interval '20 minutes' end;update public.necesidades set fase_match=greatest(fase_match,p_ola),ultimo_match_at=now(),matches_count=v_total,proximo_escalamiento_at=now()+v_delay,updated_at=now() where id=v_need.id;return v_inserted;
end;$$;

update public.negocios set match_keywords=array['casco','cascos','moto','motos','motocicleta','motocicletas','biker','equipo biker','guantes','chaleco','chalecos','rodilleras','coderas','protecciones','luces','direccionales','candados','intercomunicador','accesorios moto','accesorios biker','ropa biker','ropa gotica','ropa alternativa','playeras','sudaderas','gorras','regalos','personalizados','dtf','sublimacion','vinil'],updated_at=now() where slug='fantasmas-bikers-shop';
