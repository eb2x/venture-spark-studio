// Stage 2 — run-competitive-triage
//
// Reads the latest intake artifact, then produces a first-pass competitive map
// and a kill/investigate/validate recommendation. This is the gate that
// decides whether market sizing is worth running at all.
//
// Writes one pipeline_artifacts row with stage='triage'. Mirrors decision
// fields onto the concept row for list-view UI.

import { serve } from "std/http/server";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getConcept, getServiceClient, setPipelineStatus } from "../_shared/supabase.ts";
import { callLLMTool, LLMError } from "../_shared/llm.ts";
import { getLatestArtifact, writeArtifact } from "../_shared/artifacts.ts";
import { IntakeAnalysis, TriageResult } from "../_shared/schemas.ts";

const SYSTEM_PROMPT = `You are the competitive triage analyst for a venture studio.

Produce a source-backed first-pass view of a concept's market so partners can make a fast kill / investigate / validate decision without deep research investment.

You MUST:
- Name 6–20 real, identifiable competitors — not "Company A". If you cannot name specific companies, mark the market_attractiveness rationale with that as a data gap.
- Segment the competitive landscape (platform, point tool, adjacent, etc).
- Propose 2–6 concrete whitespace hypotheses.
- Give an honest decision_bucket and confidence — prefer "investigate" + medium confidence to overclaiming.
- Cite sources with real URLs when you reference market claims. If you cannot, note the data gap explicitly.

You DO NOT:
- Score founders, teams, or studio fit.
- Assess patents.
- Produce opaque composite scores.
- Cover hardware, biotech, or deep-research categories.

Bands (market_attractiveness, competitive_crowding) are low/medium/high. Use them consistently so concepts are comparable quarter-over-quarter.`;

const triageTool = {
  type: "function" as const,
  function: {
    name: "produce_triage",
    description: "Return the structured competitive triage.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        competitors: {
          type: "array",
          minItems: 6,
          maxItems: 20,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              segment: { type: "string" },
              positioning: { type: "string" },
              note: { type: "string" },
            },
            required: ["name", "segment", "positioning", "note"],
          },
        },
        whitespace: {
          type: "array",
          minItems: 2,
          maxItems: 6,
          items: { type: "string" },
        },
        decision_bucket: { type: "string", enum: ["kill", "investigate", "validate"] },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        market_attractiveness: {
          type: "object",
          additionalProperties: false,
          properties: {
            band: { type: "string", enum: ["low", "medium", "high"] },
            rationale: { type: "string" },
          },
          required: ["band", "rationale"],
        },
        competitive_crowding: {
          type: "object",
          additionalProperties: false,
          properties: {
            band: { type: "string", enum: ["low", "medium", "high"] },
            rationale: { type: "string" },
          },
          required: ["band", "rationale"],
        },
        data_gaps: {
          type: "array",
          items: { type: "string" },
          description: "Explicit gaps the partner should know about.",
        },
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
        "competitors",
        "whitespace",
        "decision_bucket",
        "confidence",
        "market_attractiveness",
        "competitive_crowding",
        "data_gaps",
        "sources",
      ],
    },
  },
};

function buildUserPrompt(
  concept: Record<string, unknown>,
  intake: { normalized_summary: string; proposed_vertical: string },
): string {
  return `Run competitive triage for this concept and call produce_triage.

NORMALIZED SUMMARY (from intake):
${intake.normalized_summary}

PROPOSED VERTICAL: ${intake.proposed_vertical}

ORIGINAL INTAKE FIELDS:
- Concept: ${concept.name}
- Target customer: ${concept.target_customer}
- Buyer/user: ${concept.buyer_user}
- Business model: ${concept.business_model}
- Problem: ${concept.problem}
- Why now: ${concept.why_now}
- Current alternatives: ${concept.alternatives}

Produce the triage. Use real, named competitors. List explicit data gaps rather than inventing precision.`;
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

    const intakeArtifact = await getLatestArtifact<unknown>(supabase, conceptId, "intake");
    if (!intakeArtifact || intakeArtifact.status !== "ok") {
      return errorResponse(
        "No successful intake artifact — run analyze-intake first.",
        409,
      );
    }
    const intakeParsed = IntakeAnalysis.safeParse(intakeArtifact.payload);
    if (!intakeParsed.success) {
      return errorResponse("Intake artifact payload is malformed", 500);
    }
    if (intakeParsed.data.readiness !== "ready_for_triage") {
      return errorResponse(
        `Intake readiness is '${intakeParsed.data.readiness}' — triage refuses to run until the concept is ready_for_triage.`,
        409,
      );
    }

    await setPipelineStatus(supabase, conceptId, {
      pipeline_status: "running",
      last_stage: "triage",
      last_error: null,
    });

    let llm;
    try {
      llm = await callLLMTool({
        tool: triageTool,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(concept, intakeParsed.data) },
        ],
      });
    } catch (err) {
      const e = err as LLMError;
      await writeArtifact(supabase, {
        conceptId,
        stage: "triage",
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

    const parsed = TriageResult.safeParse(llm.toolArgs);
    if (!parsed.success) {
      const errMsg = `TriageResult schema mismatch: ${parsed.error.message}`;
      await writeArtifact(supabase, {
        conceptId,
        stage: "triage",
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

    const triage = parsed.data;
    const artifact = await writeArtifact(supabase, {
      conceptId,
      stage: "triage",
      status: "ok",
      payload: triage,
      model: llm.model,
      tokensIn: llm.usage.tokens_in,
      tokensOut: llm.usage.tokens_out,
      durationMs: llm.durationMs,
    });

    await supabase
      .from("concepts")
      .update({
        bucket: triage.decision_bucket,
        confidence: triage.confidence,
        market_attractiveness: triage.market_attractiveness.band,
        competitive_crowding: triage.competitive_crowding.band,
      })
      .eq("id", conceptId);

    return jsonResponse({ success: true, artifact, triage });
  } catch (e) {
    console.error("run-competitive-triage error", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
