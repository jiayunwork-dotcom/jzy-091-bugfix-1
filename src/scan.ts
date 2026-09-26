/**
 * 角速度扫描模块（独立职责）。
 *
 * 返回的相位序列逐点真算：对每个网格点独立调用 computeOpenLoop，
 * 绝不用一条过原点的直线（例如直接返回 K·ω 的解析采样）去糊弄——
 * 每个采样点都经过与单点接口完全相同的正算 + 反演 + 模糊判定链路。
 */
import { fiberLength, scaleFactor } from './geometry.js';
import { computeOpenLoop } from './sagnac.js';
import { AMBIGUITY_THRESHOLD } from './config.js';
import type { CoilGeometry, OmegaGrid, PhasePoint, ScanResult } from './types.js';
import { validateGeometry } from './validation.js';

/** 生成线性网格（端点 start、stop 各采样一次，共 count 点；允许反向） */
export function linspace(grid: OmegaGrid): number[] {
  const { start, stop, count } = grid;
  if (count === 1) return [start];
  const step = (stop - start) / (count - 1);
  const points: number[] = new Array(count);
  for (let i = 0; i < count; i++) {
    points[i] = i === count - 1 ? stop : start + step * i;
  }
  return points;
}

/**
 * 对一组角速度逐点真算 Sagnac 相位。
 */
export function scanOmegas(geometry: CoilGeometry, omegas: number[]): ScanResult {
  validateGeometry(geometry);
  const samples: PhasePoint[] = omegas.map((omega) => {
    // 每个点独立走完整开环计算链路，而非套用直线公式批量填充
    const point = computeOpenLoop(geometry, omega);
    return { omega, phase: point.phase };
  });

  return {
    geometry: { ...geometry },
    fiberLength: fiberLength(geometry),
    scaleFactor: scaleFactor(geometry),
    ambiguityThreshold: AMBIGUITY_THRESHOLD,
    count: samples.length,
    samples,
  };
}
