import { useEffect, useState, type RefObject } from "react";

export interface JournalGridViewport {
  canScrollLeft: boolean;
  canScrollRight: boolean;
  overflows: boolean;
}

interface GridScrollElements {
  body: RefObject<HTMLDivElement | null>;
  header: RefObject<HTMLDivElement | null>;
  bar: RefObject<HTMLDivElement | null>;
}

const SCROLL_EDGE_TOLERANCE_PX = 1;

export function useJournalGridViewport({ body, header, bar }: GridScrollElements): JournalGridViewport {
  const [viewport, setViewport] = useState<JournalGridViewport>({
    canScrollLeft: false,
    canScrollRight: false,
    overflows: false,
  });

  useEffect(() => {
    const bodyElement: HTMLDivElement | null = body.current;
    const headerElement: HTMLDivElement | null = header.current;
    const barElement: HTMLDivElement | null = bar.current;
    if (!bodyElement || !headerElement || !barElement) return undefined;
    const scrollers: HTMLDivElement[] = [bodyElement, headerElement, barElement];
    let syncing = false;

    const measure = (): void => {
      const canScrollLeft: boolean = bodyElement.scrollLeft > SCROLL_EDGE_TOLERANCE_PX;
      const canScrollRight: boolean =
        bodyElement.scrollLeft + bodyElement.clientWidth < bodyElement.scrollWidth - SCROLL_EDGE_TOLERANCE_PX;
      const overflows: boolean = bodyElement.scrollWidth > bodyElement.clientWidth + SCROLL_EDGE_TOLERANCE_PX;
      setViewport((previous) =>
        previous.canScrollLeft === canScrollLeft && previous.canScrollRight === canScrollRight && previous.overflows === overflows
          ? previous
          : { canScrollLeft, canScrollRight, overflows },
      );
    };

    const synchronize = (source: HTMLDivElement): void => {
      if (syncing) return;
      syncing = true;
      scrollers.forEach((target) => {
        if (target !== source && Math.abs(target.scrollLeft - source.scrollLeft) > 0.5) target.scrollLeft = source.scrollLeft;
      });
      syncing = false;
      measure();
    };

    const listeners: Array<[HTMLDivElement, () => void]> = scrollers.map((element) => [element, () => synchronize(element)]);
    listeners.forEach(([element, listener]) => element.addEventListener("scroll", listener, { passive: true }));
    const frameId: number = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    const observer: ResizeObserver | null = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(bodyElement);
    if (bodyElement.firstElementChild) observer?.observe(bodyElement.firstElementChild);

    return () => {
      cancelAnimationFrame(frameId);
      listeners.forEach(([element, listener]) => element.removeEventListener("scroll", listener));
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [body, header, bar]);

  return viewport;
}
