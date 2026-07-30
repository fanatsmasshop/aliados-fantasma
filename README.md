# Aliados Fantasma

Versión funcional consolidada para Cloudflare Pages + Supabase.

## Rutas públicas oficiales

- `index.html`: presentación y lanzamiento.
- `explorar.html`: directorio real conectado a Supabase.
- `perfil.html?slug=...`: perfil público dinámico.
- `registro.html`: registro de negocios.
- `login.html`: acceso.
- `recuperar.html` y `restablecer.html`: recuperación de contraseña.
- `invitacion.html?token=...`: aceptación de invitaciones.

`directorio.html` se conserva únicamente como redirección compatible hacia `explorar.html`.

## Panel

- `panel.html`: panel del comerciante.
- `dashboard.html`: panel administrativo.
- `negocios.html`: gestión de negocios e invitaciones.
- `solicitudes.html`: revisión y publicación.
- `marketing.html`: centro de marketing.

## Supabase

La fuente canónica está en `supabase/`:

- `migrations/20260730121400_remote_schema_snapshot.sql`: snapshot estructural de producción.
- `functions/enviar-invitacion-negocio/index.ts`: Edge Function de invitaciones.
- `config.toml`: configuración de despliegue de la función.
- `history/`: SQL históricos; no deben ejecutarse en lote.

La Publishable Key del navegador se encuentra en `config.js`. Nunca agregues `service_role` ni secretos SMTP al repositorio.

## Versión actual

`AF-F1-FIX-1.0` — 30 de julio de 2026.

Consulta `AF_FASE1_CAMBIOS.md` para el detalle de correcciones.
