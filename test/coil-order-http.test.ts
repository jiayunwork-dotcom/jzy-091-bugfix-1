/**
 * HTTP 端到端跨线圈顺序回归（Fastify inject，不起真实端口）。
 *
 * 与 coil-isolation.test.ts（全新进程先打大线圈）相反，本文件在
 * “全新进程”里严格按用户首次复现的顺序操作：
 *   先 GET /reference → 再 POST 大线圈 → 再回到 /reference。
 * 两者的 scale-factor 缓存必须互不串味：
 *   参考线圈 K≈0.2719 s、地球自转相位≈19.8 μrad；
 *   大线圈   K≈0.5437 s、地球自转相位≈39.6 μrad；
 *   /calibrate phase=1e-4 → 参考 Ω̂≈3.68e-4，大线圈 Ω̂≈1.84e-4。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildServer } from '../src/server.js';
import { EARTH_ROTATION_RATE } from '../src/config.js';

const app = buildServer();

const gRef = { radius: 0.05, turns: 640, wavelength: 1.55e-6 };
const gBig = { radius: 0.1, turns: 320, wavelength: 1.55e-6 };

const REL = 1e-12;

test('顺序①：全新服务先 GET /reference，参考线圈 0.2719 s / 19.8 μrad', async () => {
  const res = await app.inject({ method: 'GET', url: '/reference' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.fiberLength > 201 && body.fiberLength < 201.1, true);
  assert.ok(Math.abs(body.scaleFactor - 0.271867) / 0.271867 < 1e-5);
  assert.ok(Math.abs(body.earthRotation.phaseMicroRad - 19.82) / 19.82 < 1e-3);
});

test('顺序②：参考之后提交大线圈 /phase，K 翻倍到 0.5437 s、相位 39.6 μrad', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/phase',
    payload: { geometry: gBig, omega: EARTH_ROTATION_RATE },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  // 总长仍约 201.06 m，与参考线圈一致
  assert.ok(body.fiberLength > 201 && body.fiberLength < 201.1);
  assert.ok(Math.abs(body.scaleFactor - 0.5437) / 0.5437 < 1e-3);
  assert.ok(Math.abs(body.phase * 1e6 - 39.65) / 39.65 < 1e-3);
  assert.ok(Math.abs(body.omegaHat - EARTH_ROTATION_RATE) < 1e-18);
});

test('顺序③：大线圈之后 /calibrate 反演 phase=1e-4 给出 1.84e-4（不是 3.68e-4）', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/calibrate',
    payload: { geometry: gBig, phase: 1e-4 },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Math.abs(body.scaleFactor - 0.5437) / 0.5437 < 1e-3);
  assert.ok(Math.abs(body.omegaHat - 1.84e-4) / 1.84e-4 < 5e-3);
});

test('顺序④：大线圈之后 /scan 与 /closed-loop 仍按大线圈 K=0.5437 s', async () => {
  const scan = await app.inject({
    method: 'POST',
    url: '/scan',
    payload: { geometry: gBig, angularVelocities: [0, EARTH_ROTATION_RATE] },
  });
  assert.equal(scan.statusCode, 200);
  const scanBody = scan.json();
  assert.ok(Math.abs(scanBody.scaleFactor - 0.5437) / 0.5437 < 1e-3);
  assert.equal(scanBody.samples[0].phase, 0);
  assert.ok(Math.abs(scanBody.samples[1].phase * 1e6 - 39.65) / 39.65 < 1e-3);

  const cl = await app.inject({
    method: 'POST',
    url: '/closed-loop',
    payload: { geometry: gBig, feedbackPhase: 1e-4 },
  });
  assert.equal(cl.statusCode, 200);
  const clBody = cl.json();
  assert.ok(Math.abs(clBody.scaleFactor - 0.5437) / 0.5437 < 1e-3);
  assert.ok(Math.abs(clBody.omega - 1.84e-4) / 1.84e-4 < 5e-3);
});

test('顺序⑤：回到 /reference 与参考线圈 /phase，内置值未被带偏（仍 19.8 μrad）', async () => {
  const refRes = await app.inject({ method: 'GET', url: '/reference' });
  const refBody = refRes.json();
  assert.ok(Math.abs(refBody.scaleFactor - 0.271867) / 0.271867 < 1e-5);
  assert.ok(Math.abs(refBody.earthRotation.phaseMicroRad - 19.82) / 19.82 < 1e-3);

  const phaseRes = await app.inject({
    method: 'POST',
    url: '/phase',
    payload: { geometry: gRef, omega: EARTH_ROTATION_RATE },
  });
  const phaseBody = phaseRes.json();
  assert.ok(Math.abs(phaseBody.scaleFactor - 0.271867) / 0.271867 < 1e-5);
  assert.ok(Math.abs(phaseBody.phase * 1e6 - 19.82) / 19.82 < 1e-3);

  const calRes = await app.inject({
    method: 'POST',
    url: '/calibrate',
    payload: { geometry: gRef, phase: 1e-4 },
  });
  assert.ok(Math.abs(calRes.json().omegaHat - 3.68e-4) / 3.68e-4 < 5e-3);
});

test('顺序⑥：两只线圈在同一服务内多轮交替调用，所有结果逐轮一致、始终 2:1', async () => {
  interface Snapshot {
    scaleFactor: number;
    phase: number;
    omegaHat: number;
    fiberLength: number;
  }
  const snap = async (geometry: typeof gRef): Promise<Snapshot> => {
    const res = await app.inject({
      method: 'POST',
      url: '/phase',
      payload: { geometry, omega: EARTH_ROTATION_RATE },
    });
    assert.equal(res.statusCode, 200);
    return res.json();
  };

  const firstRef = await snap(gRef);
  const firstBig = await snap(gBig);

  for (let round = 0; round < 4; round++) {
    const a = round % 2 === 0 ? await snap(gBig) : await snap(gRef);
    const b = round % 2 === 0 ? await snap(gRef) : await snap(gBig);
    const refSnap = round % 2 === 0 ? b : a;
    const bigSnap = round % 2 === 0 ? a : b;

    for (const key of ['scaleFactor', 'phase', 'omegaHat', 'fiberLength'] as const) {
      assert.equal(refSnap[key], firstRef[key], `参考线圈第${round + 1}轮 ${key} 漂移`);
      assert.equal(bigSnap[key], firstBig[key], `大线圈第${round + 1}轮 ${key} 漂移`);
    }
    assert.ok(Math.abs(bigSnap.scaleFactor / refSnap.scaleFactor - 2) < REL);
    assert.ok(Math.abs(bigSnap.phase / refSnap.phase - 2) < REL);
    assert.ok(Math.abs(refSnap.omegaHat / bigSnap.omegaHat - 1) < REL);
  }
});
