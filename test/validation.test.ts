/**
 * 校验模块测试：半径/匝数/波长 <= 0 必须以带原因的错误拒绝。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ValidationError,
  validateGeometry,
  validateGrid,
  validateOmega,
  validateOmegaList,
} from '../src/validation.js';

const valid = { radius: 0.05, turns: 640, wavelength: 1.55e-6 };

test('半径为零必须报错且原因中说明', () => {
  assert.throws(
    () => validateGeometry({ ...valid, radius: 0 }),
    (e: unknown) => e instanceof ValidationError && /radius/.test(e.reason) && /大于 0/.test(e.reason),
  );
});

test('半径为负必须报错', () => {
  assert.throws(() => validateGeometry({ ...valid, radius: -0.01 }), ValidationError);
});

test('匝数为零或负必须报错', () => {
  assert.throws(() => validateGeometry({ ...valid, turns: 0 }), ValidationError);
  assert.throws(() => validateGeometry({ ...valid, turns: -3 }), ValidationError);
  assert.throws(() => validateGeometry({ ...valid, turns: 1.5 }), ValidationError);
});

test('波长为零或负必须报错', () => {
  assert.throws(() => validateGeometry({ ...valid, wavelength: 0 }), ValidationError);
  assert.throws(() => validateGeometry({ ...valid, wavelength: -1e-6 }), ValidationError);
});

test('NaN / Infinity / 类型错误必须报错', () => {
  assert.throws(() => validateGeometry({ ...valid, radius: Number.NaN }), ValidationError);
  assert.throws(() => validateGeometry({ ...valid, wavelength: Number.POSITIVE_INFINITY }), ValidationError);
  assert.throws(() => validateGeometry(null), ValidationError);
  assert.throws(() => validateGeometry({ radius: 0.05, turns: 640 }), ValidationError);
});

test('错误 JSON 带 error/reason/field 字段', () => {
  try {
    validateGeometry({ ...valid, radius: 0 });
    assert.fail('应当抛错');
  } catch (e) {
    const payload = (e as ValidationError).toJSON();
    assert.equal(payload.error, 'invalid_request');
    assert.equal(payload.field, 'radius');
    assert.match(payload.reason, /大于 0/);
  }
});

test('角速度允许 0 与负值（反号对称需要）', () => {
  assert.equal(validateOmega(0), 0);
  assert.equal(validateOmega(-1e-4), -1e-4);
});

test('角速度数组不能为空，网格 count 必须 >=2', () => {
  assert.throws(() => validateOmegaList([]), ValidationError);
  assert.doesNotThrow(() => validateOmegaList([0, 1, -1]));
  assert.throws(() => validateGrid({ start: 0, stop: 1, count: 1 }), ValidationError);
  assert.doesNotThrow(() => validateGrid({ start: 1, stop: -1, count: 5 }));
});
