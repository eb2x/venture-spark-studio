// Service-role Supabase client factory for edge functions.
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export async function getConcept(
  supabase: SupabaseClient,
  conceptId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("concepts")
    .select("*")
    .eq("id", conceptId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function setPipelineStatus(
  supabase: SupabaseClient,
  conceptId: string,
  fields: {
    pipeline_status?: string;
    last_stage?: string;
    last_error?: string | null;
    status?: string;
  },
): Promise<void> {
  const { error } = await supabase.from("concepts").update(fields).eq("id", conceptId);
  if (error) throw error;
}
