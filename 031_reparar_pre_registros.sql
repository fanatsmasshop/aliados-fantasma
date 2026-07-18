-- ALIADOS FANTASMA — HOTFIX PRE-REGISTROS v0.7.4
-- Ejecutar en Supabase > SQL Editor.
-- Este script recupera cuentas registradas antes de que el trigger funcionara correctamente.

insert into public.pre_registros (
  id,
  correo,
  nombre_responsable,
  nombre_negocio,
  categoria,
  whatsapp,
  municipio,
  colonia,
  correo_verificado,
  estado,
  created_at,
  updated_at
)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(u.raw_user_meta_data ->> 'nombre_responsable', ''),
  coalesce(u.raw_user_meta_data ->> 'nombre_negocio', ''),
  u.raw_user_meta_data ->> 'categoria',
  u.raw_user_meta_data ->> 'whatsapp',
  u.raw_user_meta_data ->> 'municipio',
  u.raw_user_meta_data ->> 'colonia',
  u.email_confirmed_at is not null,
  'pendiente',
  u.created_at,
  now()
from auth.users u
where coalesce(u.raw_user_meta_data ->> 'tipo_registro', '') = 'pre_registro_negocio'
on conflict (id) do update set
  correo = excluded.correo,
  nombre_responsable = excluded.nombre_responsable,
  nombre_negocio = excluded.nombre_negocio,
  categoria = excluded.categoria,
  whatsapp = excluded.whatsapp,
  municipio = excluded.municipio,
  colonia = excluded.colonia,
  correo_verificado = excluded.correo_verificado,
  updated_at = now();

-- Resultado de comprobación.
select
  nombre_negocio,
  nombre_responsable,
  correo,
  correo_verificado,
  estado,
  created_at
from public.pre_registros
order by created_at desc;
