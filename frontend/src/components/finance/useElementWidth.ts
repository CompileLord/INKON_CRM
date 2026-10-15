import { useEffect, useRef, useState, type RefObject } from "react";

export function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const elementRef = useRef<T>(null);
  const [width, setWidth] = useState<number>(0);

  useEffect(() => {
    const element: T | null = elementRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer: ResizeObserver = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [elementRef, width];
}
