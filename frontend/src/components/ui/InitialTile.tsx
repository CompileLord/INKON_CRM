const TILE_CLASSES: readonly string[] = [
  "bg-series-1/20",
  "bg-series-2/20",
  "bg-series-3/20",
  "bg-series-4/20",
  "bg-series-5/20",
  "bg-series-6/20",
  "bg-series-7/20",
  "bg-series-8/20",
];

const SIZE_CLASSES: Record<"sm" | "md" | "lg", string> = {
  sm: "size-8 rounded-[8px] text-sm",
  md: "size-10 rounded-[10px] text-base",
  lg: "size-14 rounded-[12px] text-xl",
};

export class InitialTileColors {
  static classFor(name: string): string {
    let hash: number = 0;
    for (const character of name) hash = (hash * 31 + character.codePointAt(0)!) % 2147483647;
    return TILE_CLASSES[hash % TILE_CLASSES.length];
  }

  static initialOf(name: string): string {
    const trimmed: string = name.trim();
    return trimmed === "" ? "?" : Array.from(trimmed)[0].toLocaleUpperCase();
  }
}

interface InitialTileProps {
  name: string;
  size?: "sm" | "md" | "lg";
}

export function InitialTile({ name, size = "md" }: InitialTileProps) {
  return (
    <span aria-hidden="true" data-initial-tile className={`inline-flex shrink-0 select-none items-center justify-center font-semibold text-ink ${SIZE_CLASSES[size]} ${InitialTileColors.classFor(name)}`}>
      {InitialTileColors.initialOf(name)}
    </span>
  );
}
