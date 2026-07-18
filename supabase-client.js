import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const config=window.ALIA_CONFIG;if(!config?.supabaseUrl||!config?.supabaseAnonKey||config.supabaseUrl.includes("TU-PROYECTO"))throw new Error("Falta configurar supabase-config.js");export const supabase=createClient(config.supabaseUrl,config.supabaseAnonKey);
