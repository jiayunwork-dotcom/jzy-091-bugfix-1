/**
 * Sagnac 相位与标度模块（独立职责）——开环正算 / 反演主链路。
 *
 * 正算：Δφ = 4π·R·L·Ω / (λ·c) = K·Ω
 * 反演：Ω̂ = Δφ / K
 *
 * 反演是相位的严格逆过程；本模块不做任何相位折叠。
 * 当 |Δφ| 接近 π 时由 ambiguity 模块显式告警。
 */
import { scaleFactor } from './geometry.js';
import { assessAmbiguity } from './ambiguity.js';
import type { AmbiguityResult, CoilGeometry } from './types.js';
import { validateGeometry, validateOmega } from './validation.js';

export { scaleFactor } from './geometry.js';

/** 正算 Sagnac 相位差 Δφ = K·Ω，单位 rad */
export function sagnacPhase(geometry: CoilGeometry, omega: number): number {
  validateGeometry(geometry);
  validateOmega(omega);
  return scaleFactor(geometry) * omega;
}

/**
 * 由测得相位反演角速度 Ω̂ = Δφ / K，单位 rad/s。
 * 注意：原样返回线性反演结果，绝不把相位折叠到错误象限。
 */
export function omegaFromPhase(geometry: CoilGeometry, phase: number): number {
  validateGeometry(geometry);
  validateOmega(phase, 'phase');
  return phase / scaleFactor(geometry);
}

export interface OpenLoopPoint {
  phase: number;
  scaleFactor: number;
  omegaHat: number;
  ambiguity: AmbiguityResult;
}

/**
 * 单点开环计算：正算相位、给出标度因数并立即反演。
 * 反演结果与输入角速度的差只应来自浮点误差——可作为往返一致性检查。
 */
export function computeOpenLoop(geometry: CoilGeometry, omega: number): OpenLoopPoint {
  validateGeometry(geometry);
  validateOmega(omega);
  const K = scaleFactor(geometry);
  const phase = K * omega;
  const omegaHat = phase / K;
  return {
    phase,
    scaleFactor: K,
    omegaHat,
    ambiguity: assessAmbiguity(phase),
  };
}
