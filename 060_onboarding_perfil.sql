-- ALIADOS FANTASMA — SPRINT 3 · ONBOARDING DEL NEGOCIO
-- Ejecuta este archivo completo en Supabase > SQL Editor.

begin;

create table if not exists public.perfiles_borrador (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  datos jsonb not null default '{}'::jsonb,
  estado text not null default 'borrador' check (estado in ('borrador','en_revision','cambios_solicitados','aprobado','publicado')),
  porcentaje integer not null default 0 check (porcentaje between 0 and 100),
  enviado_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.perfiles_borrador enable row level security;

drop policy if exists "Usuarios consultan su borrador" on public.perfiles_borrador;
create policy "Usuarios consultan su borrador" on public.perfiles_borrador
for select to authenticated using (usuario_id = auth.uid() or public.es_administrador());

drop policy if exists "Usuarios crean su borrador" on public.perfiles_borrador;
create policy "Usuarios crean su borrador" on public.perfiles_borrador
for insert to authenticated with check (usuario_id = auth.uid());

drop policy if exists "Usuarios actualizan su borrador" on public.perfiles_borrador;
create policy "Usuarios actualizan su borrador" on public.perfiles_borrador
for update to authenticated using (usuario_id = auth.uid() or public.es_administrador())
with check (usuario_id = auth.uid() or public.es_administrador());

-- Permite a cada propietario subir imágenes dentro de su propia carpeta: UID/archivo.webp
-- El bucket negocios-media debe existir y ser público.
drop policy if exists "Propietarios leen sus imagenes" on storage.objects;
create policy "Propietarios leen sus imagenes" on storage.objects
for select to authenticated using (bucket_id='negocios-media');

drop policy if exists "Propietarios suben sus imagenes" on storage.objects;
create policy "Propietarios suben sus imagenes" on storage.objects
for insert to authenticated with check (
  bucket_id='negocios-media' and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Propietarios actualizan sus imagenes" on storage.objects;
create policy "Propietarios actualizan sus imagenes" on storage.objects
for update to authenticated using (
  bucket_id='negocios-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.es_administrador())
) with check (
  bucket_id='negocios-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.es_administrador())
);

drop policy if exists "Propietarios eliminan sus imagenes" on storage.objects;
create policy "Propietarios eliminan sus imagenes" on storage.objects
for delete to authenticated using (
  bucket_id='negocios-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.es_administrador())
);

commit;
