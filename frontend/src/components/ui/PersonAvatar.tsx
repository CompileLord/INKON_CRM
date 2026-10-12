import { useState } from "react";
import { UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface PersonAvatarProps {
  firstName: string;
  lastName: string;
  photoUrl?: string;
  size?: number;
  className?: string;
}

export function PersonAvatar({
  firstName,
  lastName,
  photoUrl,
  size = 32,
  className = "",
}: PersonAvatarProps) {
  const { t } = useTranslation("common");
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string>();
  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
  const accessibleName = fullName || t("controls.unknownPerson");
  const dimensionStyle = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
  };

  if (photoUrl && photoUrl !== failedPhotoUrl) {
    return (
      <img
        src={photoUrl}
        alt={accessibleName}
        onError={() => setFailedPhotoUrl(photoUrl)}
        style={dimensionStyle}
        className={[
          "shrink-0 rounded-full object-cover ring-1 ring-border shadow-xs",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      />
    );
  }

  const initials = `${firstName.trim()[0] ?? ""}${lastName.trim()[0] ?? ""}`.toUpperCase();

  return (
    <div
      role="img"
      aria-label={accessibleName}
      style={{
        ...dimensionStyle,
        fontSize: Math.round(size * 0.4),
      }}
      className={[
        "flex shrink-0 items-center justify-center rounded-full font-semibold ring-1 ring-border shadow-xs bg-beige text-ink",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {initials || <UserRound aria-hidden="true" style={{ width: size * 0.6, height: size * 0.6 }} />}
    </div>
  );
}
