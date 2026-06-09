"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { classNames } from "@/lib/format";

interface Tab {
  href: string;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { href: "/", label: "Home", icon: "◎" },
  { href: "/news", label: "News", icon: "▤" },
  { href: "/good-news", label: "Good", icon: "☀" },
  { href: "/sports", label: "Sports", icon: "⚑" },
  { href: "/weather", label: "Weather", icon: "☁" },
  { href: "/bias", label: "Bias", icon: "⇄" },
  { href: "/entertainment", label: "Ent.", icon: "★" },
];

// Bottom tab bar (thumb-reachable) on mobile; horizontal top bar on desktop.
export function NavTabs() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* Desktop / tablet top nav */}
      <nav className="sticky top-0 z-40 hidden border-b border-[var(--border)] bg-[var(--background)]/90 backdrop-blur md:block">
        <div className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-3">
          <Link href="/" className="mr-4 text-lg font-bold tracking-tight">
            News<span className="text-[var(--accent)]">Scope</span>
          </Link>
          {TABS.slice(1).map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={classNames(
                "rounded-lg px-3 py-1.5 text-sm transition-colors",
                isActive(t.href)
                  ? "bg-[var(--surface-2)] text-[var(--accent)]"
                  : "text-[var(--muted)] hover:text-[var(--text)]",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border)] bg-[var(--surface)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="no-scrollbar flex overflow-x-auto">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={classNames(
                "flex min-w-[3.6rem] flex-1 flex-col items-center gap-0.5 py-2 text-[0.65rem]",
                isActive(t.href)
                  ? "text-[var(--accent)]"
                  : "text-[var(--muted)]",
              )}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
