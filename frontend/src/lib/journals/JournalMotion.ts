export type MotionDirection = "earlier" | "later";

export class JournalMotion {
  static readonly EASING: string = "cubic-bezier(0.16, 1, 0.3, 1)";
  static readonly SURFACE_MILLISECONDS: number = 200;
  static readonly FEEDBACK_MILLISECONDS: number = 150;
  static readonly EXIT_MILLISECONDS: number = 100;
  static readonly PERIOD_SLIDE_PIXELS: number = 8;
  static readonly LESSON_SLIDE_PIXELS: number = 6;
  static readonly POPOVER_SCALE: number = 0.96;

  static prefersReducedMotion(): boolean {
    return typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;
  }

  static sign(direction: MotionDirection): number {
    return direction === "later" ? 1 : -1;
  }

  static slideKeyframes(direction: MotionDirection, distancePixels: number): Keyframe[] {
    if (JournalMotion.prefersReducedMotion()) return [{ opacity: 0 }, { opacity: 1 }];
    const offset: number = JournalMotion.sign(direction) * distancePixels;
    return [
      { opacity: 0, transform: `translateX(${offset}px)` },
      { opacity: 1, transform: "translateX(0)" },
    ];
  }

  static settleKeyframes(): Keyframe[] {
    if (JournalMotion.prefersReducedMotion()) return [{ opacity: 0.6 }, { opacity: 1 }];
    return [
      { transform: `scale(${JournalMotion.POPOVER_SCALE})` },
      { transform: "scale(1)" },
    ];
  }

  static popoverKeyframes(): Keyframe[] {
    if (JournalMotion.prefersReducedMotion()) return [{ opacity: 0 }, { opacity: 1 }];
    return [
      { opacity: 0, transform: `scale(${JournalMotion.POPOVER_SCALE})` },
      { opacity: 1, transform: "scale(1)" },
    ];
  }

  static run(element: Element | null, keyframes: Keyframe[], milliseconds: number): Animation | null {
    if (!element || typeof element.animate !== "function") return null;
    return element.animate(keyframes, { duration: milliseconds, easing: JournalMotion.EASING });
  }

  static slideIn(element: Element | null, direction: MotionDirection, distancePixels: number, milliseconds: number): Animation | null {
    return JournalMotion.run(element, JournalMotion.slideKeyframes(direction, distancePixels), milliseconds);
  }

  static settle(element: Element | null): Animation | null {
    return JournalMotion.run(element, JournalMotion.settleKeyframes(), JournalMotion.FEEDBACK_MILLISECONDS);
  }

  static popIn(element: HTMLElement | null, transformOrigin: string): Animation | null {
    if (!element) return null;
    element.style.transformOrigin = transformOrigin;
    return JournalMotion.run(element, JournalMotion.popoverKeyframes(), JournalMotion.FEEDBACK_MILLISECONDS);
  }

  static exitGhost(element: HTMLElement | null): void {
    if (!element || typeof element.animate !== "function" || !element.isConnected) return;
    const ghost: HTMLElement = element.cloneNode(true) as HTMLElement;
    const bounds: DOMRect = element.getBoundingClientRect();
    ghost.removeAttribute("id");
    ghost.setAttribute("aria-hidden", "true");
    ghost.setAttribute("inert", "");
    ghost.style.pointerEvents = "none";
    ghost.style.position = "fixed";
    ghost.style.left = `${bounds.left}px`;
    ghost.style.top = `${bounds.top}px`;
    ghost.style.width = `${bounds.width}px`;
    ghost.style.margin = "0";
    document.body.appendChild(ghost);
    const keyframes: Keyframe[] = [...JournalMotion.popoverKeyframes()].reverse();
    const animation: Animation | null = JournalMotion.run(ghost, keyframes, JournalMotion.EXIT_MILLISECONDS);
    if (!animation) {
      ghost.remove();
      return;
    }
    animation.onfinish = () => ghost.remove();
    animation.oncancel = () => ghost.remove();
  }
}
