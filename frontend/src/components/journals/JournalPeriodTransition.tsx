import React, { useState } from "react";
import { useJournalSlideTransition } from "./useJournalSlideTransition";
import { JournalMotion, type MotionDirection } from "../../lib/journals/JournalMotion";

interface JournalPeriodTransitionProps {
  displayedJournalId: number | undefined;
  displayedPeriodStart: string | undefined;
  switching: boolean;
  children: React.ReactNode;
}

interface DisplayedTrack {
  journalId: number | undefined;
  periodStart: string | undefined;
  direction: MotionDirection;
}

export const JournalPeriodTransition: React.FC<JournalPeriodTransitionProps> = ({
  displayedJournalId,
  displayedPeriodStart,
  switching,
  children,
}) => {
  const [track, setTrack] = useState<DisplayedTrack>({
    journalId: displayedJournalId,
    periodStart: displayedPeriodStart,
    direction: "later",
  });
  if (displayedJournalId !== undefined && displayedJournalId !== track.journalId) {
    setTrack({
      journalId: displayedJournalId,
      periodStart: displayedPeriodStart,
      direction:
        displayedPeriodStart !== undefined && track.periodStart !== undefined && displayedPeriodStart < track.periodStart
          ? "earlier"
          : "later",
    });
  }
  const elementRef = useJournalSlideTransition<HTMLDivElement>(
    track.journalId,
    track.direction,
    JournalMotion.PERIOD_SLIDE_PIXELS,
    JournalMotion.SURFACE_MILLISECONDS,
  );

  return (
    <div
      ref={elementRef}
      data-testid="journal-period-transition"
      data-direction={track.direction}
      data-journal={track.journalId}
      aria-busy={switching}
      inert={switching}
      className={`min-w-0 motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-out ${switching ? "opacity-60" : ""}`}
    >
      {children}
    </div>
  );
};
