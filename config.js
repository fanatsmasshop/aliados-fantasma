export const SUPABASE_URL =
  "https://cshjnpjqvflwmtypuyvc.supabase.co";

export const SUPABASE_ANON_KEY =
  "sb_publishable_jMUH4ytBXaX-yCt-QpgRkg_16P_aaag";
  
export const isConfigured = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("PEGA_AQUI") && SUPABASE_ANON_KEY.length > 30 && !SUPABASE_ANON_KEY.includes("PEGA_AQUI");
