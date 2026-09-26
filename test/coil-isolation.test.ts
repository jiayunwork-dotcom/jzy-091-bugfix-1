/**
 * 跨线圈状态隔离回归测试（同进程内，单元链路）。
 *
 * 背景：R=0.05 m/N=640（参考）与 R=0.1 m/N=320（大线圈）两只线圈
 * 光纤总长相同（L=2πRN≈201.06 m）、波长相同，但 K = 4π·R·L/(λc)
 * 恰好相差一倍。曾因标度因数缓存只按 (L, λ) 建键，两线圈互相命中
 * 对方的缓存值：后调用的线圈拿到先调用线圈的 K，结果随调用顺序翻转。
 *
 * 本文件在“全新进程”里第一发计算就打大线圈，再打参考线圈，
 * 锁住“重启后先大线圈、后参考”这一顺序；与
 * coil-order-http.test.ts（全新进程先 /reference 后大线圈，走 HTTP）
 * 配对，两种首调顺序都必须给出各自独立、稳定的结果。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeOpenLoop, omegaFromPhase, sagnacPhase } from '../src/sagnac.js';
import { fiberLength, scaleFactor } from '../src/geometry.js';
import { scanOmegas } from '../src/scan.js';
import { closedLoopOmega } from '../src/closedloop.js';
import { getReference } from '../src/reference.js';
import { EARTH_ROTATION_RATE, SPEED_OF_LIGHT } from '../src/config.js';
import type { CoilGeometry } from '../src/types.js';

const WAVELENGTH = 1.55e-6;
const gRef: CoilGeometry = { radius: 0.05, turns: 640, wavelength: WAVELENGTH };
const gBig: CoilGeometry = { radius: 0.1, turns: 320, wavelength: WAVELENGTH };

/** 独立于缓存/被测实现的解析式 K = 4π·R·(2π·R·N)/(λc) */
function expectedK(g: CoilGeometry): number {
  return (
    (4 * Math.PI * g.radius * 2 * Math.PI * g.radius * g.turns) /
    (g.wavelength * SPEED_OF_LIGHT)
  );
}

const EPS = 1e-12;

test('全新进程第一发计算：大线圈给出自己的 K≈0.5437 s，不被任何参考值顶替', () => {
  const point = computeOpenLoop(gBig, EARTH_ROTATION_RATE);
  const K = expectedK(gBig);
  assert.ok(Math.abs(point.scaleFactor - K) / K < EPS);
  assert.ok(Math.abs(point.scaleFactor - 0.5437) / 0.5437 < 1e-3);

  // 地球自转量级相位约 39.6 μrad（参考线圈的两倍）
  const microRad = point.phase * 1e6;
  assert.ok(Math.abs(microRad - 39.65) / 39.65 < 1e-3, `phase=${microRad} μrad`);
  assert.ok(Math.abs(point.phase - point.scaleFactor * EARTH_ROTATION_RATE) < 1e-18);
  assert.ok(Math.abs(point.omegaHat - EARTH_ROTATION_RATE) < 1e-18);
});

test('大线圈算过之后，参考线圈仍给出自己的 K≈0.2719 s 与约 19.8 μrad', () => {
  const point = computeOpenLoop(gRef, EARTH_ROTATION_RATE);
  const K = expectedK(gRef);
  assert.ok(Math.abs(point.scaleFactor - K) / K < EPS);
  assert.ok(Math.abs(point.scaleFactor - 0.2719) / 0.2719 < 1e-3);

  const microRad = point.phase * 1e6;
  assert.ok(Math.abs(microRad - 19.82) / 19.82 < 1e-3, `phase=${microRad} μrad`);
  assert.ok(Math.abs(point.omegaHat - EARTH_ROTATION_RATE) < 1e-18);
});

test('两只线圈光纤总长相同、波长相同，但标度因数恰好相差一倍', () => {
  assert.ok(Math.abs(fiberLength(gRef) - fiberLength(gBig)) < 1e-12);
  const KRef = scaleFactor(gRef);
  const KBig = scaleFactor(gBig);
  assert.ok(Math.abs(KBig / KRef - 2) < EPS);
  assert.ok(Math.abs(KRef - expectedK(gRef)) / expectedK(gRef) < EPS);
  assert.ok(Math.abs(KBig - expectedK(gBig)) / expectedK(gBig) < EPS);
});

test('两只线圈交错调用多轮（正算/反演），每轮结果只由自身几何决定', () => {
  const omega = EARTH_ROTATION_RATE;
  for (let round = 0; round < 3; round++) {
    const ref1 = computeOpenLoop(gRef, omega);
    const big1 = computeOpenLoop(gBig, omega);
    const ref2 = computeOpenLoop(gRef, 2 * omega);
    const big2 = computeOpenLoop(gBig, 2 * omega);
    // 反向再交错一轮
    const big3 = computeOpenLoop(gBig, -omega);
    const ref3 = computeOpenLoop(gRef, -omega);

    assert.ok(Math.abs(ref1.scaleFactor - expectedK(gRef)) / expectedK(gRef) < EPS);
    assert.ok(Math.abs(big1.scaleFactor - expectedK(gBig)) / expectedK(gBig) < EPS);
    assert.ok(Math.abs(big1.scaleFactor / ref1.scaleFactor - 2) < EPS);
    assert.ok(Math.abs(big1.phase / ref1.phase - 2) < EPS);

    assert.ok(Math.abs(ref2.phase - 2 * ref1.phase) < 1e-17);
    assert.ok(Math.abs(big2.phase - 2 * big1.phase) < 1e-17);

    // 角速度反号 → 相位反号（每只线圈各自成立，不串号）
    assert.ok(Math.abs(ref3.phase + ref1.phase) < 1e-17);
    assert.ok(Math.abs(big3.phase + big1.phase) < 1e-17);
    assert.ok(ref3.phase < 0 && big3.phase < 0);
  }
});

test('标定反演：同一相位 1e-4，参考线圈 Ω̂≈3.68e-4、大线圈 Ω̂≈1.84e-4，相差一倍', () => {
  const wRef = omegaFromPhase(gRef, 1e-4);
  const wBig = omegaFromPhase(gBig, 1e-4);
  assert.ok(Math.abs(wRef - 1e-4 / expectedK(gRef)) < 1e-16);
  assert.ok(Math.abs(wBig - 1e-4 / expectedK(gBig)) < 1e-16);
  assert.ok(Math.abs(wRef / wBig - 2) < EPS);
  assert.ok(Math.abs(wBig - 1.84e-4) / 1.84e-4 < 5e-3);
  assert.ok(Math.abs(wRef - 3.68e-4) / 3.68e-4 < 5e-3);
});

test('扫描与闭环口径下两只线圈同样各自隔离，互不渗透', () => {
  const omegas = [-EARTH_ROTATION_RATE, 0, EARTH_ROTATION_RATE];
  const sRef = scanOmegas(gRef, omegas);
  const sBig = scanOmegas(gBig, omegas);
  assert.ok(Math.abs(sBig.scaleFactor / sRef.scaleFactor - 2) < EPS);
  assert.equal(sRef.samples.length, 3);
  assert.equal(sBig.samples.length, 3);
  sRef.samples.forEach((s, i) => {
    assert.ok(Math.abs(s.phase - sagnacPhase(gRef, omegas[i])) < 1e-18);
  });
  sBig.samples.forEach((s, i) => {
    assert.ok(Math.abs(s.phase - sagnacPhase(gBig, omegas[i])) < 1e-18);
    if (omegas[i] !== 0) {
      assert.ok(Math.abs(s.phase / sRef.samples[i].phase - 2) < EPS);
    } else {
      assert.equal(s.phase, 0);
    }
  });

  const cRef = closedLoopOmega(gRef, 1e-4);
  const cBig = closedLoopOmega(gBig, 1e-4);
  assert.ok(Math.abs(cRef.scaleFactor - expectedK(gRef)) / expectedK(gRef) < EPS);
  assert.ok(Math.abs(cBig.scaleFactor - expectedK(gBig)) / expectedK(gBig) < EPS);
  // K 大一倍 → 同相位反演出的角速度小一半
  assert.ok(Math.abs(cBig.omega / cRef.omega - 0.5) < EPS);
});

test('内置参考核对值不被同进程算过的大线圈带偏，且前后两次完全一致', () => {
  computeOpenLoop(gBig, EARTH_ROTATION_RATE);
  const ref1 = getReference();
  assert.ok(Math.abs(ref1.scaleFactor - expectedK(gRef)) / expectedK(gRef) < EPS);
  assert.ok(Math.abs(ref1.earthRotation.phaseMicroRad - 19.82) / 19.82 < 1e-3);

  // 大线圈、参考线圈再各算一遍后复查
  computeOpenLoop(gBig, 2 * EARTH_ROTATION_RATE);
  computeOpenLoop(gRef, 2 * EARTH_ROTATION_RATE);
  const ref2 = getReference();
  assert.equal(ref2.scaleFactor, ref1.scaleFactor);
  assert.equal(ref2.earthRotation.phase, ref1.earthRotation.phase);
  assert.equal(ref2.earthRotation.phaseMicroRad, ref1.earthRotation.phaseMicroRad);
});

test('正反两种调用顺序对更多线圈（含第三只同总长线圈、倍波长线圈）给出完全一致结果', () => {
  const coils: CoilGeometry[] = [
    gRef,
    gBig,
    { radius: 0.2, turns: 160, wavelength: WAVELENGTH }, // 同总长 201.06 m，K 再翻倍
    { radius: 0.05, turns: 320, wavelength: WAVELENGTH }, // 匝数减半：总长减半
    { radius: 0.1, turns: 640, wavelength: WAVELENGTH },
    { radius: 0.05, turns: 640, wavelength: 3.1e-6 }, // 波长加倍：K 减半
  ];
  const omega = 1.234e-4;

  const run = (list: CoilGeometry[]) =>
    list.map((g) => {
      const phase = sagnacPhase(g, omega);
      return { K: scaleFactor(g), phase, back: omegaFromPhase(g, phase) };
    });

  const forward = run(coils);
  const reverse = run([...coils].reverse());

  forward.forEach((r, i) => {
    const r2 = reverse[coils.length - 1 - i];
    // 顺序无关：两种顺序逐字段严格一致
    assert.equal(r2.K, r.K);
    assert.equal(r2.phase, r.phase);
    assert.equal(r2.back, r.back);

    // 且每个值都只由自身几何按解析公式决定
    const K = expectedK(coils[i]);
    assert.ok(Math.abs(r.K - K) / K < 1e-12);
    assert.ok(Math.abs(r.phase - K * omega) / (K * omega) < 1e-12);
    assert.ok(Math.abs(r.back - omega) < 1e-18);
  });

  // 三只同总长线圈的 K 之比 1 : 2 : 4
  const K0 = forward[0].K;
  assert.ok(Math.abs(forward[1].K / K0 - 2) < EPS);
  assert.ok(Math.abs(forward[2].K / K0 - 4) < EPS);
  // 倍波长线圈 K 减半
  assert.ok(Math.abs(forward[5].K / K0 - 0.5) < EPS);
});
