/** Five blocks representing roughly two hours of winter sun each. */
export function SunBlocks({ hours, className = "" }: { hours: number; className?: string }) {
  const filled = Math.max(0, Math.min(5, Math.round(hours / 2)));
  return (
    <span className={`font-mono ${className}`} aria-label={`${hours.toFixed(1)} hours of winter sun`}>
      <span className="text-sun">{"■".repeat(filled)}</span>
      <span className="text-per-200">{"■".repeat(5 - filled)}</span>
    </span>
  );
}
