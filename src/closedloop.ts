/**
 * 闭环偏置修正模块（很薄的一层）。
 *
 * 闭环陀螺用相位调制/非互易相位偏置把工作点维持在灵敏度最高处，
 * 探测器解调后经伺服反馈产生与 Sagnac 相位移大小相等、符号相反的
 * 反馈相位（nulling）。稳态下反馈相位 φ_fb = -Δφ，因此：
 *
 *     Ω = -φ_fb / K = φ_err / K
 *
 * 这里按“传入解调得到的等效误差相位 φ_err（= -φ_fb = Δφ）”约定，
 * 直接做一次线性反演。闭环在伺服线性区不引入开环式的近 π 模糊，
 * 但本层不建立任何误差状态模型、不做滤波（那不是本内核的职责）。
 */
import { fiberLength, scaleFactor } from './geometry.js';
import type { ClosedLoopResult, CoilGeometry } from './types.js';
import { validateGeometry, validateOmega } from './validation.js';

/**
 * 闭环薄层修正：由解调/反馈相位反演角速度。
 * @param geometry      线圈几何
 * @param feedbackPhase 解调误差相位 φ_err（稳态等于 Δφ），rad
 */
export function closedLoopOmega(
  geometry: CoilGeometry,
  feedbackPhase: number,
): ClosedLoopResult {
  validateGeometry(geometry);
  validateOmega(feedbackPhase, 'feedbackPhase');
  const K = scaleFactor(geometry);
  return {
    geometry: { ...geometry },
    fiberLength: fiberLength(geometry),
    scaleFactor: K,
    feedbackPhase,
    omega: feedbackPhase / K,
    note: '闭环薄层修正：稳态 φ_err = Δφ，按 Ω = φ_err/K 线性反演；不含滤波与误差状态估计。',
  };
}
