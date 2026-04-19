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

const schema = z.object({
  name: z.string().trim().min(2, "Give it a name").max(80),
  description: z.string().trim().min(40, "Describe the concept in at least a sentence or two").max(1000),
  targetCustomer: z.string().trim().min(8, "Be specific about who this is for").max(300),
  problem: z.string().trim().min(20, "What pain does this remove?").max(600),
  buyerUser: z.string().trim().min(4, "Buyer and user — same or different?").max(200),
  businessModel: z.string().trim().min(4, "How does this make money?").max(200),
  whyNow: z.string().trim().min(10, "Why is this possible / urgent now?").max(400),
  alternatives: z.string().trim().min(4, "What do people do today?").max(400),
});

type FormState = z.infer<typeof schema>;

const initial: FormState = {
  name: "",
  description: "",
  targetCustomer: "",
  problem: "",
  buyerUser: "",
  businessModel: "",
  whyNow: "",
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
    key: "targetCustomer",
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
  { key: "buyerUser", label: "Buyer / user", placeholder: "e.g. VP Ops buys, PMs use" },
  { key: "businessModel", label: "Business model", placeholder: "e.g. SaaS, ~$25k ACV per company" },
  {
    key: "whyNow",
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
    // Simulate triage — in v2 this calls a Cloud edge function.
    await new Promise((r) => setTimeout(r, 900));
    toast.success("Intake accepted · ready for triage", {
      description: "Showing a sample memo while AI pipeline isn't connected yet.",
    });
    setSubmitting(false);
    navigate("/memo/c-002");
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
                    {f.hint && (
                      <span className="text-[11px] text-muted-foreground">{f.hint}</span>
                    )}
                  </div>
                  {f.long ? (
                    <Textarea
                      id={f.key}
                      rows={3}
                      placeholder={f.placeholder}
                      value={values[f.key]}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      className="bg-card resize-y"
                    />
                  ) : (
                    <Input
                      id={f.key}
                      placeholder={f.placeholder}
                      value={values[f.key]}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      className="bg-card"
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
                  {submitting ? "Running intake…" : "Submit for triage →"}
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
          </aside>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
};

export default NewConcept;
