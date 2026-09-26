/**
 * 相位模糊判定模块（独立职责）。
 *
 * 开环 Sagnac 干涉只对 cos(Δφ) 敏感，周期为 2π；|Δφ| 接近 π 时
 * 相位处于条纹灵敏度最差、象限归属不明的区域，存在测量模糊。
 *
 * 本模块只“告警 + 给出仅供参考的主值折叠”，绝不在反演链路中折叠相位。
 */
import { AMBIGUITY_THRESHOLD } from './config.js';
import type { AmbiguityResult } from './types.js';

/**
 * 把相位折叠到 (-π, π] 主值——仅供告警信息参考，禁止用于角速度反演。
 */
export function wrapToPrincipal(phase: number): number {
  let wrapped = ((phase + Math.PI) % (2 * Math.PI)) - Math.PI;
  if (wrapped <= -Math.PI) wrapped += 2 * Math.PI;
  return wrapped;
}

/**
 * 评估开环相位模糊。
 * @param phase     输入/实测相位 Δφ，rad
 * @param threshold 判定阈值，默认 0.9π
 */
export function assessAmbiguity(
  phase: number,
  threshold: number = AMBIGUITY_THRESHOLD,
): AmbiguityResult {
  const absPhase = Math.abs(phase);
  const ambiguous = absPhase >= threshold;

  if (!ambiguous) {
    return {
      ambiguous: false,
      threshold,
      absPhase,
      wrappedPhase: null,
      warning: null,
    };
  }

  return {
    ambiguous: true,
    threshold,
    absPhase,
    wrappedPhase: wrapToPrincipal(phase),
    warning:
      `开环相位 |Δφ| = ${absPhase.toExponential(6)} rad 已接近或超过 π，` +
      `存在 2π 周期测量模糊（阈值 ${threshold.toExponential(6)} rad）。` +
      `服务未对相位做任何折叠：Ω̂ = Δφ/K 按原始相位线性反演，` +
      `请勿将该角速度解读为无模糊结果；应改用闭环检测或增加量程先验。`,
  };
}
