/**
 * HTTP 层（Fastify）——只负责请求解析、调用计算模块、统一错误 JSON。
 * 不承载任何 Sagnac 计算逻辑。
 *
 * 路由：
 *   GET  /health        存活探针
 *   GET  /reference     内置约 200 m 参考线圈 + 地球自转参考相位
 *   POST /phase         几何 + 单个角速度 → 相位 / 标度因数 / 反演角速度
 *   POST /calibrate     几何 + 实测相位   → 反演角速度（带模糊显式告警）
 *   POST /scan          几何 + 角速度数组或线性网格 → 逐点真算采样序列
 *   POST /closed-loop   几何 + 解调反馈相位 → 薄层闭环反演角速度
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { fiberLength } from './geometry.js';
import { computeOpenLoop, omegaFromPhase, scaleFactor } from './sagnac.js';
import { assessAmbiguity } from './ambiguity.js';
import { closedLoopOmega } from './closedloop.js';
import { linspace, scanOmegas } from './scan.js';
import { getReference } from './reference.js';
import {
  ValidationError,
  validateGeometry,
  validateGrid,
  validateOmega,
  validateOmegaList,
} from './validation.js';
import { AMBIGUITY_THRESHOLD } from './config.js';

/** 构建并配置好的 Fastify 应用（不监听端口，便于测试注入） */
export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof ValidationError) {
      reply.status(400).send(err.toJSON());
      return;
    }
    // Fastify body 解析错误等
    if ((err as { statusCode?: number }).statusCode === 400) {
      reply.status(400).send({
        error: 'invalid_request',
        reason: `请求体不是合法 JSON：${err.message}`,
      });
      return;
    }
    app.log.error(err);
    reply.status(500).send({ error: 'internal_error', reason: err.message });
  });

  app.get('/health', async () => ({ status: 'ok', service: 'fog-sagnac-kernel' }));

  app.get('/reference', async () => getReference());

  // 类别一：几何 + 单个角速度 → 相位、标度因数、反演角速度
  app.post('/phase', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const geometry = validateGeometry(body.geometry);
    const omega = validateOmega(body.omega, 'omega');

    const result = computeOpenLoop(geometry, omega);
    return reply.send({
      geometry,
      fiberLength: fiberLength(geometry),
      omega,
      phase: result.phase,
      scaleFactor: result.scaleFactor,
      omegaHat: result.omegaHat,
      ambiguity: result.ambiguity,
    });
  });

  // 类别二（反演）：几何 + 实测相位 → 角速度；近 π 必须显式告警
  app.post('/calibrate', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const geometry = validateGeometry(body.geometry);
    const measuredPhase = validateOmega(body.phase, 'phase');
    const threshold =
      body.threshold === undefined
        ? AMBIGUITY_THRESHOLD
        : validateOmega(body.threshold, 'threshold');

    const K = scaleFactor(geometry);
    const ambiguity = assessAmbiguity(measuredPhase, threshold);
    const omegaHat = omegaFromPhase(geometry, measuredPhase);

    return reply.send({
      geometry,
      fiberLength: fiberLength(geometry),
      measuredPhase,
      scaleFactor: K,
      omegaHat,
      ambiguity,
    });
  });

  // 类别一延伸：角速度网格/数组 → 逐点真算的相位采样序列
  app.post('/scan', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const geometry = validateGeometry(body.geometry);

    const hasList = 'angularVelocities' in body;
    const hasGrid = 'grid' in body;
    if (hasList === hasGrid) {
      throw new ValidationError(
        '必须且只能提供 angularVelocities（角速度数组）或 grid（{start,stop,count}）之一',
        hasList && hasGrid ? 'angularVelocities/grid' : 'scan',
      );
    }

    const omegas = hasList
      ? validateOmegaList(body.angularVelocities)
      : linspace(validateGrid(body.grid));

    return reply.send(scanOmegas(geometry, omegas));
  });

  // 闭环偏置修正（薄层）
  app.post('/closed-loop', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const geometry = validateGeometry(body.geometry);
    const feedbackPhase = validateOmega(body.feedbackPhase, 'feedbackPhase');
    return reply.send(closedLoopOmega(geometry, feedbackPhase));
  });

  // 让未匹配路由也返回 JSON
  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: 'not_found', reason: '路由不存在' });
  });

  return app;
}
