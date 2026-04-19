import { Link } from "react-router-dom";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BandPill, BucketPill, ConfidencePill } from "@/components/Pills";
import { sampleConcepts } from "@/data/sampleConcepts";

const Concepts = () => {
  const sorted = [...sampleConcepts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />

      <main className="container py-12 md:py-16 flex-1">
        <div className="flex items-end justify-between gap-6 mb-10">
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
              Quarter · Q2 2025
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
              Concepts
            </h1>
            <p className="text-muted-foreground mt-1.5 max-w-xl">
              Every concept evaluated this quarter, ranked by recency. Click into a memo to see the full analysis.
            </p>
          </div>
          <Link
            to="/concepts/new"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors shadow-sm shrink-0"
          >
            New concept <span aria-hidden>→</span>
          </Link>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            ["Total", sampleConcepts.length],
            ["Validate", sampleConcepts.filter((c) => c.bucket === "validate").length],
            ["Investigate", sampleConcepts.filter((c) => c.bucket === "investigate").length],
            ["Kill", sampleConcepts.filter((c) => c.bucket === "kill").length],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-lg border border-border bg-card p-4 shadow-xs">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</div>
              <div className="font-display text-2xl font-semibold mt-1">{v}</div>
            </div>
          ))}
        </div>

        {/* Concepts table */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="hidden md:grid grid-cols-[1.4fr_0.9fr_0.7fr_0.7fr_0.7fr_0.5fr] gap-4 px-6 py-3 bg-surface border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
            <div>Concept</div>
            <div>Vertical</div>
            <div>Bucket</div>
            <div>Market</div>
            <div>Crowding</div>
            <div className="text-right">Conf.</div>
          </div>
          <ul className="divide-y divide-border">
            {sorted.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/memo/${c.id}`}
                  className="grid grid-cols-1 md:grid-cols-[1.4fr_0.9fr_0.7fr_0.7fr_0.7fr_0.5fr] gap-4 px-6 py-5 hover:bg-surface transition-colors group"
                >
                  <div>
                    <div className="font-display font-semibold tracking-tight group-hover:text-primary transition-colors">
                      {c.name}
                    </div>
                    <div className="text-sm text-muted-foreground line-clamp-1 mt-0.5">{c.oneLiner}</div>
                  </div>
                  <div className="text-sm text-muted-foreground self-center">{c.vertical}</div>
                  <div className="self-center">{c.bucket && <BucketPill value={c.bucket} />}</div>
                  <div className="self-center">{c.marketAttractiveness && <BandPill value={c.marketAttractiveness} />}</div>
                  <div className="self-center">{c.competitiveCrowding && <BandPill value={c.competitiveCrowding} />}</div>
                  <div className="self-center text-right text-xs uppercase tracking-wider text-muted-foreground">
                    {c.confidence}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Sample data shown. Connect Lovable Cloud to persist concepts and run live analyses.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
};

export default Concepts;
