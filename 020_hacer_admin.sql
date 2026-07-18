-- ALIADOS FANTASMA — CONVERTIR CUENTA EN ADMINISTRADOR
-- Ejecuta este archivo en Supabase > SQL Editor

update public.perfiles
set rol = 'administrador'::public.rol_plataforma,
    estado = 'activo'::public.estado_usuario,
    activo = true,
    updated_at = now()
where lower(correo) = lower('fanatsmasbikersecatepec@gmail.com');

select id, nombre, correo, rol, estado, activo
from public.perfiles
where lower(correo) = lower('fanatsmasbikersecatepec@gmail.com');
