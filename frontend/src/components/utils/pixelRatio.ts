/**
 * Responsive sizing helpers based on the device screen + pixel density.
 * Design reference: 375 × 812 (iPhone X logical resolution).
 */

import { Dimensions, PixelRatio } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const GUIDELINE_BASE_WIDTH = 375;
const GUIDELINE_BASE_HEIGHT = 812;

/** Scale a size horizontally relative to the design width. */
export function scale(size: number): number {
  return (SCREEN_WIDTH / GUIDELINE_BASE_WIDTH) * size;
}

/** Scale a size vertically relative to the design height. */
export function verticalScale(size: number): number {
  return (SCREEN_HEIGHT / GUIDELINE_BASE_HEIGHT) * size;
}

/**
 * Moderate scale — softens horizontal scaling by a factor so text/padding
 * don't grow uncomfortably large on tablets.
 */
export function moderateScale(size: number, factor = 0.5): number {
  return size + (scale(size) - size) * factor;
}

/** Round a scaled value to the nearest crisp on-screen pixel. */
export function normalize(size: number): number {
  return Math.round(PixelRatio.roundToNearestPixel(scale(size)));
}

export const screen = {
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
  isSmall: SCREEN_WIDTH < 360,
} as const;
