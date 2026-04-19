// Sample concepts used in the marketing/landing demo.
//
// Domain types (Concept, Memo, Evidence, Band, Confidence, DecisionBucket, etc.)
// now live in @shared/schemas — the single source of truth shared between the
// frontend and Supabase edge functions. This file only holds the legacy
// camelCase view types used by the demo components, plus the static samples.

import type { Band, Confidence, DecisionBucket } from "@shared/schemas";

export type { Band, Confidence, DecisionBucket };

export interface Source {
  title: string;
  url: string;
  supports: string;
}

export interface Competitor {
  name: string;
  segment: string;
  positioning: string;
  note: string;
}

/**
 * Legacy camelCase Concept view used by UI components. The DB/edge-function
 * shape is snake_case (see @shared/schemas ConceptInput). Mapping between the
 * two happens in src/lib/api.ts.
 */
export interface Concept {
  id: string;
  name: string;
  vertical: string;
  oneLiner: string;
  targetCustomer: string;
  problem: string;
  buyerUser: string;
  businessModel: string;
  whyNow: string;
  alternatives: string;
  createdAt: string;
  status: "ready" | "needs_clarification" | "memo_ready";
  bucket?: DecisionBucket;
  confidence?: Confidence;
  marketAttractiveness?: Band;
  competitiveCrowding?: Band;
}

/**
 * Legacy camelCase Memo view used by UI components. The canonical snake_case
 * shape lives in @shared/schemas.Memo.
 */
export interface Memo {
  conceptId: string;
  summary: string;
  marketAttractiveness: { band: Band; rationale: string };
  competitiveCrowding: { band: Band; rationale: string };
  competitors: Competitor[];
  whitespace: string[];
  marketSizing: {
    tam: string;
    sam: string;
    som: string;
    methodology: string;
    assumptions: string[];
    confidence: Confidence;
  };
  risks: string[];
  unknowns: string[];
  recommendation: DecisionBucket;
  confidence: Confidence;
  nextSteps: string[];
  sources: Source[];
  unsupportedClaims: string[];
  /** Verification metadata set by verify-claims. Null until verification runs. */
  verification?: {
    ranAt: string;
    urlChecksTotal: number;
    urlChecksFailed: number;
    unsupportedClaimsAdded: number;
    confidenceDowngraded: boolean;
    originalConfidence: Confidence | null;
  } | null;
}

export const sampleConcepts: Concept[] = [
  {
    id: "c-001",
    name: "Northwind",
    vertical: "B2B SaaS · RevOps",
    oneLiner: "AI agent that reconciles pipeline forecasts against billing data for mid-market SaaS.",
    targetCustomer: "VP RevOps at $20M–$200M ARR SaaS companies",
    problem: "Forecast vs. billing variance is reconciled manually each quarter, taking 40+ hours and arriving too late to act on.",
    buyerUser: "VP RevOps (buyer), RevOps analysts (user)",
    businessModel: "SaaS, $30k–$80k ACV per company",
    whyNow: "Salesforce + Stripe API maturity + LLM tool-use makes structured reconciliation tractable.",
    alternatives: "Spreadsheets, Clari add-ons, internal data team",
    createdAt: "2025-04-12",
    status: "memo_ready",
    bucket: "investigate",
    confidence: "medium",
    marketAttractiveness: "medium",
    competitiveCrowding: "high",
  },
  {
    id: "c-002",
    name: "Quarry",
    vertical: "B2B SaaS · Construction Tech",
    oneLiner: "Submittal log automation for mid-size general contractors.",
    targetCustomer: "Project managers at GCs doing $50M–$500M in annual volume",
    problem: "Submittal logs are managed in Procore + email + Excel, with 15–25% rework rates on tracking errors.",
    buyerUser: "VP Operations (buyer), PMs (user)",
    businessModel: "SaaS per-seat + per-project, ~$25k ACV",
    whyNow: "Procore API openness + labor shortage forcing tooling adoption.",
    alternatives: "Procore native, Bluebeam, manual logs",
    createdAt: "2025-04-09",
    status: "memo_ready",
    bucket: "validate",
    confidence: "high",
    marketAttractiveness: "high",
    competitiveCrowding: "low",
  },
  {
    id: "c-003",
    name: "Halide",
    vertical: "B2B SaaS · DevTools",
    oneLiner: "On-call rotation copilot that drafts incident comms.",
    targetCustomer: "SRE leads at Series B–D companies",
    problem: "Incident comms drafting is a 20–40 minute tax on every Sev2+, often during the on-call's worst hours.",
    buyerUser: "Director of Engineering (buyer), on-call SREs (user)",
    businessModel: "SaaS per-seat, $50/user/mo",
    whyNow: "PagerDuty + Statuspage APIs + LLMs for templated drafting",
    alternatives: "FireHydrant, incident.io, manual templates",
    createdAt: "2025-04-04",
    status: "memo_ready",
    bucket: "kill",
    confidence: "high",
    marketAttractiveness: "low",
    competitiveCrowding: "high",
  },
];

export const sampleMemos: Record<string, Memo> = {
  "c-002": {
    conceptId: "c-002",
    summary:
      "Quarry proposes a focused submittal-log workflow for mid-size general contractors, sitting beside Procore rather than replacing it. Initial signals suggest a real, repeated pain with willingness to pay, and the competitive set is fragmented.",
    marketAttractiveness: {
      band: "high",
      rationale:
        "~7,500 US GCs in the $50M–$500M band; submittal workflow consistently named a top-3 admin pain in industry surveys; clear ACV anchor from adjacent point tools.",
    },
    competitiveCrowding: {
      band: "low",
      rationale:
        "Procore covers the surface but PMs route around it; no dominant point solution for submittals specifically. Most competitors are document-management generalists.",
    },
    competitors: [
      { name: "Procore", segment: "Platform", positioning: "End-to-end construction OS", note: "Native submittals weak; PMs use email + Excel anyway." },
      { name: "Bluebeam", segment: "Document tooling", positioning: "PDF markup + workflows", note: "Strong on drawings, weak on log lifecycle." },
      { name: "Submittal Exchange (Newforma)", segment: "Point tool", positioning: "Submittal-specific", note: "Legacy UX, enterprise-only sales motion." },
      { name: "Document Crunch", segment: "AI document review", positioning: "Contract review", note: "Adjacent, may expand into submittals." },
      { name: "Briq", segment: "Construction finance", positioning: "Forecasting", note: "Different jobs-to-be-done." },
    ],
    whitespace: [
      "Mid-market GCs ($50M–$500M) underserved by enterprise submittal tools.",
      "AI-assisted spec extraction from drawings → auto-populated log entries.",
      "Procore-native overlay rather than replacement reduces switching cost.",
    ],
    marketSizing: {
      tam: "$1.4B – $2.1B",
      sam: "$320M – $520M",
      som: "$18M – $34M (3-yr)",
      methodology:
        "Bottom-up: ~7,500 US GCs in target band × estimated $25k–$45k ACV, sensitized for adoption ramp. Cross-checked against adjacent Procore add-on revenue per customer.",
      assumptions: [
        "Average 18 active projects per GC at any time",
        "Penetration of 8–15% in years 1–3 for a focused point tool",
        "ACV anchored to comparable Procore-adjacent tools ($20k–$50k)",
      ],
      confidence: "medium",
    },
    risks: [
      "Procore could ship credible native submittals within 18 months.",
      "Sales cycle in construction is long (4–9 months) and reference-driven.",
      "AI extraction quality from scanned drawings is the technical wedge — must validate.",
    ],
    unknowns: [
      "True willingness-to-pay outside design-partner discount range.",
      "Whether VP Ops or PM holds the budget in the target segment.",
      "Procore partnership posture (channel vs. competitive).",
    ],
    recommendation: "validate",
    confidence: "high",
    nextSteps: [
      "Run 8–12 buyer interviews with VP Ops at GCs in the $50M–$500M band.",
      "Build a 2-week extraction-quality probe on real submittal packages.",
      "Map Procore partner program requirements and integration paths.",
    ],
    sources: [
      { title: "AGC 2024 Workforce Survey", url: "https://www.agc.org/learn/construction-data", supports: "Labor shortage driving tooling adoption" },
      { title: "Procore Developer Portal", url: "https://developers.procore.com/", supports: "API surface for submittals + integrations" },
      { title: "Construction Dive — Tech Adoption 2024", url: "https://www.constructiondive.com/", supports: "Mid-market digitization trends" },
    ],
    unsupportedClaims: [
      "Specific 15–25% rework rate (cited from interviews, not published data — flagged for validation).",
    ],
    verification: null,
  },
};
