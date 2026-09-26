/**
 * 模糊判定测试：|Δφ| 接近 π 必须显式告警，
 * 且反演绝不折叠相位、不返回被悄悄换到错误象限的“看似正常”角速度。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assessAmbiguity, wrapToPrincipal } from '../src/ambiguity.js';
import { omegaFromPhase, sagnacPhase } from '../src/sagnac.js';
import { AMBIGUITY_THRESHOLD } from '../src/config.js';

test('小相位（微弧度量级）不模糊、无警告', () => {
  const r = assessAmbiguity(2e-5);
  assert.equal(r.ambiguous, false);
  assert.equal(r.warning, null);
  assert.equal(r.wrappedPhase, null);
});

test('|Δφ| 达到 0.9π 阈值必须模糊并给出人读警告', () => {
  const r = assessAmbiguity(AMBIGUITY_THRESHOLD);
  assert.equal(r.ambiguous, true);
  assert.match(r.warning ?? '', /模糊/);
  assert.match(r.warning ?? '', /未对相位做任何折叠/);
});

test('|Δφ| = π 与超过 π 均显式模糊（负相位同样告警）', () => {
  assert.equal(assessAmbiguity(Math.PI).ambiguous, true);
  assert.equal(assessAmbiguity(-Math.PI).ambiguous, true);
  assert.equal(assessAmbiguity(3 * Math.PI).ambiguous, true);
});

test('主值折叠只作为参考信息：wrap 2π-0.1 → -0.1，但不进入反演', () => {
  assert.ok(Math.abs(wrapToPrincipal(2 * Math.PI - 0.1) - -0.1) < 1e-12);
});

test('反演绝不折叠：相位 1.5π 的 Ω̂ 必须按 1.5π 线性反演，而非折叠后的 -0.5π', () => {
  const g = { radius: 0.05, turns: 640, wavelength: 1.55e-6 };
  const phase = 1.5 * Math.PI;
  const r = assessAmbiguity(phase);
  assert.equal(r.ambiguous, true);

  const omegaHat = omegaFromPhase(g, phase);
  const foldedOmega = (-0.5 * Math.PI) / (sagnacPhase(g, 1) / 1); // 若错误折叠会得到的值
  assert.ok(Math.abs(omegaHat - foldedOmega) > 1e-6, '折叠值必须与真实反演显著不同');
  // 与原始相位线性反演一致
  const K = phase / omegaHat;
  const K0 = sagnacPhase(g, 1);
  assert.ok(Math.abs(K - K0) / K0 < 1e-12);
});

test('零相位不模糊', () => {
  assert.equal(assessAmbiguity(0).ambiguous, false);
});
