// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are Lattice, a venture studio analyst. You produce decision-ready evaluation memos for venture concepts.

You MUST be:
- Source-grounded. Every factual claim should be supported by a citable source.
- Honest about uncertainty. Prefer ranges over point estimates. Lower confidence rather than overclaim.
- Structured. Always return the JSON tool call with the exact schema requested.
- Distinguish user-provided facts from your own inferences and synthesis.

You DO NOT:
- Score founders, teams, or studio fit.
- Provide opaque composite scores.
- Make automated investment decisions.
- Cover hardware, biotech, or deep research categories.

Scope: B2B SaaS primary. Marketplace where data permits.`;

const memoTool = {
  type: "function",
  function: {
    name: "produce_memo",
    description: "Produce a structured venture concept evaluation memo.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        vertical: { type: "string", description: "Best-fit vertical, e.g. 'B2B SaaS · RevOps'" },
        one_liner: { type: "string", description: "One-sentence positioning of the concept." },
        summary: { type: "string", description: "2-4 sentence concept summary the partner can paste in a memo." },
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
        market_sizing: {
          type: "object",
          additionalProperties: false,
          properties: {
            tam: { type: "string", description: "Range, not point. e.g. '$1.4B – $2.1B'" },
            sam: { type: "string" },
            som: { type: "string", description: "3-year SOM range" },
            methodology: { type: "string" },
            assumptions: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
          },
          required: ["tam", "sam", "som", "methodology", "assumptions", "confidence"],
        },
        risks: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
        unknowns: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
        recommendation: { type: "string", enum: ["kill", "investigate", "validate"] },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        next_steps: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
        sources: {
          type: "array",
          minItems: 2,
          maxItems: 8,
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
        unsupported_claims: {
          type: "array",
          items: { type: "string" },
          description: "Claims you couldn't fully support — flag them honestly.",
        },
      },
      required: [
        "vertical",
        "one_liner",
        "summary",
        "market_attractiveness",
        "competitive_crowding",
        "competitors",
        "whitespace",
        "market_sizing",
        "risks",
        "unknowns",
        "recommendation",
        "confidence",
        "next_steps",
        "sources",
        "unsupported_claims",
      ],
    },
  },
};

interface ConceptInput {
  name: string;
  description: string;
  target_customer: string;
  problem: string;
  buyer_user: string;
  business_model: string;
  why_now: string;
  alternatives: string;
}

function buildUserPrompt(c: ConceptInput) {
  return `Evaluate this venture concept and return the produce_memo tool call.

CONCEPT NAME: ${c.name}

DESCRIPTION:
${c.description}

TARGET CUSTOMER: ${c.target_customer}
BUYER / USER: ${c.buyer_user}
BUSINESS MODEL: ${c.business_model}

PROBLEM:
${c.problem}

WHY NOW:
${c.why_now}

CURRENT ALTERNATIVES:
${c.alternatives}

Produce a complete, source-backed evaluation memo. Use ranges for sizing. If you cannot support a claim, list it under unsupported_claims rather than presenting it as fact. Cite real, well-known sources where possible.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const conceptId: string | undefined = body?.concept_id;
    if (!conceptId || typeof conceptId !== "string") {
      return new Response(JSON.stringify({ error: "concept_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: concept, error: cErr } = await supabase
      .from("concepts")
      .select("*")
      .eq("id", conceptId)
      .maybeSingle();
    if (cErr || !concept) {
      return new Response(JSON.stringify({ error: "Concept not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("concepts").update({ status: "analyzing" }).eq("id", conceptId);

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(concept) },
        ],
        tools: [memoTool],
        tool_choice: { type: "function", function: { name: "produce_memo" } },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error("AI gateway error", aiRes.status, txt);
      await supabase.from("concepts").update({ status: "intake" }).eq("id", conceptId);
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({
            error: "Lovable AI credits exhausted. Add funds in Settings → Workspace → Usage.",
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "AI gateway error", detail: txt }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("No tool call in AI response", JSON.stringify(aiJson).slice(0, 800));
      await supabase.from("concepts").update({ status: "intake" }).eq("id", conceptId);
      return new Response(JSON.stringify({ error: "Model did not return a structured memo" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let memo: any;
    try {
      memo = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Could not parse tool call args", e);
      await supabase.from("concepts").update({ status: "intake" }).eq("id", conceptId);
      return new Response(JSON.stringify({ error: "Malformed memo payload" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Persist memo + concept band/bucket fields
    const { error: memoErr } = await supabase.from("memos").upsert(
      {
        concept_id: conceptId,
        payload: memo,
      },
      { onConflict: "concept_id" },
    );
    if (memoErr) {
      console.error("Memo upsert error", memoErr);
      await supabase.from("concepts").update({ status: "intake" }).eq("id", conceptId);
      return new Response(JSON.stringify({ error: "Failed to save memo" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("concepts")
      .update({
        status: "memo_ready",
        bucket: memo.recommendation,
        confidence: memo.confidence,
        market_attractiveness: memo.market_attractiveness?.band,
        competitive_crowding: memo.competitive_crowding?.band,
        vertical: memo.vertical,
        one_liner: memo.one_liner,
      })
      .eq("id", conceptId);

    return new Response(JSON.stringify({ success: true, memo }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-memo error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
