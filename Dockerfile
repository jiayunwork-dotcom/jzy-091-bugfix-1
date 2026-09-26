# syntax=docker/dockerfile:1

# ---------- 构建阶段：Node.js 20，TypeScript 编译 ----------
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# 优先利用层缓存安装依赖（含 devDependencies：typescript / 类型）
COPY package.json package-lock.json* ./
RUN npm install

# 拷贝源码与测试，编译为可直接执行的 JS 产物到 dist/
COPY tsconfig.json ./
COPY src ./src
COPY test ./test
RUN npm run build

# 仅保留生产依赖，供运行阶段使用
RUN npm prune --omit=dev

# ---------- 运行阶段 ----------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# 生产依赖（Fastify）、编译产物（含可执行测试）
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

EXPOSE 3000

# 默认启动 HTTP 服务；容器内跑测试：
#   docker run --rm <image> npm test
# （测试需重新编译；若只读 dist 运行，可用：node --test dist/test/）
CMD ["node", "dist/src/index.js"]
