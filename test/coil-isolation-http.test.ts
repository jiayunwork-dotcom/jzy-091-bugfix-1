/**
 * HTTP 端到端回归：两只同总长、同波长的线圈经 HTTP 交替调用，
 * 以及调换调用顺序后结果不变。
 *
 * 故障原型见 coil-isolation.test.ts：缓存键只含 L|λ 时，
 * /reference 与大线圈 /phase 会在同进程内互相把标度因数顶号，
 * 谁先被调用就用谁的 K（19.8 μrad 与 39.6 μrad 随顺序翻转）。
 *
 * 这里用两个全新 server 实例复现“服务刚起来”的两种首调方向，
 * 并覆盖 /phase、/calibrate、/scan、/closed-loop、/reference。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';

import { buildServer } from '../src/server.js';

const refCoil = { radius: 0.05, turns: 640, wavelength: 1.55e-6 };
const largeCoil = { radius: 0.1, turns: 320, wavelength: 1.55e-6 };
const EARTH = 7.2921159e-5;
const SPEED_OF_LIGHT = 299_792_458;

/** 按定义式全精度计算 K，作为不依赖被测实现的基准（≈0.27187 / 0.54374 s） */
function expectedK(g: { radius: number; turns: number; wavelength: number }): number {
  const L = 2 * Math.PI * g.radius * g.turns;
  return (4 * Math.PI * g.radius * L) / (g.wavelength * SPEED_OF_LIGHT);
}

const K_REF = expectedK(refCoil);
const K_LARGE = expectedK(largeCoil);

/** 在给定 server 上 POST 并取 JSON */
async function post(
  app: FastifyInstance,
  url: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>,
): Promise<{ statusCode: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload });
  return { statusCode: res.statusCode, body: res.json() };
}

/** 核对一只线圈在全部链路上的标度因数与正/反算量值 */
async function assertCoilValues(app: FastifyInstance, label: string): Promise<void> {
  const K = label === 'large' ? K_LARGE : K_REF;
  const g = label === 'large' ? largeCoil : refCoil;
  const microRad = label === 'large' ? 39.65 : 19.82;

  // /phase
  const phase = await post(app, '/phase', { geometry: g, omega: EARTH });
  assert.equal(phase.statusCode, 200);
  assert.ok(Math.abs(phase.body.scaleFactor - K) / K < 1e-9, `${label} /phase K`);
  assert.ok(Math.abs(phase.body.phase * 1e6 - microRad) / microRad < 1e-3, `${label} /phase`);
  assert.ok(Math.abs(phase.body.omegaHat - EARTH) < 1e-12, `${label} /phase omegaHat`);
  assert.ok(Math.abs(phase.body.fiberLength - 201.0619) < 1e-3, `${label} fiberLength`);

  // /calibrate：phase=1e-4 → Ω̂ = 1e-4/K
  const calib = await post(app, '/calibrate', { geometry: g, phase: 1e-4 });
  assert.equal(calib.statusCode, 200);
  assert.ok(Math.abs(calib.body.scaleFactor - K) / K < 1e-9, `${label} /calibrate K`);
  assert.ok(
    Math.abs(calib.body.omegaHat - 1e-4 / K) < Math.abs(1e-4 / K) * 1e-12,
    `${label} /calibrate omegaHat`,
  );

  // /scan：元数据 K 与逐点相位
  const omegas = [-EARTH, 0, EARTH];
  const scan = await post(app, '/scan', { geometry: g, angularVelocities: omegas });
  assert.equal(scan.statusCode, 200);
  assert.ok(Math.abs(scan.body.scaleFactor - K) / K < 1e-9, `${label} /scan K`);
  scan.body.samples.forEach((s: { omega: number; phase: number }, i: number) => {
    assert.ok(Math.abs(s.phase - K * omegas[i]) < 2e-15, `${label} /scan sample ${i}`);
  });

  // /closed-loop
  const cl = await post(app, '/closed-loop', { geometry: g, feedbackPhase: 1e-4 });
  assert.equal(cl.statusCode, 200);
  assert.ok(Math.abs(cl.body.scaleFactor - K) / K < 1e-9, `${label} /closed-loop K`);
  assert.ok(
    Math.abs(cl.body.omega - 1e-4 / K) < Math.abs(1e-4 / K) * 1e-12,
    `${label} /closed-loop omega`,
  );
}

test('顺序一（/reference 先于大线圈）：两只线圈交替调用始终各用各的 K', async () => {
  const app = buildServer();

  const ref0 = await app.inject({ method: 'GET', url: '/reference' });
  assert.equal(ref0.statusCode, 200);
  const ref0Body = ref0.json();
  assert.ok(Math.abs(ref0Body.scaleFactor - K_REF) / K_REF < 1e-9);
  assert.ok(Math.abs(ref0Body.earthRotation.phaseMicroRad - 19.82) / 19.82 < 1e-3);

  await assertCoilValues(app, 'large');
  await assertCoilValues(app, 'reference');

  // 交替再走一轮，结果不随调用历史漂移
  const bigAgain = await post(app, '/phase', { geometry: largeCoil, omega: EARTH });
  const refAgain = await app.inject({ method: 'GET', url: '/reference' });
  const smallAgain = await post(app, '/phase', { geometry: refCoil, omega: EARTH });

  assert.ok(Math.abs(bigAgain.body.scaleFactor - K_LARGE) / K_LARGE < 1e-9);
  assert.ok(Math.abs(smallAgain.body.scaleFactor - K_REF) / K_REF < 1e-9);
  assert.ok(Math.abs(bigAgain.body.phase / smallAgain.body.phase - 2) < 1e-12);
  assert.ok(Math.abs(refAgain.json().earthRotation.phaseMicroRad - 19.82) / 19.82 < 1e-3);

  await app.close();
});

test('顺序二（大线圈先于 /reference，模拟重启后先打第二只线圈）：结果与顺序一一致', async () => {
  const app = buildServer();

  // 服务刚起来的第一个请求就是大线圈
  const bigFirst = await post(app, '/phase', { geometry: largeCoil, omega: EARTH });
  assert.equal(bigFirst.statusCode, 200);
  assert.ok(Math.abs(bigFirst.body.scaleFactor - K_LARGE) / K_LARGE < 1e-9, '大线圈首调 K 被参考值顶号');
  assert.ok(Math.abs(bigFirst.body.phase * 1e6 - 39.65) / 39.65 < 1e-3, '大线圈首调相位应约 39.6 μrad');

  // 随后取内置参考——不能被带偏成大线圈的值
  const refAfter = await app.inject({ method: 'GET', url: '/reference' });
  assert.equal(refAfter.statusCode, 200);
  const refAfterBody = refAfter.json();
  assert.ok(Math.abs(refAfterBody.scaleFactor - K_REF) / K_REF < 1e-9, '参考 K 被大线圈顶号');
  assert.ok(
    Math.abs(refAfterBody.earthRotation.phaseMicroRad - 19.82) / 19.82 < 1e-3,
    '参考相位应约 19.8 μrad，不能报成 39.6 μrad',
  );

  // 两种顺序下，每只线圈的完整链路结果必须完全一致
  await assertCoilValues(app, 'large');
  await assertCoilValues(app, 'reference');

  await app.close();
});

test('两种调用顺序下，同一只线圈的返回值逐字段相同（与历史无关）', async () => {
  const appRefFirst = buildServer();
  const appBigFirst = buildServer();

  await appRefFirst.inject({ method: 'GET', url: '/reference' });
  await post(appBigFirst, '/phase', { geometry: largeCoil, omega: EARTH });

  // 历史不同之后，两只线圈在两个实例上的结果必须一致
  for (const [url, payload] of [
    ['/phase', { geometry: largeCoil, omega: EARTH }],
    ['/phase', { geometry: refCoil, omega: -EARTH }],
    ['/calibrate', { geometry: largeCoil, phase: 1e-4 }],
    ['/closed-loop', { geometry: refCoil, feedbackPhase: 2e-5 }],
  ] as const) {
    const a = await post(appRefFirst, url, payload);
    const b = await post(appBigFirst, url, payload);
    assert.deepEqual(a.body, b.body, `${url} 结果依赖了调用顺序`);
  }

  await Promise.all([appRefFirst.close(), appBigFirst.close()]);
});
