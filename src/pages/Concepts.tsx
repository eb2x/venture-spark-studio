import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BandPill, BucketPill } from "@/components/Pills";
import { listConcepts } from "@/lib/api";
import type { Concept } from "@/data/sampleConcepts";
import { toast } from "sonner";

const Concepts = () => {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listConcepts()
      .then(setConcepts)
      .catch((e) => {
        console.error(e);
        toast.error("Couldn't load concepts");
      })
      .finally(() => setLoading(false));
  }, []);

  const counts = {
    total: concepts.length,
    validate: concepts.filter((c) => c.bucket === "validate").length,
    investigate: concepts.filter((c) => c.bucket === "investigate").length,
    kill: concepts.filter((c) => c.bucket === "kill").length,
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />

      <main className="container py-12 md:py-16 flex-1">
        <div className="flex items-end justify-between gap-6 mb-10">
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
              All concepts
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">Concepts</h1>
            <p className="text-muted-foreground mt-1.5 max-w-xl">
              Every concept evaluated, ranked by recency. Click into a memo to see the full analysis.
            </p>
          </div>
          <Link
            to="/concepts/new"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors shadow-sm shrink-0"
          >
            New concept <span aria-hidden>→</span>
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            ["Total", counts.total],
            ["Validate", counts.validate],
            ["Investigate", counts.investigate],
            ["Kill", counts.kill],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-lg border border-border bg-card p-4 shadow-xs">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</div>
              <div className="font-display text-2xl font-semibold mt-1">{v}</div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="hidden md:grid grid-cols-[1.4fr_0.9fr_0.7fr_0.7fr_0.7fr_0.5fr] gap-4 px-6 py-3 bg-surface border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
            <div>Concept</div>
            <div>Vertical</div>
            <div>Bucket</div>
            <div>Market</div>
            <div>Crowding</div>
            <div className="text-right">Conf.</div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm text-muted-foreground">Loading concepts…</div>
          ) : concepts.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm text-muted-foreground">No concepts yet.</p>
              <Link
                to="/concepts/new"
                className="inline-flex mt-4 items-center gap-2 h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors"
              >
                Start your first concept →
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {concepts.map((c) => (
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
                    <div className="self-center">
                      {c.bucket ? (
                        <BucketPill value={c.bucket} />
                      ) : (
                        <span className="text-[11px] text-muted-foreground mono uppercase">pending</span>
                      )}
                    </div>
                    <div className="self-center">
                      {c.marketAttractiveness && <BandPill value={c.marketAttractiveness} />}
                    </div>
                    <div className="self-center">
                      {c.competitiveCrowding && <BandPill value={c.competitiveCrowding} />}
                    </div>
                    <div className="self-center text-right text-xs uppercase tracking-wider text-muted-foreground">
                      {c.confidence ?? "—"}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
};

export default Concepts;
