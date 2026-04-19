export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 mt-24">
      <div className="container py-10 flex flex-col md:flex-row gap-6 md:items-end justify-between">
        <div>
          <div className="font-display text-lg font-semibold tracking-tight">Lattice</div>
          <p className="text-sm text-muted-foreground max-w-md mt-1">
            Decision-ready venture memos for studios. Built for partners who review 10–20 concepts a quarter.
          </p>
        </div>
        <div className="mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          © {new Date().getFullYear()} Lattice Studio Tools
        </div>
      </div>
    </footer>
  );
}
