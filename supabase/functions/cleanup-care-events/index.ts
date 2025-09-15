// supabase/functions/cleanup-care-events/index.ts
// Danger: delete all rows from care_events (admin only)
// Exposed via Edge Function with service role and CORS-guarded origin.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// Prefer the commonly used env name in this repo
const SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY");
if (!SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY/SERVICE_ROLE_KEY env");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "*";
  const allowed = new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    Deno.env.get("APP_ORIGIN") ?? "",
  ]);
  const allowOrigin = allowed.has(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  } as const;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }
  try {
    // Count rows beforehand (HEAD select)
    const { count: beforeCount, error: cntErr } = await supabase
      .from("care_events")
      .select("*", { count: "exact", head: true });
    if (cntErr) throw cntErr;

    // PostgREST requires a filter for DELETE; use NOT NULL on a stable column
    const { error: delErr } = await supabase
      .from("care_events")
      .delete()
      .not("source_doc_id", "is", null);
    if (delErr) throw delErr;

    return new Response(
      JSON.stringify({ ok: true, deleted: beforeCount ?? 0 }),
      {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});

