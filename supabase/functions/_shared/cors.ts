// Shared CORS headers for all edge functions. Keep in sync with Supabase client
// allowed request headers.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, " +
    "x-supabase-client-platform, x-supabase-client-platform-version, " +
    "x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
} as const;

export const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
} as const;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

export function errorResponse(message: string, status = 500, detail?: unknown): Response {
  return jsonResponse(
    detail === undefined ? { error: message } : { error: message, detail },
    status,
  );
}
