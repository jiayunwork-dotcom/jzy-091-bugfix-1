/**
 * 闭环薄层与配置隔离测试。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { closedLoopOmega } from '../src/closedloop.js';
import { computeOpenLoop } from '../src/sagnac.js';
import { REFERENCE_GEOMETRY } from '../src/config.js';

const EPS = 1e-12;

test('闭环：φ_err = Δφ 时 Ω = φ_err/K 与开环正算角速度一致', () => {
  const g = { ...REFERENCE_GEOMETRY };
  const omega = 5e-5;
  const open = computeOpenLoop(g, omega);
  const cl = closedLoopOmega(g, open.phase);
  assert.ok(Math.abs(cl.omega - omega) < EPS);
  assert.ok(Math.abs(cl.scaleFactor - open.scaleFactor) < EPS);
});

test('闭环反号对称', () => {
  const clPos = closedLoopOmega(REFERENCE_GEOMETRY, 1e-3);
  const clNeg = closedLoopOmega(REFERENCE_GEOMETRY, -1e-3);
  assert.ok(Math.abs(clPos.omega + clNeg.omega) < EPS);
});

test('同进程内两组不同线圈配置结果各自隔离，互不渗透', () => {
  const gA = { radius: 0.05, turns: 640, wavelength: 1.55e-6 };
  const gB = { radius: 0.1, turns: 320, wavelength: 0.8e-6 };
  const omega = 1e-4;

  // 交错调用，检查无共享可变状态
  const a1 = computeOpenLoop(gA, omega);
  const b1 = computeOpenLoop(gB, omega);
  const a2 = computeOpenLoop(gA, omega);
  const b2 = computeOpenLoop(gB, omega);

  assert.ok(Math.abs(a1.phase - a2.phase) < EPS);
  assert.ok(Math.abs(b1.phase - b2.phase) < EPS);
  assert.notEqual(a1.phase, b1.phase);
  assert.notEqual(a1.scaleFactor, b1.scaleFactor);
  assert.ok(Math.abs(a2.scaleFactor - a1.scaleFactor) < EPS);

  // 各自严格满足自己的公式
  const expectedA =
    (4 * Math.PI * gA.radius * 2 * Math.PI * gA.radius * gA.turns * omega) /
    (gA.wavelength * 299_792_458);
  const expectedB =
    (4 * Math.PI * gB.radius * 2 * Math.PI * gB.radius * gB.turns * omega) /
    (gB.wavelength * 299_792_458);
  assert.ok(Math.abs(a1.phase - expectedA) / expectedA < 1e-12);
  assert.ok(Math.abs(b1.phase - expectedB) / expectedB < 1e-12);

  // 返回的几何快照互不影响
  const cl = closedLoopOmega(gA, 1);
  cl.geometry.radius = 999;
  assert.equal(gA.radius, 0.05);
});
