import { useCallback, useRef, useState, type KeyboardEvent } from "react";

export interface ProfileTabItem<T extends string = string> {
  id: T;
  label: string;
}

export interface ProfileTabsProps<T extends string = string> {
  tabs: ProfileTabItem<T>[];
  activeTab: T;
  onTabChange: (tabId: T) => void;
  ariaLabel?: string;
}

export function ProfileTabs<T extends string = string>({
  tabs,
  activeTab,
  onTabChange,
  ariaLabel,
}: ProfileTabsProps<T>) {
  const [focusedTab, setFocusedTab] = useState<T>(activeTab);
  const rovingTab = tabs.some((tab) => tab.id === focusedTab) ? focusedTab : activeTab;
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const tablistRef = useRef<HTMLDivElement | null>(null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      let nextIndex: number | null = null;

      if (event.key === "ArrowRight") {
        event.preventDefault();
        nextIndex = (currentIndex + 1) % tabs.length;
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      } else if (event.key === "Home") {
        event.preventDefault();
        nextIndex = 0;
      } else if (event.key === "End") {
        event.preventDefault();
        nextIndex = tabs.length - 1;
      }

      if (nextIndex !== null) {
        const targetButton = tabsRef.current[nextIndex];
        if (targetButton) {
          setFocusedTab(tabs[nextIndex].id);
          targetButton.focus();
          const tablist = tablistRef.current;
          if (tablist) {
            const tablistBounds = tablist.getBoundingClientRect();
            const targetBounds = targetButton.getBoundingClientRect();
            if (targetBounds.left < tablistBounds.left) {
              tablist.scrollLeft -= tablistBounds.left - targetBounds.left;
            } else if (targetBounds.right > tablistBounds.right) {
              tablist.scrollLeft += targetBounds.right - tablistBounds.right;
            }
          }
        }
      }
    },
    [tabs],
  );

  return (
    <div
      ref={tablistRef}
      role="tablist"
      aria-label={ariaLabel}
      className="flex w-full min-w-0 max-w-full items-center gap-1.5 overflow-x-auto border-b border-border-warm pb-3"
    >
      {tabs.map((tab, index) => {
        const isSelected = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            ref={(element) => {
              tabsRef.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`profile-tab-${tab.id}`}
            aria-controls={`profile-tabpanel-${tab.id}`}
            aria-selected={isSelected}
            tabIndex={tab.id === rovingTab ? 0 : -1}
            onFocus={() => setFocusedTab(tab.id)}
            onClick={() => {
              setFocusedTab(tab.id);
              onTabChange(tab.id);
            }}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={[
              "min-h-11 shrink-0 rounded-[10px] px-4 py-2 text-sm font-medium motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nav focus-visible:ring-offset-1 motion-safe:active:scale-[0.96]",
              isSelected
                ? "bg-beige font-semibold text-nav shadow-xs"
                : "text-nav hover:bg-strip hover:text-ink",
            ].join(" ")}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
