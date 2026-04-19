// Stage 1 — analyze-intake
//
// Inspects the raw 8-field concept the partner submitted. Produces:
//   • normalized_summary (concept restated cleanly)
//   • proposed_vertical classification
//   • ambiguity_flags + clarification_prompts for weak inputs
//   • readiness state: ready_for_triage | needs_clarification | insufficiently_specified
//   • separation of user_provided facts vs. inferred framing
//
// Writes one pipeline_artifacts row with stage='intake'. If readiness is
// anything other than `ready_for_triage`, the orchestrator stops and the
// concept moves to `pipeline_status = 'needs_clarification'`.

import { serve } from "std/http/server";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getConcept, getServiceClient, setPipelineStatus } from "../_shared/supabase.ts";
import { callLLMTool, LLMError } from "../_shared/llm.ts";
import { writeArtifact } from "../_shared/artifacts.ts";
import { IntakeAnalysis } from "../_shared/schemas.ts";

const SYSTEM_PROMPT = `You are the intake analyst for a venture studio concept evaluation pipeline.

Your job is narrow: inspect a venture concept submitted by a studio partner and decide whether it is ready for competitive triage, or whether the partner needs to clarify something first.

You MUST:
- Separate user-provided facts from your own inferences.
- Flag ambiguity bluntly. Do not hallucinate specificity the partner did not provide.
- Propose a best-fit vertical (e.g. "B2B SaaS · RevOps", "B2B SaaS · Construction Tech", "Marketplace · Logistics").
- Produce clarification_prompts ONLY when you are marking the concept as needs_clarification or insufficiently_specified.

Scope: B2B SaaS is primary. Marketplaces are acceptable if the data coverage will clearly be sufficient. Hardware, biotech, and deep-research concepts must be marked insufficiently_specified with a clarification_prompt explaining the scope limit.

Readiness rubric:
- ready_for_triage: all 8 intake fields are specific enough to run competitive and sizing analysis against.
- needs_clarification: 1–3 fields are meaningfully vague (e.g. "SMBs" as target customer, "AI" as the why_now). List exactly what to fix.
- insufficiently_specified: the concept is too thin or out-of-scope for this pipeline.`;

const intakeTool = {
  type: "function" as const,
  function: {
    name: "analyze_intake",
    description: "Return a structured intake analysis for a venture concept.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        normalized_summary: {
          type: "string",
          description: "2-3 sentence restatement of the concept in clean, neutral language.",
        },
        proposed_vertical: {
          type: "string",
          description: "Best-fit vertical in 'Category · Subcategory' format.",
        },
        ambiguity_flags: {
          type: "array",
          items: { type: "string" },
          description: "Short bullets naming vague or weakly-specified parts of the intake.",
        },
        clarification_prompts: {
          type: "array",
          items: { type: "string" },
          description:
            "Specific questions the partner should answer before triage runs. Empty if readiness is ready_for_triage.",
        },
        readiness: {
          type: "string",
          enum: ["ready_for_triage", "needs_clarification", "insufficiently_specified"],
        },
        user_provided: {
          type: "array",
          items: { type: "string" },
          description: "Discrete facts the partner explicitly stated.",
        },
        inferred: {
          type: "array",
          items: { type: "string" },
          description: "Inferences you made from context (must be labeled as such in the memo).",
        },
      },
      required: [
        "normalized_summary",
        "proposed_vertical",
        "ambiguity_flags",
        "clarification_prompts",
        "readiness",
        "user_provided",
        "inferred",
      ],
    },
  },
};

function buildUserPrompt(c: Record<string, unknown>): string {
  return `Analyze this venture concept intake and call analyze_intake.

CONCEPT NAME: ${c.name}
DESCRIPTION: ${c.description}
TARGET CUSTOMER: ${c.target_customer}
BUYER / USER: ${c.buyer_user}
BUSINESS MODEL: ${c.business_model}
PROBLEM: ${c.problem}
WHY NOW: ${c.why_now}
CURRENT ALTERNATIVES: ${c.alternatives}`;
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

    await setPipelineStatus(supabase, conceptId, {
      pipeline_status: "running",
      last_stage: "intake",
      last_error: null,
    });

    let llm;
    try {
      llm = await callLLMTool({
        tool: intakeTool,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(concept) },
        ],
      });
    } catch (err) {
      const e = err as LLMError;
      await writeArtifact(supabase, {
        conceptId,
        stage: "intake",
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

    const parsed = IntakeAnalysis.safeParse(llm.toolArgs);
    if (!parsed.success) {
      const errMsg = `IntakeAnalysis schema mismatch: ${parsed.error.message}`;
      await writeArtifact(supabase, {
        conceptId,
        stage: "intake",
        status: "error",
        payload: { raw: llm.toolArgs },
        error: errMsg,
        model: llm.model,
        durationMs: llm.durationMs,
      });
      await setPipelineStatus(supabase, conceptId, {
        pipeline_status: "failed",
        last_error: errMsg,
      });
      return errorResponse(errMsg, 502);
    }

    const analysis = parsed.data;
    const artifact = await writeArtifact(supabase, {
      conceptId,
      stage: "intake",
      status: "ok",
      payload: analysis,
      model: llm.model,
      tokensIn: llm.usage.tokens_in,
      tokensOut: llm.usage.tokens_out,
      durationMs: llm.durationMs,
    });

    // Mirror a couple of fields onto the concept row for list-view UI.
    await supabase
      .from("concepts")
      .update({
        vertical: analysis.proposed_vertical,
        status:
          analysis.readiness === "ready_for_triage"
            ? "ready_for_triage"
            : "needs_clarification",
      })
      .eq("id", conceptId);

    if (analysis.readiness !== "ready_for_triage") {
      await setPipelineStatus(supabase, conceptId, {
        pipeline_status: "needs_clarification",
      });
    }

    return jsonResponse({
      success: true,
      artifact,
      analysis,
    });
  } catch (e) {
    console.error("analyze-intake error", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
