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

/** 标度因数缓存：扫描逐点、标定与闭环会对同一线圈反复求 K，按线圈键复用 */
const scaleFactorCache = new Map<string, number>();

/**
 * 缓存键必须包含完整几何（R、N、λ）。
 *
 * 防坑点：L = 2π·R·N 是派生量，不能拿 L 当线圈的唯一标识——
 * 两只半径、匝数不同的线圈完全可以 L 相同（例如 R=0.05,N=640 与
 * R=0.1,N=320 的 L 都约 201.06 m）。而 K = 4π·R·L/(λ·c) 还显式
 * 含 R，若键只取 L|λ，后算的线圈会命中先算线圈的缓存，结果随
 * 请求顺序漂移。
 */
function scaleFactorCacheKey(radius: number, turns: number, wavelength: number): string {
  return `${radius}|${turns}|${wavelength}`;
}

/**
 * 开环标度因数
 *     K = 4π·R·L / (λ·c)  [s]
 * L 由 {@link fiberLength} 经匝数 N 算出。
 */
export function scaleFactor(geometry: CoilGeometry): number {
  const { radius, turns, wavelength } = validateGeometry(geometry);
  const L = fiberLength(geometry);
  const key = scaleFactorCacheKey(radius, turns, wavelength);
  const cached = scaleFactorCache.get(key);
  if (cached !== undefined) return cached;
  const K = (4 * Math.PI * radius * L) / (wavelength * SPEED_OF_LIGHT);
  scaleFactorCache.set(key, K);
  return K;
}
