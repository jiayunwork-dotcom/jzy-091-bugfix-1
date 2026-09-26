/**
 * Sagnac 正算 / 反演主链路测试，重点锁住需求点名的交叉关系：
 *   1) 角速度反号 → 相位反号、绝对值不变；
 *   2) 匝数不变、半径加倍 → 总长加倍、相位变 4 倍；
 *   3) 波长加倍 → 相位减半；
 *   4) 半径取零 → 报错；
 *   5) 反演 Ω̂ = Δφ/K 与输入 Ω 一致（往返）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeOpenLoop, omegaFromPhase, sagnacPhase } from '../src/sagnac.js';
import { fiberLength } from '../src/geometry.js';
import {
  EARTH_ROTATION_RATE,
  REFERENCE_GEOMETRY,
  SPEED_OF_LIGHT,
} from '../src/config.js';
import { ValidationError } from '../src/validation.js';

const EPS = 1e-12;
const OMEGA = 1e-4; // rad/s

test('直接核对公式系数：Δφ = 4π·R·L·Ω/(λ·c)', () => {
  const g = REFERENCE_GEOMETRY;
  const L = fiberLength(g);
  const expected = (4 * Math.PI * g.radius * L * OMEGA) / (g.wavelength * SPEED_OF_LIGHT);
  assert.ok(Math.abs(sagnacPhase(g, OMEGA) - expected) / expected < 1e-13);
});

test('关系①：角速度反号，相位随之反号而绝对值不变', () => {
  const pPlus = sagnacPhase(REFERENCE_GEOMETRY, OMEGA);
  const pMinus = sagnacPhase(REFERENCE_GEOMETRY, -OMEGA);

  assert.ok(pPlus > 0);
  assert.ok(pMinus < 0);
  assert.ok(Math.abs(pMinus + pPlus) < EPS, `${pPlus} vs ${pMinus}`);
  assert.ok(Math.abs(Math.abs(pMinus) - Math.abs(pPlus)) < EPS);
});

test('关系②：匝数不变半径加倍 → 光纤总长加倍、相位变为四倍', () => {
  const g1 = { radius: 0.05, turns: 640, wavelength: 1.55e-6 };
  const g2 = { ...g1, radius: 0.1 };

  const L1 = fiberLength(g1);
  const L2 = fiberLength(g2);
  assert.ok(Math.abs(L2 / L1 - 2) < EPS, '总长应加倍');

  const p1 = sagnacPhase(g1, OMEGA);
  const p2 = sagnacPhase(g2, OMEGA);
  assert.ok(Math.abs(p2 / p1 - 4) < EPS, `相位应变为四倍，实际 ${p2 / p1}`);
});

test('关系③：波长加倍，相位减半', () => {
  const g1 = { radius: 0.05, turns: 640, wavelength: 1.55e-6 };
  const g2 = { ...g1, wavelength: 3.1e-6 };
  const p1 = sagnacPhase(g1, OMEGA);
  const p2 = sagnacPhase(g2, OMEGA);
  assert.ok(Math.abs(p2 / p1 - 0.5) < EPS);
});

test('关系④：半径取零直接报错', () => {
  assert.throws(
    () => sagnacPhase({ radius: 0, turns: 640, wavelength: 1.55e-6 }, OMEGA),
    ValidationError,
  );
});

test('反演：Ω̂ = Δφ/K 与正算输入一致（严格逆过程）', () => {
  for (const omega of [0, OMEGA, -OMEGA, 7.292e-5]) {
    const phase = sagnacPhase(REFERENCE_GEOMETRY, omega);
    const omegaHat = omegaFromPhase(REFERENCE_GEOMETRY, phase);
    assert.ok(Math.abs(omegaHat - omega) <= Math.abs(omega) * 1e-12 + 1e-300);
  }
});

test('computeOpenLoop 同时给出相位、标度因数、反演角速度且自洽', () => {
  const r = computeOpenLoop(REFERENCE_GEOMETRY, OMEGA);
  assert.ok(Math.abs(r.phase - r.scaleFactor * OMEGA) < EPS);
  assert.ok(Math.abs(r.omegaHat - OMEGA) < EPS);
  assert.equal(r.ambiguity.ambiguous, false);
  assert.equal(r.ambiguity.warning, null);
});

test('参考线圈在地球自转量级给出微弧度级（约 19.8 μrad）可检出相位', () => {
  const r = computeOpenLoop(REFERENCE_GEOMETRY, EARTH_ROTATION_RATE);
  const microRad = r.phase * 1e6;
  assert.ok(microRad > 10 && microRad < 30, `phase=${microRad} μrad`);
  assert.ok(Math.abs(microRad - 19.82) / 19.82 < 1e-3, `phase=${microRad} μrad`);
  // 该量级远未接近 π，不应误报模糊
  assert.equal(r.ambiguity.ambiguous, false);
});

test('标度因数数量级核对：参考线圈 K ≈ 0.2719 s', () => {
  const r = computeOpenLoop(REFERENCE_GEOMETRY, 1);
  assert.ok(Math.abs(r.scaleFactor - 0.271867) / 0.271867 < 1e-5);
});
