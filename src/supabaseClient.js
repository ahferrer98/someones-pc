import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

if (!supabaseConfigured) {
  console.error(
    "Missing Supabase env vars — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env (copy .env.example)."
  );
}

// Only construct the real client when configured — createClient throws
// synchronously on a missing URL, which would otherwise crash the whole app
// before it can render a helpful message.
export const supabase = supabaseConfigured ? createClient(url, anonKey) : null;
