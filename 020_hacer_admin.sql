-- ALIADOS FANTASMA — ASIGNAR CUENTA ADMINISTRADORA
-- Ejecuta este archivo en Supabase > SQL Editor DESPUÉS de crear la cuenta
-- con el correo indicado desde Authentication.

update public.perfiles
set
  rol = 'administrador'::public.rol_plataforma,
  estado = 'activo'::public.estado_usuario,
  activo = true,
  updated_at = now()
where lower(correo) = lower('fanatsmasbikersecatepec@gmail.com');

-- Verificación
select id, nombre, correo, rol, estado, activo
from public.perfiles
where lower(correo) = lower('fanatsmasbikersecatepec@gmail.com');
