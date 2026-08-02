interface PersonAvatarProps {
  firstName: string;
  lastName: string;
  photoUrl?: string;
  size?: number;
}

const AVATAR_PALETTE = [
  "bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300",
  "bg-beige text-maroon dark:bg-amber-950/70 dark:text-amber-300",
  "bg-green-100 text-green-700 dark:bg-green-950/70 dark:text-green-300",
  "bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-950/70 dark:text-orange-300",
  "bg-pink-100 text-pink-700 dark:bg-pink-950/70 dark:text-pink-300",
];

function getAvatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

export function PersonAvatar({ firstName, lastName, photoUrl, size = 32 }: PersonAvatarProps) {
  const dimensionStyle = { width: size, height: size };

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={`${firstName} ${lastName}`}
        style={dimensionStyle}
        className="shrink-0 rounded-full object-cover ring-1 ring-black/5 dark:ring-white/10 shadow-xs"
      />
    );
  }

  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
  const colorClass = getAvatarColor(firstName + lastName);

  return (
    <div
      style={{ ...dimensionStyle, fontSize: Math.round(size * 0.4) }}
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ring-1 ring-black/5 dark:ring-white/10 shadow-xs ${colorClass}`}
    >
      {initials}
    </div>
  );
}
