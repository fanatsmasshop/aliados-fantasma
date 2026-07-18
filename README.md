# Aliados Fantasma — Demo pública v0.1

Versión revisada y unificada de la demostración pública y el panel administrativo.

## Flujo público
- `index.html`: presentación y directorio dinámico.
- `perfil.html?slug=...`: perfil público dinámico.
- `registro.html`: información para negocios interesados.
- `privacidad.html` y `terminos.html`: textos provisionales.

## Flujo privado
- `login.html`: acceso administrativo.
- `dashboard.html`: resumen del sistema.
- `negocios.html`: alta, edición y activación de negocios.
- `solicitudes.html`: revisión de solicitudes.
- `promociones.html`: administración de promociones.

## Seguridad
El navegador utiliza una Publishable Key de Supabase. Nunca agregues una Secret Key ni `service_role` al repositorio.

## Estado
Demo v0.1 — julio de 2026.


## v0.7.2 — Pre-registro y acceso
- Registro público con correo propio.
- Confirmación de correo.
- Recuperación y cambio de contraseña.
- Bandeja administrativa de pre-registros.
- Ejecutar `030_pre_registro_auth.sql` antes de probar.


## Fase actual: pre-registro
Esta entrega administra únicamente el pre-registro. Aprobar una solicitud no publica negocios, no crea perfiles públicos y no habilita paneles de propietarios.
