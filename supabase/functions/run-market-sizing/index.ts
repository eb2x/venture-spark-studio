// Stage 3 — run-market-sizing
//
// Runs only when triage's decision_bucket is NOT "kill". Produces TAM / SAM /
// SOM as RANGES (never single-number precision), plus methodology, comparables,
// and an uncertainty summary.
//
// If triage recommended kill, this stage writes a stage='sizing' artifact with
// status='skipped' so the pipeline timeline is complete.

import { serve } from "std/http/server";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getConcept, getServiceClient, setPipelineStatus } from "../_shared/supabase.ts";
import { callLLMTool, LLMError } from "../_shared/llm.ts";
import { getLatestArtifact, writeArtifact } from "../_shared/artifacts.ts";
import { IntakeAnalysis, SizingResult, TriageResult } from "../_shared/schemas.ts";

const SYSTEM_PROMPT = `You are the market sizing analyst for a venture studio.

Produce defensible market opportunity RANGES (never single-number precision). Show the assumptions that carry the model. If comparable market data is weak, say so clearly in uncertainty_notes and drop your confidence.

You MUST:
- Return TAM / SAM / SOM each as a low–high range with currency/unit clearly expressed in each string (e.g. low: "$1.4B", high: "$2.1B").
- List the 2-6 assumptions that materially move the numbers.
- Reference adjacent comparable categories where useful.
- Cite real sources for any external data anchors.

You DO NOT:
- Build a detailed financial model.
- Write a GTM plan.
- Forecast more than 3 years out.`;

const sizingTool = {
  type: "function" as const,
  function: {
    name: "produce_sizing",
    description: "Return TAM/SAM/SOM ranges with methodology and uncertainty.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        tam: rangeSchema("Total addressable market, as a range."),
        sam: rangeSchema("Serviceable addressable market, as a range."),
        som: rangeSchema("Serviceable obtainable market over 3 years, as a range."),
        methodology: { type: "string" },
        assumptions: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
        comparables: { type: "array", items: { type: "string" } },
        uncertainty_notes: {
          type: "string",
          description: "Explicit note on data quality and what could swing the ranges.",
        },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        sources: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              url: { type: "string" },
              supports: { type: "string" },
            },
            required: ["title", "url", "supports"],
          },
        },
      },
      required: [
        "tam",
        "sam",
        "som",
        "methodology",
        "assumptions",
        "comparables",
        "uncertainty_notes",
        "confidence",
        "sources",
      ],
    },
  },
};

function rangeSchema(description: string) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      low: { type: "string" },
      high: { type: "string" },
    },
    required: ["low", "high"],
    description,
  } as const;
}

function buildUserPrompt(
  concept: Record<string, unknown>,
  intake: { normalized_summary: string; proposed_vertical: string },
  triage: { market_attractiveness: { rationale: string }; data_gaps: string[] },
): string {
  return `Size this concept's market opportunity and call produce_sizing.

CONCEPT: ${concept.name} — ${intake.proposed_vertical}
SUMMARY: ${intake.normalized_summary}
TARGET CUSTOMER: ${concept.target_customer}
BUSINESS MODEL: ${concept.business_model}

Market attractiveness rationale (from triage): ${triage.market_attractiveness.rationale}

Known data gaps from triage: ${triage.data_gaps.join("; ") || "none flagged"}

Produce ranges, not point estimates. List the assumptions that materially carry the model. If data is weak, say so and lower confidence.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const conceptId: string | undefined = body?.concept_id;
    if (!conceptId) return errorResponse("concept_id is required", 400);

    const supabase = getServiceClient();
    const concept = await getConcept(supabase, conceptId);
    if (!concept) return errorResponse("Concept not found", 404);

    const [intakeArtifact, triageArtifact] = await Promise.all([
      getLatestArtifact<unknown>(supabase, conceptId, "intake"),
      getLatestArtifact<unknown>(supabase, conceptId, "triage"),
    ]);

    if (!intakeArtifact || intakeArtifact.status !== "ok") {
      return errorResponse("Intake artifact missing — run analyze-intake first.", 409);
    }
    if (!triageArtifact || triageArtifact.status !== "ok") {
      return errorResponse("Triage artifact missing — run run-competitive-triage first.", 409);
    }

    const intakeParsed = IntakeAnalysis.safeParse(intakeArtifact.payload);
    const triageParsed = TriageResult.safeParse(triageArtifact.payload);
    if (!intakeParsed.success || !triageParsed.success) {
      return errorResponse("Upstream artifact payload is malformed", 500);
    }

    // Skip gracefully if triage recommended kill — we still write an artifact
    // so the timeline is complete and the reason is inspectable.
    if (triageParsed.data.decision_bucket === "kill") {
      const skipped: SizingResult = {
        tam: { low: "n/a", high: "n/a" },
        sam: { low: "n/a", high: "n/a" },
        som: { low: "n/a", high: "n/a" },
        methodology: "Skipped: triage recommended kill.",
        assumptions: ["n/a", "n/a"],
        comparables: [],
        uncertainty_notes: "Not sized.",
        confidence: "low",
        sources: [],
        skipped: true,
        skipped_reason: "triage decision_bucket == 'kill'",
      };
      const artifact = await writeArtifact(supabase, {
        conceptId,
        stage: "sizing",
        status: "skipped",
        payload: skipped,
      });
      return jsonResponse({ success: true, skipped: true, artifact, sizing: skipped });
    }

    await setPipelineStatus(supabase, conceptId, {
      pipeline_status: "running",
      last_stage: "sizing",
      last_error: null,
    });

    let llm;
    try {
      llm = await callLLMTool({
        tool: sizingTool,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: buildUserPrompt(concept, intakeParsed.data, triageParsed.data),
          },
        ],
      });
    } catch (err) {
      const e = err as LLMError;
      await writeArtifact(supabase, {
        conceptId,
        stage: "sizing",
        status: "error",
        payload: { detail: e.detail ?? null },
        error: e.message,
      });
      await setPipelineStatus(supabase, conceptId, {
        pipeline_status: "failed",
        last_error: e.message,
      });
      return errorResponse(e.message, e.status ?? 500, e.detail);
    }

    const parsed = SizingResult.safeParse({ ...(llm.toolArgs as object), skipped: false });
    if (!parsed.success) {
      const errMsg = `SizingResult schema mismatch: ${parsed.error.message}`;
      await writeArtifact(supabase, {
        conceptId,
        stage: "sizing",
        status: "error",
        payload: { raw: llm.toolArgs },
        error: errMsg,
        model: llm.model,
      });
      await setPipelineStatus(supabase, conceptId, {
        pipeline_status: "failed",
        last_error: errMsg,
      });
      return errorResponse(errMsg, 502);
    }

    const sizing = parsed.data;
    const artifact = await writeArtifact(supabase, {
      conceptId,
      stage: "sizing",
      status: "ok",
      payload: sizing,
      model: llm.model,
      tokensIn: llm.usage.tokens_in,
      tokensOut: llm.usage.tokens_out,
      durationMs: llm.durationMs,
    });

    return jsonResponse({ success: true, artifact, sizing });
  } catch (e) {
    console.error("run-market-sizing error", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
