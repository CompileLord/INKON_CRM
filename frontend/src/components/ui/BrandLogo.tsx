import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  kitobLogo,
  kitobLogoDarkSvg,
  kitobEmblem,
  BRAND_DIMENSIONS,
} from "../../assets/brandAssets";
import { useThemeStore } from "../../store/themeStore";

export type BrandLogoVariant = "full" | "emblem";
export type BrandLogoSize = "sm" | "md" | "lg" | "xl" | "sidebar" | "custom";

export interface BrandLogoProps {
  variant?: BrandLogoVariant;
  size?: BrandLogoSize;
  className?: string;
  imgClassName?: string;
  alt?: string;
  maxHeight?: number;
  maxWidth?: number;
  style?: CSSProperties;
}

const sizeHeightPresets: Record<Exclude<BrandLogoSize, "sidebar" | "custom">, number> = {
  sm: 36,
  md: 48,
  lg: 64,
  xl: 96,
};

export function BrandLogo({
  variant = "full",
  size = "md",
  className = "",
  imgClassName = "",
  alt,
  maxHeight,
  maxWidth,
  style,
}: BrandLogoProps) {
  const { t } = useTranslation("common");
  const effectiveTheme = useThemeStore((state) => state.effectiveTheme);
  const isDark = effectiveTheme === "dark";

  const accessibleAlt =
    alt ?? (variant === "full" ? t("brand.logoAlt") : t("brand.emblemAlt"));

  const isFull = variant === "full";
  const assetSrc = isFull ? (isDark ? kitobLogoDarkSvg : kitobLogo) : kitobEmblem;

  const dimensions = isFull ? BRAND_DIMENSIONS.logo : BRAND_DIMENSIONS.emblem;
  const clearSpaceRatio = dimensions.clearSpaceRatio;
  const outerAspectRatio =
    (dimensions.aspectRatio + 2 * clearSpaceRatio) / (1 + 2 * clearSpaceRatio);
  const preferredHeight = size === "sidebar"
    ? 208 / outerAspectRatio
    : size === "custom" ? (maxHeight ?? (maxWidth ? maxWidth / outerAspectRatio : 96))
    : sizeHeightPresets[size];
  const containerWidth = Math.min(
    preferredHeight * outerAspectRatio,
    maxWidth ?? Infinity,
    (maxHeight ?? Infinity) * outerAspectRatio,
  );
  const paddingRatio = clearSpaceRatio / (dimensions.aspectRatio + 2 * clearSpaceRatio);
  const containerStyle: CSSProperties = {
    ...style,
    width: containerWidth,
    maxWidth: "100%",
    aspectRatio: outerAspectRatio,
    boxSizing: "border-box",
    position: "relative",
    display: "inline-block",
  };
  const imgStyle: CSSProperties = {
    position: "absolute",
    top: `${(clearSpaceRatio / (1 + 2 * clearSpaceRatio)) * 100}%`,
    left: `${paddingRatio * 100}%`,
    width: `${(1 - 2 * paddingRatio) * 100}%`,
    height: `${100 / (1 + 2 * clearSpaceRatio)}%`,
    aspectRatio: dimensions.aspectRatio,
  };

  return (
    <div
      className={["select-none align-middle bg-transparent", className]
        .filter(Boolean)
        .join(" ")}
      style={containerStyle}
      data-testid="brand-logo"
      data-variant={variant}
      data-size={size}
    >
      <img
        src={assetSrc}
        alt={accessibleAlt}
        className={["max-w-full max-h-full object-contain shrink-0", imgClassName]
          .filter(Boolean)
          .join(" ")}
        style={imgStyle}
        loading="eager"
        decoding="async"
      />
    </div>
  );
}
