import type { JSX } from "react";
import { useState } from "react";
import { InitialTile } from "../ui/InitialTile";
import { resolveMediaUrl } from "../../lib/users/media";

interface CourseThumbProps {
  title: string;
  photoPath: string | null;
  size?: "sm" | "md" | "lg";
}

const PHOTO_SIZE_CLASSES: Record<"sm" | "md" | "lg", string> = {
  sm: "size-8 rounded-[8px]",
  md: "size-10 rounded-[10px]",
  lg: "size-14 rounded-xl",
};

export function CourseThumb({ title, photoPath, size = "lg" }: CourseThumbProps): JSX.Element {
  const [hasImageFailed, setHasImageFailed] = useState<boolean>(false);
  const photoUrl: string | null = !hasImageFailed && photoPath ? resolveMediaUrl(photoPath) : null;
  if (photoUrl === null) return <InitialTile name={title} size={size} />;
  return (
    <img
      src={photoUrl}
      alt=""
      onError={() => setHasImageFailed(true)}
      className={`shrink-0 object-cover ${PHOTO_SIZE_CLASSES[size]}`}
    />
  );
}
