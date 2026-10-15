import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JournalMotion } from "./JournalMotion";

function stubReducedMotion(reduced: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: query.includes("prefers-reduced-motion") ? reduced : false, addEventListener: () => {}, removeEventListener: () => {} }),
  });
}

describe("JournalMotion", () => {
  beforeEach(() => stubReducedMotion(false));
  afterEach(() => Reflect.deleteProperty(HTMLElement.prototype, "animate"));

  it("slides by the requested distance in the direction of travel and stays on transform and opacity", () => {
    const later = JournalMotion.slideKeyframes("later", 8);
    const earlier = JournalMotion.slideKeyframes("earlier", 8);
    expect(later[0]).toEqual({ opacity: 0, transform: "translateX(8px)" });
    expect(earlier[0]).toEqual({ opacity: 0, transform: "translateX(-8px)" });
    for (const frame of [...later, ...earlier, ...JournalMotion.popoverKeyframes(), ...JournalMotion.settleKeyframes()]) {
      expect(Object.keys(frame).every((key) => key === "opacity" || key === "transform")).toBe(true);
    }
  });

  it("removes every spatial movement under reduced motion and keeps an opacity change", () => {
    stubReducedMotion(true);
    expect(JournalMotion.slideKeyframes("later", 8)).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(JournalMotion.popoverKeyframes()).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(JournalMotion.settleKeyframes().every((frame) => frame.transform === undefined)).toBe(true);
  });

  it("uses the arrival easing and only the 150ms, 200ms and 100ms exit durations", () => {
    expect(JournalMotion.EASING).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
    expect([JournalMotion.FEEDBACK_MILLISECONDS, JournalMotion.SURFACE_MILLISECONDS, JournalMotion.EXIT_MILLISECONDS]).toEqual([150, 200, 100]);
    expect(JournalMotion.EXIT_MILLISECONDS).toBeLessThan(JournalMotion.FEEDBACK_MILLISECONDS);
  });

  it("does nothing, and never throws, where the Web Animations API is unavailable", () => {
    const element = document.createElement("div");
    expect(JournalMotion.slideIn(element, "later", 8, 200)).toBeNull();
    expect(JournalMotion.settle(element)).toBeNull();
    expect(() => JournalMotion.exitGhost(element)).not.toThrow();
  });

  it("pops a popover in from its anchor origin and leaves a faster inert ghost that removes itself", () => {
    const animate = vi.fn<(...animationArguments: [Keyframe[], KeyframeAnimationOptions]) => { onfinish: null | (() => void); oncancel: null }>(() => ({ onfinish: null, oncancel: null }));
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, writable: true, value: animate });
    const element = document.createElement("div");
    element.id = "popover";
    document.body.appendChild(element);
    JournalMotion.popIn(element, "20px top");
    expect(element.style.transformOrigin).toBe("20px top");
    expect(animate.mock.calls[0][1]).toMatchObject({ duration: 150, easing: JournalMotion.EASING });

    JournalMotion.exitGhost(element);
    const ghost = document.body.querySelector('[aria-hidden="true"][inert]') as HTMLElement;
    expect(ghost).not.toBeNull();
    expect(ghost.id).toBe("");
    expect(ghost.style.pointerEvents).toBe("none");
    expect(animate.mock.calls[1][1]).toMatchObject({ duration: 100 });
    const exitFrames = animate.mock.calls[1][0];
    expect(exitFrames[0].opacity).toBe(1);
    expect(exitFrames[exitFrames.length - 1].opacity).toBe(0);
    const animation = (animate.mock.results[1].value as { onfinish: () => void });
    animation.onfinish();
    expect(document.body.querySelector('[inert]')).toBeNull();
    element.remove();
  });
});
