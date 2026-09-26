# FOG Sagnac 计算内核

光纤陀螺实验台的**纯后端干涉陀螺计算内核**：根据线圈几何（半径 R、匝数 N、
真空波长 λ）与输入角速度 Ω 还原 Sagnac 干涉相位，并由实测相位反演标定角速度。
仅通过 HTTP（Fastify）工作，无网页界面，不做罗盘/航迹显示，也不含惯导误差状态滤波。

运行时：**Node.js 20 + TypeScript（编译为 JS 产物执行）+ Fastify**。

## 物理模型

```
光纤总长度   L   = 2π · R · N                （一圈周长 × 匝数，绝不能漏 N）
Sagnac 相位  Δφ  = 4π · R · L · Ω / (λ · c)  = K · Ω
标度因数     K   = 4π · R · L / (λ · c)       [s]
反演角速度   Ω̂   = Δφ / K
```

真空光速固定 `c = 2.99792458e8 m/s`。

**内置参考线圈**：R = 0.05 m，N = 640，λ = 1.55 μm ⇒ L ≈ 201.06 m，K ≈ 0.2719 s。
在地球自转 Ω_E = 7.2921159e-5 rad/s 下 **Δφ ≈ 1.982e-5 rad ≈ 19.8 μrad**，
为可检出的微弧度级相位，供快速核对量纲与系数（`GET /reference`）。

**相位模糊**：开环干涉对 cos(Δφ) 敏感、周期 2π。当 |Δφ| ≥ 0.9π 时响应
**显式返回 `ambiguity.ambiguous = true` 与中文警告**；服务绝不折叠相位，
Ω̂ 始终按原始相位线性反演，不会返回被悄悄换到错误象限的“看似正常”角速度。

闭环只做一层很薄的偏置/反馈修正（稳态 φ_err = Δφ ⇒ Ω = φ_err/K），
不含滤波与误差状态估计。

## 模块划分

| 文件 | 职责 |
| --- | --- |
| `src/config.ts` | 光速、模糊阈值、参考线圈、地球自转常数 |
| `src/types.ts` | 共享类型 |
| `src/validation.ts` | 输入校验（R/N/λ ≤ 0 等一律带原因拒绝） |
| `src/geometry.ts` | 圈周长、**含匝数 N 的**光纤总长、标度因数 |
| `src/sagnac.ts` | 相位正算、相位反演角速度（主链路） |
| `src/ambiguity.ts` | 近 π 模糊判定（只告警，不折叠反演） |
| `src/scan.ts` | 角速度网格/数组逐点真算采样 |
| `src/closedloop.ts` | 闭环薄层修正 |
| `src/reference.ts` | 内置参考线圈核对信息 |
| `src/server.ts` | Fastify HTTP 路由与错误 JSON |
| `src/index.ts` | 入口，监听固定端口 3000 |

## 本地构建与运行

```bash
npm install
npm run build
npm start            # http://localhost:3000
npm test             # tsc 编译 + node --test dist/test/
```

## Docker

```bash
docker build -t fog-sagnac-kernel .
docker run --rm -p 3000:3000 fog-sagnac-kernel
docker run --rm fog-sagnac-kernel npm test   # 容器内运行自动化测试
```

## HTTP 接口

### `GET /health`
存活探针。

### `GET /reference`
内置约 200 m 参考线圈的 L、K 与地球自转下的相位（rad 与 μrad）。

### `POST /phase`（类别一：单角速度正算）
请求：
```json
{ "geometry": { "radius": 0.05, "turns": 640, "wavelength": 1.55e-6 }, "omega": 1e-4 }
```
返回：`geometry, fiberLength, omega, phase, scaleFactor, omegaHat, ambiguity`。

### `POST /calibrate`（类别二：实测相位反演）
请求：`{ "geometry": {...}, "phase": 0.00002 }`（可选 `threshold` 覆盖 0.9π）。
返回：`measuredPhase, scaleFactor, omegaHat, ambiguity`；近 π 时带显式警告。

### `POST /scan`（角速度扫描）
二选一：
```json
{ "geometry": {...}, "angularVelocities": [-0.0002, 0, 0.0002] }
{ "geometry": {...}, "grid": { "start": -0.0001, "stop": 0.0001, "count": 5 } }
```
返回 `samples: [{ omega, phase }, ...]`，**逐点真算**（每点独立走完整正算链路）。

### `POST /closed-loop`（闭环薄层）
请求：`{ "geometry": {...}, "feedbackPhase": 0.00002 }` ⇒ `omega`。

### 错误格式（HTTP 400）
```json
{ "error": "invalid_request", "field": "radius", "reason": "半径 radius 必须大于 0（收到 0）……" }
```

## 测试锁定的交叉关系

- **反号对称**：Ω → −Ω ⇒ Δφ → −Δφ，绝对值不变；
- **半径加倍（N 不变）**：L 加倍、Δφ 变 4 倍；
- **波长加倍**：Δφ 减半；
- **半径为零**：带原因的 400 错误；
- **N 倍坑**：显式断言“漏掉匝数的错误 K”恰好差 N 倍；
- 正反演往返一致、近 π 不折叠、扫描逐点真算、两组配置同进程隔离。
