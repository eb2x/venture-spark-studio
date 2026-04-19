import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BandPill, BucketPill, ConfidencePill } from "@/components/Pills";
import { Button } from "@/components/ui/button";
import { getConcept, getMemo, generateMemo } from "@/lib/api";
import type { Concept, Memo as MemoType } from "@/data/sampleConcepts";
import { toast } from "sonner";

const Section = ({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) => (
  <section className="py-10 border-t border-border first:border-t-0 first:pt-0">
    <div className="grid md:grid-cols-[200px_1fr] gap-8">
      <div>
        <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
          {eyebrow}
        </div>
        <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="space-y-4 text-[15px] leading-relaxed">{children}</div>
    </div>
  </section>
);

const Memo = () => {
  const { id } = useParams<{ id: string }>();
  const [concept, setConcept] = useState<Concept | null>(null);
  const [memo, setMemo] = useState<MemoType | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [c, m] = await Promise.all([getConcept(id), getMemo(id)]);
      setConcept(c);
      setMemo(m);
    } catch (e) {
      console.error(e);
      toast.error("Couldn't load memo");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onRegenerate = async () => {
    if (!id) return;
    setRegenerating(true);
    toast.message("Regenerating memo…", { description: "20–40 seconds." });
    const r = await generateMemo(id);
    setRegenerating(false);
    if (!r.ok) {
      toast.error("Failed", { description: r.error });
      return;
    }
    toast.success("Memo updated");
    load();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <SiteHeader />
        <main className="flex-1 container py-20 text-center text-sm text-muted-foreground">
          Loading memo…
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (!concept) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <SiteHeader />
        <main className="flex-1 container py-20">
          <h1 className="font-display text-2xl">Concept not found</h1>
          <Link to="/concepts" className="text-primary hover:underline mt-4 inline-block">
            ← Back to concepts
          </Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  // No memo yet: show pending state with retry
  if (!memo) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <SiteHeader />
        <main className="flex-1 container py-16 max-w-3xl">
          <Link
            to="/concepts"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
          >
            <span aria-hidden>←</span> Back to concepts
          </Link>
          <h1 className="font-display text-4xl font-semibold tracking-tight mt-4">{concept.name}</h1>
          <p className="text-muted-foreground mt-2">{concept.oneLiner}</p>
          <div className="mt-10 rounded-xl border border-border bg-card p-8 text-center">
            <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
              No memo yet
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              The memo for this concept hasn't been generated yet (or generation failed).
            </p>
            <Button
              onClick={onRegenerate}
              disabled={regenerating}
              className="mt-5 bg-foreground text-background hover:bg-foreground/90"
            >
              {regenerating ? "Generating…" : "Generate memo now"}
            </Button>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />

      <main className="flex-1">
        <div className="border-b border-border bg-surface">
          <div className="container py-10">
            <div className="flex items-center justify-between">
              <Link
                to="/concepts"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
              >
                <span aria-hidden>←</span> Back to concepts
              </Link>
              <Button
                onClick={onRegenerate}
                disabled={regenerating}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                {regenerating ? "Regenerating…" : "Regenerate"}
              </Button>
            </div>
            <div className="mt-5 flex flex-wrap items-start justify-between gap-6">
              <div className="max-w-3xl">
                <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Memo · {concept.id.slice(0, 8)} · {concept.vertical}
                </div>
                <h1 className="mt-2 font-display text-4xl md:text-5xl font-semibold tracking-tight">
                  {concept.name}
                </h1>
                <p className="mt-3 text-lg text-muted-foreground text-balance">{concept.oneLiner}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <BucketPill value={memo.recommendation} />
                <ConfidencePill value={memo.confidence} />
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                ["Decision", <BucketPill key="b" value={memo.recommendation} />],
                ["Confidence", <BandPill key="c" value={memo.confidence} />],
                ["Market attractiveness", <BandPill key="m" value={memo.marketAttractiveness.band} />],
                ["Competitive crowding", <BandPill key="cr" value={memo.competitiveCrowding.band} />],
              ].map(([label, pill], i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-4 shadow-xs">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
                  <div className="mt-2">{pill}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <article className="container max-w-5xl py-14">
          <Section eyebrow="01" title="Concept summary">
            <p>{memo.summary}</p>
            <div className="rounded-lg bg-surface border border-border p-4 text-sm">
              <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                Provided by partner
              </div>
              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                {[
                  ["Target customer", concept.targetCustomer],
                  ["Buyer / user", concept.buyerUser],
                  ["Business model", concept.businessModel],
                  ["Why now", concept.whyNow],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</dt>
                    <dd className="mt-0.5 text-foreground">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Section>

          <Section eyebrow="02" title="Market attractiveness">
            <div className="flex items-center gap-3 mb-1">
              <BandPill
                value={memo.marketAttractiveness.band}
                label={`market: ${memo.marketAttractiveness.band}`}
              />
            </div>
            <p>{memo.marketAttractiveness.rationale}</p>
          </Section>

          <Section eyebrow="03" title="Competitive crowding">
            <div className="flex items-center gap-3 mb-1">
              <BandPill
                value={memo.competitiveCrowding.band}
                label={`crowding: ${memo.competitiveCrowding.band}`}
              />
            </div>
            <p>{memo.competitiveCrowding.rationale}</p>
            <div className="rounded-lg border border-border overflow-hidden mt-4">
              <div className="grid grid-cols-[1.2fr_1fr_1.2fr_1.6fr] gap-3 px-4 py-2.5 bg-surface text-[10px] uppercase tracking-wider text-muted-foreground">
                <div>Competitor</div>
                <div>Segment</div>
                <div>Positioning</div>
                <div>Note</div>
              </div>
              <ul className="divide-y divide-border">
                {memo.competitors.map((c) => (
                  <li
                    key={c.name}
                    className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr_1.2fr_1.6fr] gap-3 px-4 py-3 text-sm"
                  >
                    <div className="font-medium">{c.name}</div>
                    <div className="text-muted-foreground">{c.segment}</div>
                    <div className="text-muted-foreground">{c.positioning}</div>
                    <div className="text-muted-foreground">{c.note}</div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mt-6 mb-2">
                Whitespace hypotheses
              </div>
              <ul className="space-y-2">
                {memo.whitespace.map((w) => (
                  <li key={w} className="flex items-start gap-2.5">
                    <span className="mt-2 h-1 w-2 rounded-full bg-primary shrink-0" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Section>

          <Section eyebrow="04" title="Market sizing">
            <div className="grid grid-cols-3 gap-3">
              {[
                ["TAM", memo.marketSizing.tam],
                ["SAM", memo.marketSizing.sam],
                ["SOM (3-yr)", memo.marketSizing.som],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-border bg-card p-4">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
                  <div className="mono mt-1 text-base">{v}</div>
                </div>
              ))}
            </div>
            <p className="text-muted-foreground">{memo.marketSizing.methodology}</p>
            <div>
              <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                Assumptions carrying the model
              </div>
              <ul className="space-y-1.5 text-sm">
                {memo.marketSizing.assumptions.map((a) => (
                  <li key={a} className="flex gap-2">
                    <span className="text-muted-foreground">·</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="text-xs text-muted-foreground italic">
              Sizing confidence:{" "}
              <span className="capitalize text-foreground">{memo.marketSizing.confidence}</span>. Ranges, not point estimates.
            </div>
          </Section>

          <Section eyebrow="05" title="Risks & unknowns">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                  Key risks
                </div>
                <ul className="space-y-2.5">
                  {memo.risks.map((r) => (
                    <li key={r} className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-warning shrink-0" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                  Biggest unknowns
                </div>
                <ul className="space-y-2.5">
                  {memo.unknowns.map((u) => (
                    <li key={u} className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                      <span>{u}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Section>

          <Section eyebrow="06" title="Recommendation">
            <div className="rounded-xl border border-border bg-gradient-to-br from-primary-soft to-card p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <BucketPill value={memo.recommendation} />
                <ConfidencePill value={memo.confidence} />
              </div>
              <h3 className="font-display text-2xl font-semibold tracking-tight mt-4 capitalize">
                {memo.recommendation === "kill"
                  ? "Pass on this concept."
                  : memo.recommendation === "investigate"
                    ? "Investigate further before committing."
                    : "Move to validation."}
              </h3>
              <div className="mt-5">
                <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                  Proposed next steps
                </div>
                <ol className="space-y-2">
                  {memo.nextSteps.map((s, i) => (
                    <li key={s} className="flex items-start gap-3">
                      <span className="mono text-xs text-primary mt-0.5">0{i + 1}</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </Section>

          <Section eyebrow="07" title="Sources & verification">
            <ul className="space-y-3">
              {memo.sources.map((s) => (
                <li
                  key={s.url}
                  className="rounded-lg border border-border bg-card p-4 flex items-start justify-between gap-4"
                >
                  <div>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {s.title}
                    </a>
                    <div className="text-sm text-muted-foreground mt-0.5">Supports: {s.supports}</div>
                  </div>
                  <span className="text-[11px] mono text-muted-foreground shrink-0 hidden md:block">
                    {safeHost(s.url)}
                  </span>
                </li>
              ))}
            </ul>
            {memo.unsupportedClaims.length > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 mt-4">
                <div className="mono text-[10px] uppercase tracking-widest text-warning mb-2">
                  Flagged · unsupported claims
                </div>
                <ul className="space-y-1.5 text-sm">
                  {memo.unsupportedClaims.map((c) => (
                    <li key={c} className="flex gap-2">
                      <span className="text-warning">!</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground mt-3">
                  When verification is weak, Lattice lowers confidence rather than presenting certainty.
                </p>
              </div>
            )}
          </Section>
        </article>
      </main>

      <SiteFooter />
    </div>
  );
};

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

export default Memo;
