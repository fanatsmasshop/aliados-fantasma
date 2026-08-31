import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from "./config.js?v=20260717-2";

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

// HOTFIX 2026-08-31:
// La capa de estabilidad existía como archivo, pero no estaba garantizado que
// las páginas la cargaran. La importamos aquí porque este módulo es transversal
// a login, home, oportunidades, "lo necesito" y buena parte del panel.
// El archivo es idempotente, así que si otra página ya lo carga no se duplica.
if (typeof window !== "undefined") {
  import("./af-ui-stability.js?v=20260831-HOTFIX1").catch((error) => {
    console.warn("[Aliados] No se pudo cargar af-ui-stability.js", error);
  });
}
