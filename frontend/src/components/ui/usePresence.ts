import { useCallback, useLayoutEffect, useRef, useState } from "react";

export interface PresenceState {
  present: boolean;
  onOpenChangeComplete: (open: boolean) => void;
}

export function usePresence(open: boolean): PresenceState {
  const [mounted, setMounted] = useState<boolean>(open);
  const openRef = useRef<boolean>(open);
  openRef.current = open;
  if (open && !mounted) setMounted(true);
  const onOpenChangeComplete = useCallback((isOpen: boolean): void => {
    if (!isOpen && !openRef.current) setMounted(false);
  }, []);
  return { present: open || mounted, onOpenChangeComplete };
}

export function useEntryArmed(open: boolean): boolean {
  const [armed, setArmed] = useState<boolean>(false);
  useLayoutEffect(() => {
    setArmed(true);
  }, []);
  return open && armed;
}

export function useHeldWhileClosing<T>(value: T, open: boolean): T {
  const held = useRef<T>(value);
  if (open) held.current = value;
  return held.current;
}
