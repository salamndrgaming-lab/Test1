"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { classNames } from "@/lib/format";

type IconName =
  | "home"
  | "news"
  | "good"
  | "sports"
  | "weather"
  | "bias"
  | "ent"
  | "markets"
  | "settings";

interface Tab {
  href: string;
  label: string;
  icon: IconName;
}

const TABS: Tab[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/news", label: "News", icon: "news" },
  { href: "/good-news", label: "Good", icon: "good" },
  { href: "/sports", label: "Sports", icon: "sports" },
  { href: "/weather", label: "Weather", icon: "weather" },
  { href: "/bias", label: "Bias", icon: "bias" },
  { href: "/entertainment", label: "Ent.", icon: "ent" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

function Icon({ name, className }: { name: IconName; className?: string }) {
  const common = {
    className,
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
        </svg>
      );
    case "news":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 8h7M7 12h10M7 16h10" />
        </svg>
      );
    case "good":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
        </svg>
      );
    case "sports":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 0 0 0 18M3.5 8.5h17M3.5 15.5h17" />
        </svg>
      );
    case "weather":
      return (
        <svg {...common}>
          <path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A3.5 3.5 0 0 1 17 18Z" />
        </svg>
      );
    case "bias":
      return (
        <svg {...common}>
          <path d="M4 17 9 7l5 10M14 7l6 10" />
          <path d="M3 21h18" />
        </svg>
      );
    case "ent":
      return (
        <svg {...common}>
          <path d="m12 3 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8 6.8 19l1-5.8-4.2-4.1 5.8-.8Z" />
        </svg>
      );
    case "markets":
      return (
        <svg {...common}>
          <path d="M4 16l4-5 3 3 5-7" />
          <path d="M14 7h3v3" />
          <path d="M3 21h18" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M18.4 18.4l-2.1-2.1M7.7 7.7 5.6 5.6" />
        </svg>
      );
  }
}

export function NavTabs() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* Desktop / tablet top nav */}
      <nav className="sticky top-0 z-40 hidden border-b border-[var(--border-soft)] bg-[#0a0d13]/80 backdrop-blur-xl md:block">
        <div className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-3">
          <Link
            href="/"
            className="mr-3 flex items-center gap-2 text-lg font-bold tracking-tight"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-slate-950">
              <Icon name="bias" className="h-4 w-4" />
            </span>
            News<span className="gradient-text">Scope</span>
          </Link>
          {TABS.slice(1).map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={classNames(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                isActive(t.href)
                  ? "bg-[var(--surface-2)] text-[var(--accent)]"
                  : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border-soft)] bg-[#141925]/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <div className="no-scrollbar flex overflow-x-auto px-1">
          {TABS.map((t) => {
            const active = isActive(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={classNames(
                  "flex min-w-[3.4rem] flex-1 flex-col items-center gap-1 py-2 text-[0.62rem] font-medium transition-colors",
                  active ? "text-[var(--accent)]" : "text-[var(--muted-2)]",
                )}
              >
                <span
                  className={classNames(
                    "flex h-7 w-9 items-center justify-center rounded-full transition-colors",
                    active && "bg-sky-400/15",
                  )}
                >
                  <Icon name={t.icon} className="h-[18px] w-[18px]" />
                </span>
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
