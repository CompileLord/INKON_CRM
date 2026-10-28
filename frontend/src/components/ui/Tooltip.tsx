import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const HOVER_DELAY_MILLISECONDS: number = 300;
const VIEWPORT_MARGIN_PIXELS: number = 8;
const ANCHOR_GAP_PIXELS: number = 6;

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  focusable?: boolean;
  className?: string;
}

interface TooltipPosition {
  left: number;
  top: number;
  transformOrigin: string;
}

export function Tooltip({ content, children, focusable = false, className = "" }: TooltipProps) {
  const tooltipId: string = useId();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHover = useCallback((): void => {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }, []);

  const close = useCallback((): void => {
    cancelHover();
    setIsOpen(false);
    setPosition(null);
  }, [cancelHover]);

  useEffect(() => cancelHover, [cancelHover]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", close, true);
    };
  }, [isOpen, close]);

  useLayoutEffect(() => {
    if (!isOpen || !anchorRef.current || !bubbleRef.current) return;
    const anchor: DOMRect = anchorRef.current.getBoundingClientRect();
    const bubble: DOMRect = bubbleRef.current.getBoundingClientRect();
    const maxLeft: number = window.innerWidth - bubble.width - VIEWPORT_MARGIN_PIXELS;
    const left: number = Math.max(VIEWPORT_MARGIN_PIXELS, Math.min(anchor.left + anchor.width / 2 - bubble.width / 2, maxLeft));
    const fitsAbove: boolean = anchor.top - ANCHOR_GAP_PIXELS - bubble.height >= VIEWPORT_MARGIN_PIXELS;
    const top: number = fitsAbove ? anchor.top - ANCHOR_GAP_PIXELS - bubble.height : anchor.bottom + ANCHOR_GAP_PIXELS;
    const originX: number = anchor.left + anchor.width / 2 - left;
    setPosition({ left, top, transformOrigin: `${originX}px ${fitsAbove ? bubble.height : 0}px` });
  }, [isOpen]);

  return (
    <span
      ref={anchorRef}
      tabIndex={focusable ? 0 : undefined}
      aria-describedby={isOpen ? tooltipId : undefined}
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse" || isOpen) return;
        cancelHover();
        hoverTimer.current = setTimeout(() => setIsOpen(true), HOVER_DELAY_MILLISECONDS);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") close();
      }}
      onFocus={() => setIsOpen(true)}
      onBlur={close}
      onClick={() => {
        if (focusable) setIsOpen(true);
      }}
      className={["relative inline-flex max-w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-[6px]", className].join(" ")}
    >
      {children}
      {isOpen && (
        <span
          ref={bubbleRef}
          id={tooltipId}
          role="tooltip"
          style={position ? { left: position.left, top: position.top, transformOrigin: position.transformOrigin } : { left: 0, top: 0, visibility: "hidden" }}
          className="pointer-events-none fixed z-80 w-max max-w-[min(20rem,calc(100vw-16px))] rounded-[10px] border border-border-warm bg-card px-3 py-2 text-left text-sm font-normal text-ink shadow-lg motion-safe:duration-150 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)] starting:opacity-0 motion-safe:transition-[opacity,transform] motion-safe:starting:scale-[0.96]"
        >
          {content}
        </span>
      )}
    </span>
  );
}
