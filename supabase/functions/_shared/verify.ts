// Verification utilities used by verify-claims.
//
// Responsibilities:
//   1. URL reachability (HEAD, fallback to GET) with a tight timeout + cap on
//      parallel requests to keep edge-function runtime sane.
//   2. Claim ↔ evidence cross-check: does every factual claim have a source?
//   3. Confidence downgrade: too many failures or orphan claims → step down
//      the memo's confidence band.

import type { Confidence, Evidence, Memo, UrlCheck } from "./schemas.ts";

const URL_CHECK_TIMEOUT_MS = 8_000;
const MAX_PARALLEL = 6;

export async function checkUrl(url: string): Promise<UrlCheck> {
  const checkedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), URL_CHECK_TIMEOUT_MS);

  // HEAD first — many sites reject HEAD or return misleading statuses, so fall
  // back to GET on any non-2xx. `redirect: "follow"` is default.
  const tryFetch = async (method: "HEAD" | "GET") => {
    return await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        // Some CDNs reject defaults from fetch; a realistic UA avoids WAFs.
        "User-Agent":
          "Mozilla/5.0 (compatible; VentureSparkVerifier/1.0; +https://venture-spark-studio.app/bot)",
        Accept: "text/html,*/*;q=0.8",
      },
    });
  };

  try {
    let res: Response;
    try {
      res = await tryFetch("HEAD");
      if (!res.ok) res = await tryFetch("GET");
    } catch (_e) {
      res = await tryFetch("GET");
    }
    clearTimeout(timer);
    return {
      url,
      ok: res.ok,
      http_status: res.status,
      error: res.ok ? null : `HTTP ${res.status}`,
      checked_at: checkedAt,
    };
  } catch (err) {
    clearTimeout(timer);
    const e = err as Error;
    return {
      url,
      ok: false,
      http_status: null,
      error: e.name === "AbortError" ? "timeout" : e.message,
      checked_at: checkedAt,
    };
  }
}

/** Check a batch of URLs with bounded parallelism. */
export async function checkUrls(urls: string[]): Promise<UrlCheck[]> {
  const results: UrlCheck[] = [];
  for (let i = 0; i < urls.length; i += MAX_PARALLEL) {
    const batch = urls.slice(i, i + MAX_PARALLEL);
    const settled = await Promise.all(batch.map(checkUrl));
    results.push(...settled);
  }
  return results;
}

/** Apply url_check statuses back onto the memo's sources array. */
export function applyChecksToEvidence(sources: Evidence[], checks: UrlCheck[]): Evidence[] {
  const byUrl = new Map(checks.map((c) => [c.url, c]));
  return sources.map((s) => {
    const c = byUrl.get(s.url);
    if (!c) return s;
    return {
      ...s,
      status: c.ok ? "verified" : "unreachable",
      http_status: c.http_status,
      checked_at: c.checked_at,
      note: c.ok ? s.note ?? null : c.error ?? s.note ?? null,
    };
  });
}

/**
 * Walk the memo's human-readable claim fields (summary, risks, rationales,
 * sizing methodology) and flag claim-sized statements that don't appear to be
 * supported by any evidence URL domain.
 *
 * This is deliberately heuristic — it's a safety net, not a semantic
 * fact-checker. The goal is to surface obvious gaps, not prove correctness.
 */
export function findClaimsWithoutEvidence(memo: Memo): string[] {
  if (memo.sources.length === 0) {
    // No sources at all → all assertions are unsupported.
    return gatherClaimSentences(memo).slice(0, 10);
  }

  // A claim is considered "possibly supported" if a source's `supports` field
  // overlaps with it on any content word (length >= 5). This is weak, but it
  // catches the case where the LLM makes a claim with zero supporting source.
  const supportWords = new Set<string>();
  for (const s of memo.sources) {
    if (s.status === "unreachable" || s.status === "unsupported") continue;
    for (const w of tokenize(s.supports)) supportWords.add(w);
  }

  const orphans: string[] = [];
  for (const claim of gatherClaimSentences(memo)) {
    const tokens = tokenize(claim);
    const overlap = tokens.some((t) => supportWords.has(t));
    if (!overlap) orphans.push(claim);
  }
  return orphans;
}

function gatherClaimSentences(memo: Memo): string[] {
  const sentences: string[] = [];
  const push = (s: string | undefined | null) => {
    if (!s) return;
    for (const part of s.split(/(?<=[.!?])\s+/)) {
      const t = part.trim();
      if (t.length >= 30) sentences.push(t);
    }
  };
  push(memo.summary);
  push(memo.market_attractiveness.rationale);
  push(memo.competitive_crowding.rationale);
  const methodology =
    typeof memo.market_sizing.methodology === "string" ? memo.market_sizing.methodology : "";
  push(methodology);
  for (const r of memo.risks) push(r);
  return sentences;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 5 && !STOPWORDS.has(w));
}

const STOPWORDS = new Set([
  "about",
  "above",
  "across",
  "after",
  "against",
  "along",
  "among",
  "around",
  "because",
  "before",
  "behind",
  "below",
  "beside",
  "between",
  "beyond",
  "could",
  "during",
  "every",
  "might",
  "should",
  "their",
  "there",
  "these",
  "those",
  "through",
  "under",
  "where",
  "which",
  "while",
  "would",
]);

/**
 * Confidence downgrade policy:
 *   • ≥ 50% of URLs failed  → step down one band
 *   • ≥ 3 claims without evidence → step down one band
 *   • Both conditions hit   → step down two bands (floored at "low")
 */
export function maybeDowngradeConfidence(
  current: Confidence,
  urlFailRate: number,
  orphanClaimCount: number,
): Confidence {
  let steps = 0;
  if (urlFailRate >= 0.5) steps++;
  if (orphanClaimCount >= 3) steps++;
  if (steps === 0) return current;
  const order: Confidence[] = ["low", "medium", "high"];
  const idx = order.indexOf(current);
  const next = Math.max(0, idx - steps);
  return order[next];
}
