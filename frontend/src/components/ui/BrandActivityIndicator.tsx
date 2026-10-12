import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  kitobIconLoopSvg,
  kitobIconStaticSvg,
  BRAND_DIMENSIONS,
} from "../../assets/brandAssets";

export interface BrandActivityIndicatorProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
  "aria-hidden"?: boolean | "true" | "false";
  "aria-label"?: string;
  role?: string;
}

export function BrandActivityIndicator({
  size = 24,
  className = "",
  style,
  "aria-hidden": ariaHidden,
  "aria-label": ariaLabel,
  role,
}: BrandActivityIndicatorProps) {
  const { t } = useTranslation("common");

  const aspectRatio = BRAND_DIMENSIONS.icon.aspectRatio;
  const width = Math.round(size * aspectRatio);
  const height = size;

  const accessibleLabel = ariaLabel ?? t("loading");
  const isHidden = ariaHidden === true || ariaHidden === "true";

  return (
    <span
      className={["inline-flex items-center justify-center shrink-0 select-none align-middle relative", className]
        .filter(Boolean)
        .join(" ")}
      style={{
        ...style,
        width,
        height,
      }}
      role={isHidden ? undefined : (role ?? "status")}
      aria-label={isHidden ? undefined : accessibleLabel}
      aria-hidden={isHidden ? "true" : undefined}
      data-testid="brand-activity-indicator"
    >
      <img
        src={kitobIconStaticSvg}
        alt=""
        aria-hidden="true"
        className="hidden motion-reduce:block h-full w-full object-contain"
        width={width}
        height={height}
        loading="eager"
        decoding="async"
        data-indicator-kind="static"
      />
      <img
        src={kitobIconLoopSvg}
        alt=""
        aria-hidden="true"
        className="block motion-reduce:hidden h-full w-full object-contain"
        width={width}
        height={height}
        loading="eager"
        decoding="async"
        data-indicator-kind="loop"
      />
    </span>
  );
}
