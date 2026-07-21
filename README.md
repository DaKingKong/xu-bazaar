# xu-bazaar

一个轻量化的 PVE 卡牌对战游戏（开发中）。

技术栈：Vite + React + TypeScript + Framer Motion + Zustand。

第一版聚焦战斗系统实现，战斗核心逻辑与渲染层分离，便于未来扩展战斗外成长与卡牌解锁。

## 项目结构

```
src/
  engine/   # 纯 TS 战斗引擎（状态机、结算、AI）—— 不依赖 React/UI
  data/     # 卡牌/仆从定义数据
  store/    # zustand，桥接 engine 与 UI
  ui/       # React 组件（战场、手牌、仆从、动画等）
docs/       # 设计文档（架构、战斗规则、数据模型、实施规范）
```

## 运行方式

```bash
npm install       # 安装依赖
npm run dev       # 启动开发服务器（默认 http://localhost:5173）
npm run build     # 类型检查 + 生产构建
npm test          # 运行单元测试（Vitest）
npm run lint      # ESLint 检查
npm run format    # Prettier 格式化
```

## 进度

当前处于 **M1（项目骨架与类型）**：已搭建 Vite + React + TypeScript 工程，配置 Vitest / ESLint / Prettier，落地核心类型，并提供一个演示 UI 骨架（验证技术栈连通）。

战斗规则（抽牌/能量/疲劳、出牌结算、自动战斗、敌人 AI、完整战斗 UI 与动画）为后续里程碑，详见 [docs/implementation-plan.md](./docs/implementation-plan.md)。

设计文档：[architecture.md](./docs/architecture.md)、[battle-design.md](./docs/battle-design.md)、[data-model.md](./docs/data-model.md)、[implementation-plan.md](./docs/implementation-plan.md)。
