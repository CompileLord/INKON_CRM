interface CardSkeletonProps {
  rows?: number;
}

export function CardSkeleton({ rows = 3 }: CardSkeletonProps) {
  return (
    <div className="flex flex-col gap-3 w-full animate-pulse">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex flex-col gap-2 rounded-xl border border-border-warm bg-strip/50 p-4"
        >
          <div className="h-4 w-1/3 rounded bg-border-warm/70" />
          <div className="h-3 w-3/4 rounded bg-border-warm/50" />
          <div className="h-3 w-1/2 rounded bg-border-warm/30" />
        </div>
      ))}
    </div>
  );
}
