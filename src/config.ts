/**
 * 物理常数与内置参考线圈配置。
 */
import type { CoilGeometry } from './types.js';

/**
 * 真空光速 c（固定常数），单位 m/s。
 * 取 CODATA / SI 定义量级 2.99792458e8。
 */
export const SPEED_OF_LIGHT = 299_792_458 as const;

/** 开环相位模糊判定阈值：|Δφ| 接近 π 即告警，这里取 0.9π。 */
export const AMBIGUITY_THRESHOLD = 0.9 * Math.PI;

/**
 * 内置参考线圈（光纤总长约 200 m）：
 *   R = 0.05 m，N = 640 圈  =>  L = 2π·0.05·640 ≈ 201.06 m
 *   λ = 1.55 μm（典型光纤陀螺光源波长）
 *
 * 在地球自转量级（Ω_E ≈ 7.2921159e-5 rad/s）下：
 *   K = 4π·R·L/(λ·c) ≈ 0.2719 s
 *   Δφ = K·Ω_E ≈ 1.982e-5 rad ≈ 19.8 μrad  —— 可被检出的微弧度级相位，
 * 可用于快速核对量纲与系数是否正确。
 */
export const REFERENCE_GEOMETRY: CoilGeometry = {
  radius: 0.05,
  turns: 640,
  wavelength: 1.55e-6,
};

/** 地球自转角速度参考输入，单位 rad/s（恒星日，WGS-84 常用值） */
export const EARTH_ROTATION_RATE = 7.2921159e-5;
