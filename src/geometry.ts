/**
 * 几何计算模块（独立职责）。
 *
 * 关键防坑点：光纤总长度
 *     L = 2π · R · N
 * 是“一圈周长 × 匝数”。绝不能把总长当成一圈周长 2πR，
 * 否则标度因数会差整整 N 倍——本模块是全链路唯一的长度来源。
 */
import { SPEED_OF_LIGHT } from './config.js';
import type { CoilGeometry } from './types.js';
import { validateGeometry } from './validation.js';

/** 一圈光纤的周长，单位 m */
export function loopCircumference(radius: number): number {
  return 2 * Math.PI * radius;
}

/**
 * 光纤总长度 L = 2π·R·N（m）。
 * 入参几何在 HTTP 层已校验；这里再校验一次，保证模块可独立安全使用。
 */
export function fiberLength(geometry: CoilGeometry): number {
  const { radius, turns } = validateGeometry(geometry);
  return loopCircumference(radius) * turns;
}

/**
 * 标度因数缓存：扫描逐点、标定与闭环会对同一线圈反复求 K，按线圈键复用。
 *
 * 键必须包含决定 K 的全部独立几何量 R、N、λ，绝不能只按
 * （总长 L、波长 λ）建键：不同线圈完全可能 L 相同而 (R, N) 不同
 * （例如 R=0.05 m/N=640 与 R=0.1 m/N=320 的总长都约 201.06 m），
 * 而 K = 4π·R·L/(λc) ∝ R·N，此时两者 K 恰好相差一倍，
 * 只按 L、λ 建键会让后算的线圈命中先算线圈的值，且结果随调用顺序翻转。
 */
const scaleFactorCache = new Map<string, number>();

function cacheKey(geometry: CoilGeometry): string {
  return `${geometry.radius}|${geometry.turns}|${geometry.wavelength}`;
}

/**
 * 开环标度因数
 *     K = 4π·R·L / (λ·c)  [s]
 * L 由 {@link fiberLength} 经匝数 N 算出。
 */
export function scaleFactor(geometry: CoilGeometry): number {
  const { radius, wavelength } = validateGeometry(geometry);
  const L = fiberLength(geometry);
  const key = cacheKey(geometry);
  const cached = scaleFactorCache.get(key);
  if (cached !== undefined) return cached;
  const K = (4 * Math.PI * radius * L) / (wavelength * SPEED_OF_LIGHT);
  scaleFactorCache.set(key, K);
  return K;
}
