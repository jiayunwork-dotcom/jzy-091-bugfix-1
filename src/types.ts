/**
 * 全局共享类型定义。
 * 纯类型模块，不含任何运行时逻辑。
 */

/** 线圈几何参数（半径 m、匝数、真空波长 m） */
export interface CoilGeometry {
  /** 光纤环半径 R，单位 m */
  radius: number;
  /** 匝数 N（必须为正整数） */
  turns: number;
  /** 光源真空波长 λ，单位 m */
  wavelength: number;
}

/** 单点开环计算结果 */
export interface PhasePoint {
  /** 输入角速度 Ω，单位 rad/s */
  omega: number;
  /** Sagnac 相位差 Δφ = K·Ω，单位 rad（微弧度级只是典型量级，这里不做单位换算） */
  phase: number;
}

/** /phase 正算接口的完整返回 */
export interface ComputeResult {
  /** 回显并归一化后的几何参数 */
  geometry: CoilGeometry;
  /** 光纤总长度 L = 2π·R·N，单位 m */
  fiberLength: number;
  /** 输入角速度 Ω，单位 rad/s */
  omega: number;
  /** Sagnac 相位差 Δφ，单位 rad */
  phase: number;
  /** 开环标度因数 K = 4π·R·L/(λ·c)，单位 s（rad / (rad/s)） */
  scaleFactor: number;
  /** 由相位反演得到的角速度 Ω̂ = Δφ/K，单位 rad/s */
  omegaHat: number;
  /** 相位模糊判定结果 */
  ambiguity: AmbiguityResult;
}

/** 相位模糊判定结果（开环，绝不折叠相位） */
export interface AmbiguityResult {
  /** 是否存在模糊（|Δφ| 达到判定阈值） */
  ambiguous: boolean;
  /** 判定阈值（弧度），默认 0.9π */
  threshold: number;
  /** 输入相位的绝对值，rad */
  absPhase: number;
  /** 非模糊时为 null；模糊时给出仅作参考的主值折叠相位 rad，反演不使用它 */
  wrappedPhase: number | null;
  /** 非模糊时为 null；模糊时给出必须向调用方展示的人读警告 */
  warning: string | null;
}

/** /calibrate 反演接口的完整返回 */
export interface CalibrateResult {
  geometry: CoilGeometry;
  fiberLength: number;
  /** 实测（输入）相位 Δφ，rad */
  measuredPhase: number;
  scaleFactor: number;
  /** 开环反演角速度 Ω̂ = Δφ/K，rad/s */
  omegaHat: number;
  ambiguity: AmbiguityResult;
}

/** 角速度扫描网格的线性描述：start、stop 两端各采样一次，共 count 点 */
export interface OmegaGrid {
  start: number;
  stop: number;
  count: number;
}

/** /scan 接口返回的采样序列 */
export interface ScanResult {
  geometry: CoilGeometry;
  fiberLength: number;
  scaleFactor: number;
  ambiguityThreshold: number;
  /** 序列长度 */
  count: number;
  /** 逐点真算的采样点（每点独立调用正算，而非画一条过原点直线） */
  samples: PhasePoint[];
}

/** /closed-loop 薄层闭环修正返回 */
export interface ClosedLoopResult {
  geometry: CoilGeometry;
  fiberLength: number;
  scaleFactor: number;
  /** 探测器读数经偏置解调得到的闭环误差/反馈相位 φ_err，rad */
  feedbackPhase: number;
  /** 闭环线性反演角速度 Ω = φ_err/K，rad/s */
  omega: number;
  note: string;
}
