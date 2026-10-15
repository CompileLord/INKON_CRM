import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";

const HOVER_DELAY_MILLISECONDS: number = 500;
const VIEWPORT_MARGIN_PIXELS: number = 8;
const ANCHOR_GAP_PIXELS: number = 4;

interface InfoTooltipProps {
  label: string;
  children: ReactNode;
}

interface TooltipPosition {
  left: number;
  top: number;
  transformOrigin: string;
}

export function InfoTooltip({ label, children }: InfoTooltipProps) {
  const tooltipId: string = useId();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerPressed = useRef<boolean>(false);

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
    const closeOnOutsidePress = (event: PointerEvent): void => {
      const target: Node = event.target as Node;
      if (!buttonRef.current?.contains(target) && !tooltipRef.current?.contains(target)) close();
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePress);
    };
  }, [isOpen, close]);

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current || !tooltipRef.current) return;
    const anchor: DOMRect = buttonRef.current.getBoundingClientRect();
    const bubble: DOMRect = tooltipRef.current.getBoundingClientRect();
    const maximumLeft: number = window.innerWidth - bubble.width - VIEWPORT_MARGIN_PIXELS;
    const left: number = Math.max(VIEWPORT_MARGIN_PIXELS, Math.min(anchor.left + anchor.width / 2 - bubble.width / 2, maximumLeft));
    const fitsBelow: boolean = anchor.bottom + ANCHOR_GAP_PIXELS + bubble.height <= window.innerHeight - VIEWPORT_MARGIN_PIXELS;
    const top: number = fitsBelow ? anchor.bottom + ANCHOR_GAP_PIXELS : Math.max(VIEWPORT_MARGIN_PIXELS, anchor.top - ANCHOR_GAP_PIXELS - bubble.height);
    const originX: number = anchor.left + anchor.width / 2 - left;
    setPosition({ left, top, transformOrigin: `${originX}px ${fitsBelow ? 0 : bubble.height}px` });
  }, [isOpen]);

  return (
    <span className="relative inline-flex align-middle">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-describedby={isOpen ? tooltipId : undefined}
        aria-expanded={isOpen}
        onPointerDown={() => {
          pointerPressed.current = true;
        }}
        onPointerEnter={(event) => {
          if (event.pointerType !== "mouse" || isOpen) return;
          cancelHover();
          hoverTimer.current = setTimeout(() => setIsOpen(true), HOVER_DELAY_MILLISECONDS);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") close();
        }}
        onFocus={() => {
          if (!pointerPressed.current) setIsOpen(true);
        }}
        onBlur={close}
        onClick={() => {
          pointerPressed.current = false;
          cancelHover();
          if (isOpen) close();
          else setIsOpen(true);
        }}
        className="-m-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info size={16} aria-hidden="true" />
      </button>
      {isOpen && (
        <span
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          style={position ? { left: position.left, top: position.top, transformOrigin: position.transformOrigin } : { left: 0, top: 0, visibility: "hidden" }}
          className="fixed z-80 w-max max-w-[min(20rem,calc(100vw-16px))] rounded-[10px] border border-border-warm bg-card px-3 py-2 text-left text-sm font-normal text-ink shadow-lg transition-opacity duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] starting:opacity-0 motion-safe:transition-[opacity,transform] motion-safe:starting:scale-[0.96]"
        >
          {children}
        </span>
      )}
    </span>
  );
}
