/**
 * 内置参考线圈模块（独立职责）。
 *
 * 约 200 m 光纤：R = 0.05 m、N = 640、λ = 1.55 μm。
 * 提供地球自转量级角速度下的参考相位，便于快速核对量纲与系数。
 */
import { EARTH_ROTATION_RATE, REFERENCE_GEOMETRY } from './config.js';
import { fiberLength, scaleFactor } from './geometry.js';
import { computeOpenLoop } from './sagnac.js';

export interface ReferenceInfo {
  geometry: typeof REFERENCE_GEOMETRY;
  fiberLength: number;
  scaleFactor: number;
  earthRotation: {
    omega: number;
    phase: number;
    phaseMicroRad: number;
    omegaHat: number;
    ambiguity: ReturnType<typeof computeOpenLoop>['ambiguity'];
  };
  note: string;
}

/** 返回内置参考线圈在地球自转角速度下的完整核对信息 */
export function getReference(): ReferenceInfo {
  const point = computeOpenLoop(REFERENCE_GEOMETRY, EARTH_ROTATION_RATE);
  return {
    geometry: { ...REFERENCE_GEOMETRY },
    fiberLength: fiberLength(REFERENCE_GEOMETRY),
    scaleFactor: scaleFactor(REFERENCE_GEOMETRY),
    earthRotation: {
      omega: EARTH_ROTATION_RATE,
      phase: point.phase,
      phaseMicroRad: point.phase * 1e6,
      omegaHat: point.omegaHat,
      ambiguity: point.ambiguity,
    },
    note: '参考线圈 L≈201 m；地球自转量级输入下相位约 19.8 μrad，用于核对量纲与 N 倍系数。',
  };
}
