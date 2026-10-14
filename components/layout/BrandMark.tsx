/**
 * The NewsScope mark: a lens split into left / center / right of the spectrum.
 * Reads as a "scope" and as the political spectrum, and stays legible small.
 */
export function BrandMark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="NewsScope"
    >
      <defs>
        <clipPath id="bm-lens">
          <circle cx="256" cy="256" r="148" />
        </clipPath>
        <linearGradient id="bm-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#818cf8" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="114" fill="#0a0d13" />
      <g clipPath="url(#bm-lens)">
        <rect x="80" y="80" width="130" height="352" fill="#2563eb" />
        <rect x="210" y="80" width="92" height="352" fill="#e7ecf3" />
        <rect x="302" y="80" width="140" height="352" fill="#dc2626" />
      </g>
      <circle
        cx="256"
        cy="256"
        r="148"
        fill="none"
        stroke="url(#bm-ring)"
        strokeWidth="24"
      />
    </svg>
  );
}
