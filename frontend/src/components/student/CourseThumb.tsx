import { useState } from "react";
import { resolveMediaUrl } from "../../lib/users/media";
import { InitialTile } from "../ui/InitialTile";

interface CourseThumbProps {
  title: string;
  photoPath: string | null;
  size?: "sm" | "md" | "lg";
}

const PHOTO_SIZE_CLASSES: Record<"sm" | "md" | "lg", string> = {
  sm: "size-8 rounded-[8px]",
  md: "size-10 rounded-[10px]",
  lg: "size-14 rounded-[12px]",
};

export function CourseThumb({ title, photoPath, size = "md" }: CourseThumbProps) {
  const [failed, setFailed] = useState<boolean>(false);
  const photoUrl: string | null = resolveMediaUrl(photoPath);
  if (photoUrl === null || failed) return <InitialTile name={title} size={size} />;
  return <img src={photoUrl} alt="" data-course-photo onError={() => setFailed(true)} className={`shrink-0 object-cover ${PHOTO_SIZE_CLASSES[size]}`} />;
}
