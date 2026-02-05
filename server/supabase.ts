import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;

if (!url || !anon) {
  console.warn("Supabase public env vars are not set. Some features may not work.");
}

export const supabase = url && anon ? createClient(url, anon) : undefined;
export const supabaseService = url && service ? createClient(url, service, {
  auth: { persistSession: false },
}) : undefined;
