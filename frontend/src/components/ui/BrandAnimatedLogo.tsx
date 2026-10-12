import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  kitobLogo,
  kitobLogoDarkSvg,
  kitobLogoLoopSvg,
  kitobLogoLoopDarkSvg,
  BRAND_DIMENSIONS,
} from "../../assets/brandAssets";
import { useThemeStore } from "../../store/themeStore";

export interface BrandAnimatedLogoProps {
  maxWidth?: number;
  maxHeight?: number;
  className?: string;
  style?: CSSProperties;
}

export function BrandAnimatedLogo({
  maxWidth = 500,
  maxHeight,
  className = "",
  style,
}: BrandAnimatedLogoProps) {
  const { t } = useTranslation("common");
  const effectiveTheme = useThemeStore((state) => state.effectiveTheme);
  const isDark = effectiveTheme === "dark";

  const dimensions = BRAND_DIMENSIONS.logo;
  const clearSpaceRatio = dimensions.clearSpaceRatio;
  const outerAspectRatio =
    (dimensions.aspectRatio + 2 * clearSpaceRatio) / (1 + 2 * clearSpaceRatio);
  const paddingRatio = clearSpaceRatio / (dimensions.aspectRatio + 2 * clearSpaceRatio);

  const containerStyle: CSSProperties = {
    ...style,
    maxWidth,
    maxHeight,
    aspectRatio: outerAspectRatio,
    boxSizing: "border-box",
    position: "relative",
    display: "inline-block",
    width: "100%",
  };

  const imgStyle: CSSProperties = {
    position: "absolute",
    top: `${(clearSpaceRatio / (1 + 2 * clearSpaceRatio)) * 100}%`,
    left: `${paddingRatio * 100}%`,
    width: `${(1 - 2 * paddingRatio) * 100}%`,
    height: `${100 / (1 + 2 * clearSpaceRatio)}%`,
    aspectRatio: dimensions.aspectRatio,
  };

  const staticAssetSrc = isDark ? kitobLogoDarkSvg : kitobLogo;
  const loopAssetSrc = isDark ? kitobLogoLoopDarkSvg : kitobLogoLoopSvg;

  return (
    <div
      className={["select-none align-middle relative inline-block w-full bg-transparent", className]
        .filter(Boolean)
        .join(" ")}
      style={containerStyle}
      data-testid="brand-animated-logo"
    >
      <img
        src={staticAssetSrc}
        alt={t("brand.logoAlt")}
        className="hidden motion-reduce:block max-w-full max-h-full object-contain shrink-0"
        style={imgStyle}
        loading="eager"
        decoding="async"
        data-logo-kind="static"
      />
      <img
        src={loopAssetSrc}
        alt={t("brand.logoAlt")}
        className="block motion-reduce:hidden max-w-full max-h-full object-contain shrink-0"
        style={imgStyle}
        loading="eager"
        decoding="async"
        data-logo-kind="loop"
      />
    </div>
  );
}
