import { Link } from "react-router-dom";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BandPill, BucketPill } from "@/components/Pills";

const features = [
  {
    step: "01",
    title: "Structured concept intake",
    desc: "Quality gate on eight required inputs. We won't analyze a vibe — we'll ask for the missing piece.",
    chip: "≤ 5 min",
  },
  {
    step: "02",
    title: "Competitive triage",
    desc: "10–20 source-backed competitors, market map, whitespace hypotheses. Confidence is explicit.",
    chip: "≤ 30 min",
  },
  {
    step: "03",
    title: "Market sizing",
    desc: "TAM / SAM / SOM as ranges with the assumptions that carry the model. Only on concepts that pass triage.",
    chip: "ranges, not points",
  },
  {
    step: "04",
    title: "Decision-ready memo",
    desc: "Kill / investigate / validate, confidence, attractiveness and crowding bands — comparable across the quarter.",
    chip: "≤ 60 min",
  },
];

const nonGoals = [
  "No founder-market-fit assessment",
  "No prototype evaluation",
  "No studio-fit scoring",
  "No real-time market monitoring",
  "No opaque composite scoring",
  "No automated investment decisioning",
  "No hardware, biotech, or deep research",
];

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-hero pointer-events-none" />
        <div className="absolute inset-0 grid-bg opacity-60" />
        <div className="container relative pt-20 pb-24 md:pt-28 md:pb-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 backdrop-blur px-3 py-1 text-xs text-muted-foreground animate-in-fade">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Built for venture studios reviewing 10–20 concepts a quarter
            </div>
            <h1 className="mt-6 font-display font-semibold tracking-tight text-5xl md:text-6xl lg:text-7xl text-balance leading-[1.02] animate-in-up">
              Turn raw concepts into{" "}
              <span className="relative whitespace-nowrap">
                <span className="bg-gradient-accent bg-clip-text text-transparent">decision-ready</span>
              </span>{" "}
              memos.
            </h1>
            <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl text-balance animate-in-up delay-100">
              Lattice runs structured intake, competitive triage, and defensible market sizing — then synthesizes a memo your partners can read in five minutes and discuss with confidence.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3 animate-in-up delay-200">
              <Link
                to="/concepts/new"
                className="inline-flex items-center gap-2 h-11 px-5 rounded-md bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors shadow-md"
              >
                Start a concept
                <span aria-hidden>→</span>
              </Link>
              <Link
                to="/memo/c-002"
                className="inline-flex items-center gap-2 h-11 px-5 rounded-md border border-border bg-background text-foreground text-sm font-medium hover:bg-secondary transition-colors"
              >
                See a sample memo
              </Link>
            </div>

            <dl className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl animate-in-up delay-300">
              {[
                ["≤ 30 min", "Concept → triage"],
                ["≤ 60 min", "Triage → full memo"],
                ["70%", "Memos rated useful"],
                ["95%+", "Verified claim accuracy"],
              ].map(([k, v]) => (
                <div key={v} className="border-l border-border pl-4">
                  <dt className="font-display text-2xl font-semibold tracking-tight">{k}</dt>
                  <dd className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Floating memo preview card */}
          <div className="hidden xl:block absolute right-8 top-28 w-[420px] animate-in-up delay-500">
            <MemoPreviewCard />
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section className="container py-20 md:py-28">
        <div className="flex items-end justify-between gap-8 mb-12">
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-3">
              The workflow
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight max-w-2xl text-balance">
              Four steps from raw idea to a memo your partners can act on.
            </h2>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-px bg-border rounded-xl overflow-hidden border border-border shadow-sm">
          {features.map((f) => (
            <div key={f.step} className="bg-card p-8 md:p-10 group transition-colors hover:bg-surface">
              <div className="flex items-baseline justify-between">
                <span className="mono text-xs text-muted-foreground tracking-widest">{f.step}</span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary-soft text-primary">
                  {f.chip}
                </span>
              </div>
              <h3 className="mt-4 font-display text-xl font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparable bands explainer */}
      <section className="container pb-20 md:pb-28">
        <div className="rounded-2xl border border-border bg-surface p-8 md:p-12 shadow-sm">
          <div className="grid md:grid-cols-[1.1fr_1fr] gap-10 items-start">
            <div>
              <div className="mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-3">
                Comparable across the quarter
              </div>
              <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight text-balance">
                Every memo carries the same shape, so partners can rank ten concepts side-by-side.
              </h2>
              <p className="mt-5 text-muted-foreground leading-relaxed max-w-xl">
                Decision bucket, confidence, market attractiveness, and competitive crowding — the four dimensions that turn a quarterly review from opinion into structured triage.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Decision", <BucketPill key="b" value="validate" />],
                ["Decision", <BucketPill key="b2" value="investigate" />],
                ["Decision", <BucketPill key="b3" value="kill" />],
                ["Market attractiveness", <BandPill key="m" value="high" />],
                ["Competitive crowding", <BandPill key="c" value="low" />],
                ["Confidence", <BandPill key="cf" value="medium" label="medium" />],
              ].map(([label, pill], i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-4">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
                  <div className="mt-2">{pill}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Non-goals */}
      <section className="container pb-24">
        <div className="grid md:grid-cols-[1fr_1.2fr] gap-10 items-start">
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-3">
              Explicit non-goals
            </div>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-balance">
              Lattice replaces research grind, not partner judgment.
            </h2>
            <p className="mt-4 text-muted-foreground max-w-md">
              We're deliberate about what this tool is not. Clarity here is what makes the memos trustworthy.
            </p>
          </div>
          <ul className="grid sm:grid-cols-2 gap-2">
            {nonGoals.map((n) => (
              <li
                key={n}
                className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
              >
                <span className="mt-1 h-1 w-3 rounded-full bg-muted-foreground/40 shrink-0" />
                {n}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
};

function MemoPreviewCard() {
  return (
    <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-surface">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-bucket-validate" />
          <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">memo · c-002</span>
        </div>
        <span className="text-[11px] text-muted-foreground">Quarry</span>
      </div>
      <div className="p-5">
        <div className="flex flex-wrap gap-1.5">
          <BucketPill value="validate" />
          <BandPill value="high" label="market: high" />
          <BandPill value="low" label="crowding: low" />
        </div>
        <h4 className="mt-4 font-display text-lg font-semibold tracking-tight">
          Submittal log automation for mid-size GCs
        </h4>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Procore-adjacent point tool with a fragmented competitive set and a clear ACV anchor. Recommend 2-week design-partner probe.
        </p>
        <div className="mt-4 hairline pt-4 grid grid-cols-3 gap-3">
          {[
            ["TAM", "$1.4–2.1B"],
            ["SAM", "$320–520M"],
            ["SOM", "$18–34M"],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
              <div className="mono text-sm mt-0.5">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Index;
