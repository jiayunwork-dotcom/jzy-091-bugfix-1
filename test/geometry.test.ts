/**
 * 几何模块测试：光纤总长必须含匝数 N，杜绝“总长=一圈周长”的 N 倍坑。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fiberLength, loopCircumference, scaleFactor } from '../src/geometry.js';
import { REFERENCE_GEOMETRY, SPEED_OF_LIGHT } from '../src/config.js';

test('一圈周长 = 2πR', () => {
  assert.ok(Math.abs(loopCircumference(1) - 2 * Math.PI) < 1e-15);
});

test('光纤总长 L = 2π·R·N（不是一圈周长）', () => {
  const L = fiberLength({ radius: 0.1, turns: 100, wavelength: 1e-6 });
  assert.ok(Math.abs(L - 2 * Math.PI * 0.1 * 100) < 1e-12);
});

test('匝数翻倍而半径不变，总长翻倍（直接锁住 N 倍坑）', () => {
  const g = { radius: 0.1, turns: 100, wavelength: 1e-6 };
  const g2 = { ...g, turns: 200 };
  assert.ok(Math.abs(fiberLength(g2) / fiberLength(g) - 2) < 1e-12);
});

test('若错把总长当一圈周长，标度因数会差 N 倍——正确实现必须通过', () => {
  const g = { radius: 0.05, turns: 640, wavelength: 1.55e-6 };
  const K = scaleFactor(g);
  const L = fiberLength(g);
  // 正确 K
  const KCorrect = (4 * Math.PI * g.radius * L) / (g.wavelength * SPEED_OF_LIGHT);
  assert.ok(Math.abs(K - KCorrect) / KCorrect < 1e-12);

  // 错误 K（漏掉 N，只用一圈周长）必须与正确值差恰好 N 倍
  const KWrong =
    (4 * Math.PI * g.radius * 2 * Math.PI * g.radius) /
    (g.wavelength * SPEED_OF_LIGHT);
  assert.ok(Math.abs(K / KWrong - g.turns) / g.turns < 1e-9);
});

test('参考线圈总长约 200 m（201.06 m）', () => {
  const L = fiberLength(REFERENCE_GEOMETRY);
  assert.ok(L > 199 && L < 203, `L=${L}`);
});
