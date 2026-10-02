import {
  BRAND_COLORS,
  LOCKUP_VIEWBOX,
  LOCKUP_WIDTH,
  MARK_PATH,
  WORDMARK_PATH,
  WORDMARK_TRANSFORM,
} from "./artwork";

/** Inline vector artwork stays sharp, adapts to the surrounding text color, and needs no font. */
export function DistilLogo({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={compact ? "0 0 104 104" : LOCKUP_VIEWBOX}
      width={compact ? 28 : (28 * LOCKUP_WIDTH) / 104}
      height={28}
      role="img"
      aria-label="Distil logo"
      className={className}
      focusable="false"
    >
      <path
        d={MARK_PATH}
        transform={compact ? "translate(12 0)" : undefined}
        fill={BRAND_COLORS.cobalt}
      />
      {!compact && (
        <path
          d={WORDMARK_PATH}
          transform={WORDMARK_TRANSFORM}
          fill="currentColor"
          fillRule="evenodd"
        />
      )}
    </svg>
  );
}
