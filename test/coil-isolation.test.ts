/**
 * 多线圈隔离回归测试（锁住“标度因数随调用顺序漂移”的故障）。
 *
 * 故障原型：两只线圈光纤总长相同（L = 2π·R·N 都约 201.06 m）、波长相同，
 * 仅半径/匝数互换（R=0.05,N=640 与 R=0.1,N=320）。K = 4π·R·L/(λ·c)
 * 还显式与 R 成正比，因此大线圈 K 应是参考线圈的 2 倍。曾因标度因数缓存
 * 键只取 L|λ 而互相顶号：后算的线圈拿到先算线圈的 K，结果随请求顺序翻转。
 *
 * 本文件在同一进程内覆盖：
 *   - 两种先后顺序下首调即给出各自正确值（冷态两种方向都走一遍）；
 *   - 两只线圈交替、重复调用，结果始终一致；
 *   - 正算 / 反演 / 扫描 / 闭环 / 参考核对各链路都使用各自的 K；
 *   - 同 L、同 λ 但半径不同的另一组几何同样不串号（键不能只含 L|λ）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeOpenLoop, omegaFromPhase, sagnacPhase } from '../src/sagnac.js';
import { fiberLength, scaleFactor } from '../src/geometry.js';
import { scanOmegas } from '../src/scan.js';
import { closedLoopOmega } from '../src/closedloop.js';
import { getReference } from '../src/reference.js';
import { EARTH_ROTATION_RATE, SPEED_OF_LIGHT } from '../src/config.js';

const EPS = 1e-12;

/** 服务内置参考线圈：R=0.05、N=640、λ=1.55 μm */
const refCoil = { radius: 0.05, turns: 640, wavelength: 1.55e-6 };
/** 直径大一倍、匝数减半：R=0.1、N=320、λ=1.55 μm；总长与参考线圈相同 */
const largeCoil = { radius: 0.1, turns: 320, wavelength: 1.55e-6 };

/** 直接按定义式计算的 K，作为不依赖缓存实现的基准 */
function expectedK(g: { radius: number; turns: number; wavelength: number }): number {
  const L = 2 * Math.PI * g.radius * g.turns;
  return (4 * Math.PI * g.radius * L) / (g.wavelength * SPEED_OF_LIGHT);
}

test('两只线圈光纤总长与波长相同，但标度因数差 2 倍（K 显式含 R）', () => {
  assert.ok(Math.abs(fiberLength(refCoil) - fiberLength(largeCoil)) < 1e-12);
  assert.equal(refCoil.wavelength, largeCoil.wavelength);
  assert.ok(Math.abs(scaleFactor(largeCoil) / scaleFactor(refCoil) - 2) < EPS);
  assert.ok(Math.abs(scaleFactor(refCoil) - expectedK(refCoil)) / expectedK(refCoil) < EPS);
  assert.ok(Math.abs(scaleFactor(largeCoil) - expectedK(largeCoil)) / expectedK(largeCoil) < EPS);
  // 数量级核对
  assert.ok(Math.abs(scaleFactor(refCoil) - 0.271867) / 0.271867 < 1e-5);
  assert.ok(Math.abs(scaleFactor(largeCoil) - 0.543735) / 0.543735 < 1e-5);
});

test('顺序一（先参考后大线圈）：大线圈首调即得 2 倍 K，不被参考线圈缓存带偏', () => {
  // 先用参考线圈把它的几何写进缓存
  const refFirst = computeOpenLoop(refCoil, EARTH_ROTATION_RATE);
  assert.ok(Math.abs(refFirst.scaleFactor - expectedK(refCoil)) / expectedK(refCoil) < EPS);

  const largeFirstTouch = computeOpenLoop(largeCoil, EARTH_ROTATION_RATE);
  assert.ok(
    Math.abs(largeFirstTouch.scaleFactor - expectedK(largeCoil)) / expectedK(largeCoil) < EPS,
    '大线圈命中了参考线圈的缓存键',
  );
  // 地球自转量级：参考约 19.82 μrad，大线圈约 39.65 μrad
  assert.ok(Math.abs(largeFirstTouch.phase * 1e6 - 39.65) / 39.65 < 1e-3);
  assert.ok(Math.abs(refFirst.phase * 1e6 - 19.82) / 19.82 < 1e-3);
});

test('顺序二（先大线圈后参考）：参考线圈首调仍为自身 K，不被大线圈缓存带偏', () => {
  // 新的几何对象，避免“同一对象”给缓存带来的任何侥幸
  const big = { radius: 0.1, turns: 320, wavelength: 1.55e-6 };
  const small = { radius: 0.05, turns: 640, wavelength: 1.55e-6 };

  const bigFirst = computeOpenLoop(big, EARTH_ROTATION_RATE);
  const smallAfter = computeOpenLoop(small, EARTH_ROTATION_RATE);

  assert.ok(Math.abs(bigFirst.scaleFactor - expectedK(big)) / expectedK(big) < EPS);
  assert.ok(
    Math.abs(smallAfter.scaleFactor - expectedK(small)) / expectedK(small) < EPS,
    '参考线圈命中了大线圈的缓存键',
  );
  assert.ok(Math.abs(bigFirst.phase - 2 * smallAfter.phase) / bigFirst.phase < EPS);
});

test('两只线圈交替、重复调用，每次结果都只由自身几何决定', () => {
  const omega = EARTH_ROTATION_RATE;
  const kRef = expectedK(refCoil);
  const kBig = expectedK(largeCoil);

  for (let i = 0; i < 5; i++) {
    const a = i % 2 === 0 ? computeOpenLoop(refCoil, omega) : computeOpenLoop(largeCoil, omega);
    const b = i % 2 === 0 ? computeOpenLoop(largeCoil, omega) : computeOpenLoop(refCoil, omega);

    const refPoint = i % 2 === 0 ? a : b;
    const bigPoint = i % 2 === 0 ? b : a;

    assert.ok(Math.abs(refPoint.scaleFactor - kRef) / kRef < EPS, `第 ${i} 轮参考 K 漂移`);
    assert.ok(Math.abs(bigPoint.scaleFactor - kBig) / kBig < EPS, `第 ${i} 轮大线圈 K 漂移`);
    assert.ok(Math.abs(refPoint.phase - kRef * omega) < 1e-15, `第 ${i} 轮参考相位漂移`);
    assert.ok(Math.abs(bigPoint.phase - kBig * omega) < 1e-15, `第 ${i} 轮大线圈相位漂移`);
    assert.ok(Math.abs(bigPoint.phase / refPoint.phase - 2) < EPS);
    // 反演必须回到输入角速度
    assert.ok(Math.abs(refPoint.omegaHat - omega) < EPS);
    assert.ok(Math.abs(bigPoint.omegaHat - omega) < EPS);
  }
});

test('反演 / 扫描 / 闭环链路：大线圈均使用自身 K（0.5437 s 口径）', () => {
  // 反演：phase=1e-4 时 Ω̂ ≈ 1.839e-4 rad/s，恰好是参考线圈口径的一半
  const omegaHatBig = omegaFromPhase(largeCoil, 1e-4);
  const omegaHatRef = omegaFromPhase(refCoil, 1e-4);
  assert.ok(Math.abs(omegaHatBig - 1.839131e-4) / 1.839131e-4 < 1e-5);
  assert.ok(Math.abs(omegaHatRef - 3.678262e-4) / 3.678262e-4 < 1e-5);
  assert.ok(Math.abs(omegaHatRef / omegaHatBig - 2) < EPS);

  // 扫描：逐点相位必须按大线圈 K 真算，且 K 元数据正确
  const omegas = [-2e-4, -1e-4, 0, 1e-4, 2e-4];
  const scan = scanOmegas(largeCoil, omegas);
  assert.ok(Math.abs(scan.scaleFactor - expectedK(largeCoil)) / expectedK(largeCoil) < EPS);
  scan.samples.forEach((s, i) => {
    assert.ok(Math.abs(s.phase - expectedK(largeCoil) * omegas[i]) < 1e-15);
  });

  // 闭环：φ_err/K 按大线圈 K 反演
  const cl = closedLoopOmega(largeCoil, 1e-4);
  assert.ok(Math.abs(cl.scaleFactor - expectedK(largeCoil)) / expectedK(largeCoil) < EPS);
  assert.ok(Math.abs(cl.omega - 1e-4 / expectedK(largeCoil)) < 1e-15);
});

test('内置参考核对值不被同进程内算过的大线圈带偏', () => {
  // 先把大线圈几何留在进程状态里
  sagnacPhase(largeCoil, EARTH_ROTATION_RATE);
  const ref = getReference();
  assert.ok(Math.abs(ref.scaleFactor - expectedK(refCoil)) / expectedK(refCoil) < EPS);
  assert.ok(Math.abs(ref.earthRotation.phaseMicroRad - 19.82) / 19.82 < 1e-3);
  assert.ok(Math.abs(ref.earthRotation.phase - expectedK(refCoil) * EARTH_ROTATION_RATE) < 1e-15);
});

test('更广的回归：同 L、同 λ、不同 (R,N) 的任意两只线圈都不串号', () => {
  // R=0.2,N=160 与 R=0.1,N=320：L 同为约 100.53 m，K 再差 2 倍
  const g1 = { radius: 0.1, turns: 320, wavelength: 1e-6 };
  const g2 = { radius: 0.2, turns: 160, wavelength: 1e-6 };
  assert.ok(Math.abs(fiberLength(g1) - fiberLength(g2)) < 1e-12);
  const k1a = scaleFactor(g1);
  const k2a = scaleFactor(g2);
  const k2b = scaleFactor(g2);
  const k1b = scaleFactor(g1);
  assert.ok(Math.abs(k2a / k1a - 2) < EPS);
  assert.ok(Math.abs(k2b - k2a) < EPS);
  assert.ok(Math.abs(k1b - k1a) < EPS);
});
