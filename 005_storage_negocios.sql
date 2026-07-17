-- ALIADOS FANTASMA — STORAGE PARA LOGOS Y PORTADAS
-- Antes de ejecutar:
-- 1. Ve a Supabase > Storage.
-- 2. Crea un bucket llamado: negocios-media
-- 3. Márcalo como PUBLIC.
-- 4. Allowed MIME types: image/jpeg, image/png, image/webp
-- 5. File size limit: 10 MB
--
-- Este SQL permite que solamente administradores autenticados
-- suban, reemplacen, consulten y eliminen imágenes del bucket.

drop policy if exists "Administradores leen imagenes de negocios" on storage.objects;
drop policy if exists "Administradores suben imagenes de negocios" on storage.objects;
drop policy if exists "Administradores actualizan imagenes de negocios" on storage.objects;
drop policy if exists "Administradores eliminan imagenes de negocios" on storage.objects;

create policy "Administradores leen imagenes de negocios"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'negocios-media'
  and public.es_administrador()
);

create policy "Administradores suben imagenes de negocios"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'negocios-media'
  and public.es_administrador()
);

create policy "Administradores actualizan imagenes de negocios"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'negocios-media'
  and public.es_administrador()
)
with check (
  bucket_id = 'negocios-media'
  and public.es_administrador()
);

create policy "Administradores eliminan imagenes de negocios"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'negocios-media'
  and public.es_administrador()
);
