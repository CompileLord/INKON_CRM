import { useEffect, useRef, type RefObject } from "react";
import { JournalMotion, type MotionDirection } from "../../lib/journals/JournalMotion";

export function useJournalSlideTransition<T extends HTMLElement>(
  contentKey: string | number | undefined,
  direction: MotionDirection,
  distancePixels: number,
  milliseconds: number,
): RefObject<T | null> {
  const elementRef = useRef<T | null>(null);
  const previousKeyRef = useRef<string | number | undefined>(contentKey);
  const animationRef = useRef<Animation | null>(null);

  useEffect(() => {
    if (previousKeyRef.current === contentKey) return;
    previousKeyRef.current = contentKey;
    animationRef.current?.cancel();
    animationRef.current = JournalMotion.slideIn(elementRef.current, direction, distancePixels, milliseconds);
  }, [contentKey, direction, distancePixels, milliseconds]);

  useEffect(
    () => () => {
      animationRef.current?.cancel();
    },
    [],
  );

  return elementRef;
}
