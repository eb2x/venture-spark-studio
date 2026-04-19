import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const links = [
  { to: "/", label: "Overview" },
  { to: "/concepts", label: "Concepts" },
  { to: "/concepts/new", label: "New concept" },
];

export function SiteHeader() {
  const { pathname } = useLocation();
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="relative h-7 w-7 rounded-md bg-gradient-accent shadow-sm">
            <div className="absolute inset-[3px] rounded-[5px] border border-primary-foreground/30" />
            <div className="absolute inset-[7px] rounded-[2px] bg-primary-foreground/90" />
          </div>
          <span className="font-display text-base font-semibold tracking-tight">Lattice</span>
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hidden sm:inline">
            v1 · preview
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          {links.map((l) => {
            const active =
              l.to === "/" ? pathname === "/" : pathname.startsWith(l.to);
            return (
              <Link
                key={l.to}
                to={l.to}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm transition-colors",
                  active
                    ? "text-foreground bg-secondary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/concepts/new"
            className="hidden sm:inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors shadow-sm"
          >
            Start a concept
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
