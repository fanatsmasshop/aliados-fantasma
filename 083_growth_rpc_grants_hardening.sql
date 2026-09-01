-- Aliados Fantasma · hardening de RPC de crecimiento · YA APLICADO 2026-08-31
revoke execute on function public.af_growth_summary(integer) from anon;
revoke execute on function public.af_oportunidades_para_negocio(uuid) from anon;
revoke execute on function public.af_responder_y_contactar(uuid,uuid,numeric,text,text) from anon;
