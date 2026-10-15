import React, { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface JournalAnchoredOverlayProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  width: number;
  role: "menu" | "dialog" | "none";
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  ariaLabel?: string;
  className?: string;
  onClose: (reason: OverlayCloseReason) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  children: ReactNode;
}

export type OverlayCloseReason = "escape" | "outside";

interface OverlayPosition {
  top: number;
  left: number;
}

const VIEWPORT_MARGIN_PX = 8;
const ANCHOR_GAP_PX = 4;

export const JournalAnchoredOverlay: React.FC<JournalAnchoredOverlayProps> = ({
  anchorRef,
  width,
  role,
  initialFocusRef,
  ariaLabel,
  className = "",
  onClose,
  onKeyDown,
  children,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<OverlayPosition | null>(null);

  useLayoutEffect(() => {
    const anchor: HTMLElement | null = anchorRef.current;
    if (!anchor) return;
    const anchorBounds: DOMRect = anchor.getBoundingClientRect();
    const overlayHeight: number = overlayRef.current?.offsetHeight ?? 40;
    let top: number = anchorBounds.bottom + ANCHOR_GAP_PX;
    if (top + overlayHeight > window.innerHeight - VIEWPORT_MARGIN_PX) {
      top = Math.max(VIEWPORT_MARGIN_PX, anchorBounds.top - overlayHeight - ANCHOR_GAP_PX);
    }
    const centered: number = anchorBounds.left + anchorBounds.width / 2 - width / 2;
    const left: number = Math.min(
      Math.max(VIEWPORT_MARGIN_PX, centered),
      window.innerWidth - width - VIEWPORT_MARGIN_PX,
    );
    setPosition({ top, left });
  }, [anchorRef, width]);

  useEffect(() => {
    if (position) initialFocusRef?.current?.focus();
  }, [position, initialFocusRef]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent): void => {
      const target: Node = event.target as Node;
      if (overlayRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose("outside");
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose("escape");
        return;
      }
      if (event.key === "Tab" && overlayRef.current?.contains(document.activeElement)) onClose("escape");
    };
    const handleScroll = (event: Event): void => {
      if (event.target instanceof Node && overlayRef.current?.contains(event.target)) return;
      onClose("outside");
    };
    const handleResize = (): void => onClose("outside");
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      ref={overlayRef}
      role={role}
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      style={{
        position: "fixed",
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        width,
        visibility: position ? "visible" : "hidden",
      }}
      className={`z-50 rounded-2xl border border-border bg-card text-ink shadow-lg ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
};
