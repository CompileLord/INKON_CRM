import { useState } from "react";
import { InitialTile } from "../ui/InitialTile";
import { resolveMediaUrl } from "../../lib/users/media";

interface CourseThumbProps {
  title: string;
  photoPath: string | null;
}

export function CourseThumb({ title, photoPath }: CourseThumbProps) {
  const [hasImageFailed, setHasImageFailed] = useState<boolean>(false);
  const photoUrl: string | null = !hasImageFailed && photoPath ? resolveMediaUrl(photoPath) : null;
  if (photoUrl === null) return <InitialTile name={title} size="md" />;
  return (
    <img
      src={photoUrl}
      alt=""
      onError={() => setHasImageFailed(true)}
      className="size-10 shrink-0 rounded-[10px] object-cover"
    />
  );
}
