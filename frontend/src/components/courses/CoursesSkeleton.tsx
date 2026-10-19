interface CoursesSkeletonProps {
  mode: "grid" | "list";
  showMentorColumn: boolean;
}

export function CoursesSkeleton({ mode, showMentorColumn }: CoursesSkeletonProps) {
  if (mode === "grid") {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-4">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 motion-safe:animate-pulse">
            <div className="flex items-start gap-3">
              <div className="size-10 shrink-0 rounded-[10px] bg-border" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="h-5 w-3/4 rounded bg-border" />
                <div className="h-4 w-1/2 rounded bg-border" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="h-4 w-2/3 rounded bg-border" />
              <div className="h-4 w-3/5 rounded bg-border" />
              <div className="h-4 w-1/3 rounded bg-border" />
            </div>
            <div className="border-t border-border pt-3"><div className="h-5 w-28 rounded bg-border" /></div>
          </div>
        ))}
      </div>
    );
  }
  const columns: string = showMentorColumn
    ? "md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_7.5rem]"
    : "md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_7.5rem]";
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-1">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="px-3 py-3 motion-safe:animate-pulse">
          <div className={`grid items-center gap-x-4 gap-y-2 ${columns}`}>
            <div className="flex items-center gap-3">
              <div className="size-10 shrink-0 rounded-[10px] bg-border" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="h-4 w-3/4 rounded bg-border" />
                <div className="h-3 w-1/3 rounded bg-border" />
              </div>
            </div>
            {showMentorColumn && <div className="hidden h-4 w-2/3 rounded bg-border md:block" />}
            <div className="hidden h-4 w-3/4 rounded bg-border md:block" />
            <div className="hidden h-4 w-20 rounded bg-border md:ml-auto md:block" />
          </div>
        </div>
      ))}
    </div>
  );
}
