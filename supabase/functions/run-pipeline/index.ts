// Orchestrator — run-pipeline
//
// Chains the 5 stages server-side. Frontend calls this once per concept for
// end-to-end runs. Individual stages remain callable on their own so a single
// failing stage can be rerun without redoing prior work.
//
// Short-circuit rules:
//   • intake.readiness != ready_for_triage  → stop, return needs_clarification
//   • triage.decision_bucket == "kill"      → sizing is auto-skipped, memo + verification still run
//   • any stage errors                       → stop, return error (artifact is already written)

import { serve } from "std/http/server";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient, setPipelineStatus } from "../_shared/supabase.ts";

type StageName =
  | "analyze-intake"
  | "run-competitive-triage"
  | "run-market-sizing"
  | "synthesize-memo"
  | "verify-claims";

const STAGES: StageName[] = [
  "analyze-intake",
  "run-competitive-triage",
  "run-market-sizing",
  "synthesize-memo",
  "verify-claims",
];

async function invokeStage(
  stage: StageName,
  conceptId: string,
  authHeader: string | null,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  const url = `${baseUrl}/functions/v1/${stage}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Forward the caller's auth (anon key is fine) so internal invocation works.
      ...(authHeader ? { Authorization: authHeader } : {}),
      // Service-role fallback for internal orchestration.
      apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    },
    body: JSON.stringify({ concept_id: conceptId }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const conceptId: string | undefined = body?.concept_id;
    if (!conceptId) return errorResponse("concept_id is required", 400);

    const authHeader = req.headers.get("Authorization");
    const supabase = getServiceClient();
    const results: Record<string, unknown> = {};

    await setPipelineStatus(supabase, conceptId, {
      pipeline_status: "running",
      last_error: null,
    });

    // Stage 1: intake
    const intake = await invokeStage("analyze-intake", conceptId, authHeader);
    results["analyze-intake"] = intake.data;
    if (!intake.ok) {
      return jsonResponse(
        { success: false, failed_at: "analyze-intake", results },
        intake.status,
      );
    }
    const readiness =
      (intake.data as { analysis?: { readiness?: string } }).analysis?.readiness ?? null;
    if (readiness !== "ready_for_triage") {
      await setPipelineStatus(supabase, conceptId, {
        pipeline_status: "needs_clarification",
      });
      return jsonResponse({
        success: false,
        stopped_at: "analyze-intake",
        reason: "readiness != ready_for_triage",
        readiness,
        results,
      });
    }

    // Stage 2: triage
    const triage = await invokeStage("run-competitive-triage", conceptId, authHeader);
    results["run-competitive-triage"] = triage.data;
    if (!triage.ok) {
      return jsonResponse(
        { success: false, failed_at: "run-competitive-triage", results },
        triage.status,
      );
    }

    // Stage 3: sizing (auto-skips on kill)
    const sizing = await invokeStage("run-market-sizing", conceptId, authHeader);
    results["run-market-sizing"] = sizing.data;
    if (!sizing.ok) {
      return jsonResponse(
        { success: false, failed_at: "run-market-sizing", results },
        sizing.status,
      );
    }

    // Stage 4: synthesize memo
    const memo = await invokeStage("synthesize-memo", conceptId, authHeader);
    results["synthesize-memo"] = memo.data;
    if (!memo.ok) {
      return jsonResponse(
        { success: false, failed_at: "synthesize-memo", results },
        memo.status,
      );
    }

    // Stage 5: verify claims
    const verify = await invokeStage("verify-claims", conceptId, authHeader);
    results["verify-claims"] = verify.data;
    if (!verify.ok) {
      return jsonResponse(
        { success: false, failed_at: "verify-claims", results },
        verify.status,
      );
    }

    await setPipelineStatus(supabase, conceptId, {
      pipeline_status: "ready",
      last_stage: "verification",
      last_error: null,
    });

    // Return final memo + the full per-stage log.
    return jsonResponse({
      success: true,
      stages: STAGES,
      results,
      memo: (verify.data as { memo?: unknown }).memo,
    });
  } catch (e) {
    console.error("run-pipeline error", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
