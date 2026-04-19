import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { createConcept, generateMemo } from "@/lib/api";

const schema = z.object({
  name: z.string().trim().min(2, "Give it a name").max(80),
  description: z.string().trim().min(40, "Describe the concept in at least a sentence or two").max(2000),
  target_customer: z.string().trim().min(8, "Be specific about who this is for").max(400),
  problem: z.string().trim().min(20, "What pain does this remove?").max(800),
  buyer_user: z.string().trim().min(4, "Buyer and user — same or different?").max(300),
  business_model: z.string().trim().min(4, "How does this make money?").max(300),
  why_now: z.string().trim().min(10, "Why is this possible / urgent now?").max(600),
  alternatives: z.string().trim().min(4, "What do people do today?").max(600),
});

type FormState = z.infer<typeof schema>;

const initial: FormState = {
  name: "",
  description: "",
  target_customer: "",
  problem: "",
  buyer_user: "",
  business_model: "",
  why_now: "",
  alternatives: "",
};

const fields: {
  key: keyof FormState;
  label: string;
  placeholder: string;
  long?: boolean;
  hint?: string;
}[] = [
  { key: "name", label: "Concept name", placeholder: "e.g. Quarry", hint: "An internal codename is fine." },
  {
    key: "description",
    label: "One-paragraph description",
    placeholder: "What is the concept, in plain language? What does it do?",
    long: true,
  },
  {
    key: "target_customer",
    label: "Target customer",
    placeholder: "e.g. VP Operations at $50M–$500M general contractors",
    hint: "Be segment-specific. 'SMBs' is too broad.",
  },
  {
    key: "problem",
    label: "Problem being solved",
    placeholder: "What pain, how often, and how painful?",
    long: true,
  },
  { key: "buyer_user", label: "Buyer / user", placeholder: "e.g. VP Ops buys, PMs use" },
  { key: "business_model", label: "Business model", placeholder: "e.g. SaaS, ~$25k ACV per company" },
  {
    key: "why_now",
    label: "Why now",
    placeholder: "Why is this concept possible (or urgent) in 2025 and not 2020?",
    long: true,
  },
  {
    key: "alternatives",
    label: "Current alternatives",
    placeholder: "What do people use today? Spreadsheets, incumbents, internal tools…",
    long: true,
  },
];

const NewConcept = () => {
  const [values, setValues] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<"idle" | "intake" | "analyzing">("idle");
  const navigate = useNavigate();

  const filled = Object.values(values).filter((v) => v.trim().length > 0).length;
  const completion = Math.round((filled / fields.length) * 100);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as keyof FormState;
        next[k] = issue.message;
      }
      setErrors(next);
      toast.error("Some fields need attention", {
        description: "We won't analyze a concept until intake quality clears the bar.",
      });
      return;
    }
    setErrors({});
    setSubmitting(true);
    setPhase("intake");
    try {
      const id = await createConcept(parsed.data);
      setPhase("analyzing");
      toast.message("Intake accepted · running triage and memo", {
        description: "Lattice is analyzing the concept. This usually takes 20–40 seconds.",
      });
      const result = await generateMemo(id);
      if (!result.ok) {
        if (result.status === 429 || /rate/i.test(result.error)) {
          toast.error("Rate limit hit", { description: "Try again in a minute." });
        } else if (result.status === 402 || /credit/i.test(result.error)) {
          toast.error("AI credits exhausted", {
            description: "Add funds in Settings → Workspace → Usage.",
          });
        } else {
          toast.error("Memo generation failed", { description: result.error });
        }
        // Concept is saved — let user view the placeholder state.
        navigate(`/memo/${id}`);
        return;
      }
      toast.success("Memo ready", { description: "Opening the analysis." });
      navigate(`/memo/${id}`);
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSubmitting(false);
      setPhase("idle");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />

      <main className="container py-12 md:py-16 flex-1">
        <div className="grid lg:grid-cols-[1fr_320px] gap-12">
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
              Step 1 · Structured concept intake
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight max-w-2xl text-balance">
              Tell us the concept. We'll quality-gate it before any analysis runs.
            </h1>
            <p className="mt-3 text-muted-foreground max-w-2xl">
              Eight required inputs. If anything's missing or weakly specified, we'll ask — not guess.
            </p>

            <form onSubmit={onSubmit} className="mt-10 space-y-7">
              {fields.map((f) => (
                <div key={f.key} className="grid gap-2">
                  <div className="flex items-baseline justify-between">
                    <Label htmlFor={f.key} className="text-sm font-medium">
                      {f.label}
                      <span className="text-destructive/80 ml-1">*</span>
                    </Label>
                    {f.hint && <span className="text-[11px] text-muted-foreground">{f.hint}</span>}
                  </div>
                  {f.long ? (
                    <Textarea
                      id={f.key}
                      rows={3}
                      placeholder={f.placeholder}
                      value={values[f.key]}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      className="bg-card resize-y"
                      disabled={submitting}
                    />
                  ) : (
                    <Input
                      id={f.key}
                      placeholder={f.placeholder}
                      value={values[f.key]}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      className="bg-card"
                      disabled={submitting}
                    />
                  )}
                  {errors[f.key] && (
                    <div className="text-xs text-destructive flex items-center gap-1.5">
                      <span className="h-1 w-1 rounded-full bg-destructive" />
                      {errors[f.key]}
                    </div>
                  )}
                </div>
              ))}

              <div className="pt-4 flex items-center justify-between gap-4 border-t border-border">
                <div className="text-xs text-muted-foreground">
                  By submitting you'll trigger triage. Memo runs only on concepts that pass.
                </div>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="h-11 px-6 bg-foreground text-background hover:bg-foreground/90 shadow-sm"
                >
                  {phase === "intake"
                    ? "Saving intake…"
                    : phase === "analyzing"
                      ? "Generating memo…"
                      : "Submit for triage →"}
                </Button>
              </div>
            </form>
          </div>

          {/* Side rail */}
          <aside className="space-y-5">
            <div className="rounded-xl border border-border bg-card p-5 shadow-xs sticky top-24">
              <div className="flex items-center justify-between">
                <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Intake quality
                </div>
                <span className="text-xs font-medium">{completion}%</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-gradient-accent transition-all duration-500"
                  style={{ width: `${completion}%` }}
                />
              </div>
              <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
                Lattice will not run analysis on insufficiently specified concepts. Better intake → fewer rounds of clarification → faster memo.
              </p>
              <div className="mt-5 hairline pt-4 space-y-2 text-xs">
                {[
                  "User-provided facts vs. AI inference are kept separate downstream",
                  "Ambiguity flags surface before triage runs",
                  "B2B SaaS primary scope · marketplaces where data permits",
                ].map((t) => (
                  <div key={t} className="flex items-start gap-2 text-muted-foreground">
                    <span className="mt-1 h-1 w-1 rounded-full bg-primary shrink-0" />
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>

            {phase === "analyzing" && (
              <div className="rounded-xl border border-primary/30 bg-primary-soft p-5 shadow-xs">
                <div className="flex items-center gap-2 mono text-[10px] uppercase tracking-widest text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  Analyzing
                </div>
                <p className="mt-2 text-sm text-foreground leading-relaxed">
                  Running competitive triage and market sizing through the AI gateway. Don't navigate away.
                </p>
              </div>
            )}
          </aside>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
};

export default NewConcept;
