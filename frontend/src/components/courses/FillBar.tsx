import { useEffect, useState } from "react";

interface FillBarProps {
  rate: number;
  className?: string;
  heightClass?: string;
}

function getFillClass(rate: number): string {
  if (rate > 95) return "bg-destructive";
  if (rate >= 70) return "bg-accent";
  return "bg-success";
}

export function FillBar({ rate, className = "", heightClass = "h-1.5" }: FillBarProps) {
  const clamped = Math.min(100, Math.max(0, rate));
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setWidth(clamped));
    return () => cancelAnimationFrame(raf);
  }, [clamped]);

  return (
    <div className={`overflow-hidden rounded-full bg-beige ${heightClass} ${className}`}>
      <div
        className={`h-full rounded-full ${getFillClass(clamped)} transition-[width] duration-[400ms] ease-out motion-reduce:transition-none`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
