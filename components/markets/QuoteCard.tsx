import type { Quote } from "@/types";
import { Sparkline } from "./Sparkline";
import { classNames } from "@/lib/format";

function fmtPrice(q: Quote): string {
  const opts: Intl.NumberFormatOptions =
    q.price >= 1000
      ? { maximumFractionDigits: 0 }
      : q.price >= 1
        ? { maximumFractionDigits: 2 }
        : { maximumFractionDigits: 4 };
  return q.price.toLocaleString("en-US", opts);
}

export function QuoteCard({ quote }: { quote: Quote }) {
  const up = quote.changePct >= 0;
  return (
    <div className="card card-hover flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate font-semibold">{quote.name}</p>
        <p className="text-xs text-[var(--muted-2)]">{quote.symbol}</p>
      </div>
      {quote.spark && quote.spark.length > 1 && (
        <Sparkline data={quote.spark} />
      )}
      <div className="text-right">
        <p className="font-semibold tabular-nums">{fmtPrice(quote)}</p>
        <p
          className={classNames(
            "text-xs font-medium tabular-nums",
            up ? "text-good" : "text-bad",
          )}
        >
          {up ? "▲" : "▼"} {Math.abs(quote.changePct).toFixed(2)}%
        </p>
      </div>
    </div>
  );
}
