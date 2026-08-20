-- ALIADOS FANTASMA — MATCH + NOTIFICACIONES v1 hardening
begin;
revoke all on table public.notificaciones_plataforma from anon;
revoke all on table public.notificaciones_plataforma from authenticated;
grant select, update, delete on table public.notificaciones_plataforma to authenticated;

drop policy if exists "Usuario consulta sus notificaciones" on public.notificaciones_plataforma;
create policy "Usuario consulta sus notificaciones" on public.notificaciones_plataforma
for select to authenticated
using ((usuario_id = (select auth.uid())) or (para_administracion and (select public.es_administrador())));

drop policy if exists "Usuario marca sus notificaciones" on public.notificaciones_plataforma;
create policy "Usuario marca sus notificaciones" on public.notificaciones_plataforma
for update to authenticated
using ((usuario_id = (select auth.uid())) or (para_administracion and (select public.es_administrador())))
with check ((usuario_id = (select auth.uid())) or (para_administracion and (select public.es_administrador())));

drop policy if exists "Usuario elimina sus notificaciones" on public.notificaciones_plataforma;
create policy "Usuario elimina sus notificaciones" on public.notificaciones_plataforma
for delete to authenticated
using (((usuario_id = (select auth.uid())) and ((not obligatoria) or leida)) or (para_administracion and (select public.es_administrador())));

create index if not exists notificaciones_plataforma_negocio_idx on public.notificaciones_plataforma(negocio_id) where negocio_id is not null;
create index if not exists respuestas_necesidad_respondido_por_idx on public.respuestas_necesidad(respondido_por);
commit;
