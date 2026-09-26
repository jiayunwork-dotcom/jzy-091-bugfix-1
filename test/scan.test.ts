/**
 * 扫描模块测试：序列必须逐点真算，不能用一条过原点的直线糊弄。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { linspace, scanOmegas } from '../src/scan.js';
import { sagnacPhase } from '../src/sagnac.js';
import { AMBIGUITY_THRESHOLD } from '../src/config.js';

const g = { radius: 0.05, turns: 640, wavelength: 1.55e-6 };

test('linspace 端点各采样一次、等间距、支持反向', () => {
  assert.deepEqual(linspace({ start: 0, stop: 10, count: 6 }), [0, 2, 4, 6, 8, 10]);
  assert.deepEqual(linspace({ start: 10, stop: 0, count: 6 }), [10, 8, 6, 4, 2, 0]);
  assert.deepEqual(linspace({ start: -1, stop: 1, count: 3 }), [-1, 0, 1]);
});

test('扫描序列逐点等于单点正算（反号点也覆盖）', () => {
  const omegas = [-3e-4, -1e-4, 0, 1e-4, 3e-4];
  const result = scanOmegas(g, omegas);
  assert.equal(result.count, 5);
  assert.equal(result.samples.length, 5);
  result.samples.forEach((s, i) => {
    assert.equal(s.omega, omegas[i]);
    const truth = sagnacPhase(g, omegas[i]);
    assert.ok(Math.abs(s.phase - truth) <= Math.abs(truth) * 1e-14 + 1e-300);
  });
});

test('扫描包含 0 点，0 点相位严格为 0（而不是直线外推出来的假数据）', () => {
  const result = scanOmegas(g, linspace({ start: -1e-4, stop: 1e-4, count: 9 }));
  const zero = result.samples.find((s) => s.omega === 0);
  assert.ok(zero);
  assert.equal(zero!.phase, 0);
});

test('反号采样相位反号且绝对值相等（扫描口径下同样成立）', () => {
  const result = scanOmegas(g, [2.5e-4, -2.5e-4]);
  const [a, b] = result.samples;
  assert.ok(Math.abs(a.phase + b.phase) < 1e-15);
});

test('网格进入近 π 区域不影响逐点真实性（阈值作为元数据返回）', () => {
  const result = scanOmegas(g, linspace({ start: 0, stop: 100, count: 11 }));
  assert.equal(result.ambiguityThreshold, AMBIGUITY_THRESHOLD);
  // 末点相位（rad）远超 π，仍按原始线性关系真算
  const last = result.samples[10];
  assert.ok(Math.abs(last.phase - sagnacPhase(g, 100)) < 1e-10);
});
