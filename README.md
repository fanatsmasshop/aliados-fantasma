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


## v1.7 — Modo de lanzamiento automático
- Antes del 24 de agosto de 2026, 2:30 p. m.: landing pública con contador; directorio y perfiles visibles únicamente para administradores autenticados.
- Al llegar la fecha: la landing cambia automáticamente a modo producción, habilita Explorar negocios y permite abrir los perfiles publicados.
- No requiere SQL adicional.
