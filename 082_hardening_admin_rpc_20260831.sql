-- YA APLICADO en producción. Reduce superficie anónima de RPC administrativas.
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'admin\_%' escape '\' loop
    execute format('revoke execute on function %s from anon',r.sig);
  end loop;
end $$;
revoke execute on function public.purgar_negocios_eliminados() from anon;
