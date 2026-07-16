export const SUPABASE_URL = "PEGA_AQUI_TU_SUPABASE_URL";
export const SUPABASE_ANON_KEY = "PEGA_AQUI_TU_PUBLISHABLE_KEY";
export const isConfigured = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("PEGA_AQUI") && SUPABASE_ANON_KEY.length > 30 && !SUPABASE_ANON_KEY.includes("PEGA_AQUI");
