import { cn } from "@/lib/utils";
import type { Band, DecisionBucket, Confidence } from "@/data/sampleConcepts";

const bandStyles: Record<Band, string> = {
  low: "bg-band-low/10 text-band-low ring-band-low/20",
  medium: "bg-band-medium/10 text-band-medium ring-band-medium/30",
  high: "bg-band-high/10 text-band-high ring-band-high/25",
};

const bucketStyles: Record<DecisionBucket, string> = {
  kill: "bg-bucket-kill/10 text-bucket-kill ring-bucket-kill/25",
  investigate: "bg-bucket-investigate/10 text-bucket-investigate ring-bucket-investigate/25",
  validate: "bg-bucket-validate/10 text-bucket-validate ring-bucket-validate/25",
};

const confidenceStyles: Record<Confidence, string> = {
  low: "bg-muted text-muted-foreground ring-border",
  medium: "bg-accent text-accent-foreground ring-primary/20",
  high: "bg-primary/10 text-primary ring-primary/25",
};

export function BandPill({ value, label }: { value: Band; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset uppercase tracking-wide",
        bandStyles[value]
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label ?? value}
    </span>
  );
}

export function BucketPill({ value }: { value: DecisionBucket }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset uppercase tracking-wider",
        bucketStyles[value]
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {value}
    </span>
  );
}

export function ConfidencePill({ value }: { value: Confidence }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        confidenceStyles[value]
      )}
    >
      Confidence · <span className="capitalize">{value}</span>
    </span>
  );
}
