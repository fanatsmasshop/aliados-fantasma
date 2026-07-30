# Aliados Fantasma — Corrección Fase 1

Versión: `AF-F1-FIX-1.0`  
Fecha: 30 de julio de 2026

## Correcciones aplicadas

1. `index.html` ahora abre el directorio real `explorar.html`.
2. `directorio.html` quedó como redirección compatible y ya no muestra negocios ficticios.
3. Se eliminó el JavaScript legado que contenía “Café Local”.
4. Las rutas informativas regresan al directorio real.
5. Se unificaron las reglas de contraseña mediante `auth-validation.js` para:
   - registro;
   - invitaciones;
   - recuperación de contraseña.
6. Se eliminó la carga duplicada de configuración de Supabase.
7. Las páginas demo y de legado ahora redirigen a rutas oficiales.
8. Se añadieron `_redirects` y encabezados de seguridad/caché adecuados para Cloudflare Pages.
9. La Edge Function quedó en estructura reproducible de Supabase CLI.
10. Se generó una migración canónica desde el estado real de Supabase.
11. Los 27 SQL históricos se aislaron en `supabase/history/` para evitar ejecuciones accidentales o redefiniciones ambiguas.

## No modificado en esta versión

- Diseño móvil integral: corresponde a Fase 2.
- Datos existentes de producción.
- Configuración SMTP y plantillas guardadas directamente en Supabase.
- Estado remoto de la Edge Function; el archivo incluido es respaldo y fuente canónica.

## Publicación

Reemplaza el contenido del repositorio por esta versión completa. Cloudflare Pages reconocerá `_headers` y `_redirects` automáticamente.

No ejecutes la migración canónica sobre la instancia actual sin una copia de seguridad: el proyecto actual ya tiene ese esquema. La migración sirve principalmente para reconstrucción y control de versiones.
