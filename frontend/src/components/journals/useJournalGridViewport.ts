import { useEffect, useState, type RefObject } from "react";

export interface JournalGridViewport {
  canScrollLeft: boolean;
  canScrollRight: boolean;
  maxHeightPx: number | null;
}

const MINIMUM_REGION_HEIGHT_PX = 320;
const BOTTOM_MARGIN_PX = 24;
const SCROLL_EDGE_TOLERANCE_PX = 1;

export function useJournalGridViewport(regionRef: RefObject<HTMLDivElement | null>): JournalGridViewport {
  const [viewport, setViewport] = useState<JournalGridViewport>({
    canScrollLeft: false,
    canScrollRight: false,
    maxHeightPx: null,
  });

  useEffect(() => {
    const region: HTMLDivElement | null = regionRef.current;
    if (!region) return undefined;

    const measure = (): void => {
      const canScrollLeft: boolean = region.scrollLeft > SCROLL_EDGE_TOLERANCE_PX;
      const canScrollRight: boolean =
        region.scrollLeft + region.clientWidth < region.scrollWidth - SCROLL_EDGE_TOLERANCE_PX;
      const documentTop: number = region.getBoundingClientRect().top + window.scrollY;
      const maxHeightPx: number = Math.max(
        MINIMUM_REGION_HEIGHT_PX,
        Math.floor(window.innerHeight - documentTop - BOTTOM_MARGIN_PX),
      );
      setViewport((previous) =>
        previous.canScrollLeft === canScrollLeft &&
        previous.canScrollRight === canScrollRight &&
        previous.maxHeightPx === maxHeightPx
          ? previous
          : { canScrollLeft, canScrollRight, maxHeightPx },
      );
    };

    const frameId: number = requestAnimationFrame(measure);
    region.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const observer: ResizeObserver | null = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(region);
    observer?.observe(document.body);
    if (region.firstElementChild) observer?.observe(region.firstElementChild);

    return () => {
      cancelAnimationFrame(frameId);
      region.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [regionRef]);

  return viewport;
}
