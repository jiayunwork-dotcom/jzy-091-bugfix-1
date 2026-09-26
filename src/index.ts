/**
 * 服务入口：编译产物直接执行（node dist/index.js）。
 * 容器内固定监听 3000 端口；PORT 环境变量仅作本地调试覆盖。
 */
import { buildServer } from './server.js';

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

const app = buildServer();

const shutdown = async (signal: string): Promise<void> => {
  app.log.info(`收到 ${signal}，开始关闭 HTTP 服务`);
  await app.close();
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

app.listen({ port: PORT, host: HOST }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`FOG Sagnac 计算内核已启动：${address}`);
});
