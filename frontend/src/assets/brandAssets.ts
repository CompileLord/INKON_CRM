import kitobLogoPng from "./kitob-logo.png";
import kitobEmblemPng from "./kitob-emblem.png";
import kitobLogoOriginal from "./kitob-logo-original.png";
import kitobEmblemOriginal from "./kitob-emblem-original.png";
import kitobLogoSvg from "./kitob-svg/kitob-logo-editable.svg";
import kitobLogoDarkSvg from "./kitob-svg/kitob-logo-dark.svg";
import kitobEmblemSvg from "./kitob-svg/kitob-emblem-editable.svg";
import kitobIconAnimatedSvg from "./kitob-svg/kitob-icon-animated.svg";
import kitobLogoAnimatedSvg from "./kitob-svg/kitob-logo-animated.svg";
import kitobIconLoopSvg from "./kitob-svg/kitob-icon-loop.svg";
import kitobIconStaticSvg from "./kitob-svg/kitob-icon-static.svg";
import kitobLogoLoopSvg from "./kitob-svg/kitob-logo-loop.svg";
import kitobLogoLoopDarkSvg from "./kitob-svg/kitob-logo-loop-dark.svg";

export {
  kitobLogoSvg as kitobLogo,
  kitobEmblemSvg as kitobEmblem,
  kitobLogoSvg,
  kitobLogoDarkSvg,
  kitobEmblemSvg,
  kitobIconAnimatedSvg,
  kitobLogoAnimatedSvg,
  kitobIconLoopSvg,
  kitobIconStaticSvg,
  kitobLogoLoopSvg,
  kitobLogoLoopDarkSvg,
  kitobLogoPng,
  kitobEmblemPng,
  kitobLogoOriginal,
  kitobEmblemOriginal,
};

export const BRAND_DIMENSIONS = {
  logo: {
    originalWidth: 1394,
    originalHeight: 619,
    visibleWidth: 1394,
    visibleHeight: 619,
    kCapHeight: 209,
    clearSpaceRatio: 209 / 619,
    aspectRatio: 1394 / 619,
  },
  emblem: {
    originalWidth: 1217,
    originalHeight: 970,
    visibleWidth: 1217,
    visibleHeight: 970,
    clearSpaceRatio: 209 / 970,
    aspectRatio: 1217 / 970,
  },
  icon: {
    originalWidth: 925,
    originalHeight: 640,
    visibleWidth: 925,
    visibleHeight: 640,
    aspectRatio: 925 / 640,
  },
} as const;
