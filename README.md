# xu-bazaar

一个轻量化的 PVE 卡牌对战游戏（开发中）。

技术栈：Vite + React + TypeScript + Framer Motion + Zustand。

第一版聚焦战斗系统实现，战斗核心逻辑与渲染层分离，便于未来扩展战斗外成长与卡牌解锁。

## 项目结构

```
src/
  engine/   # 纯 TS 战斗引擎（状态机、结算、AI）—— 不依赖 React/UI
  data/     # 卡牌/仆从/英雄定义数据
  store/    # zustand，桥接 engine 与 UI
  ui/       # React 组件（战场、手牌、仆从、动画等）
docs/       # 设计文档（架构、战斗规则、数据模型、实施规范）
```

## 运行方式

```bash
npm install       # 安装依赖
npm run dev       # 启动开发服务器（默认 http://localhost:5173/xu-bazaar/）
npm run build     # 类型检查 + 生产构建
npm test          # 运行单元测试（Vitest）
npm run lint      # ESLint 检查
npm run format    # Prettier 格式化
```

## 在线预览 / GitHub Pages

线上地址：[https://DaKingKong.github.io/xu-bazaar/](https://DaKingKong.github.io/xu-bazaar/)

推送到 `main` 后由 [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) 自动构建并部署。首次使用需在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。

## 进度

第一版战斗系统（M1–M7）已完成；默认对局已切换为 **目录卡地狱术士主题组**（见 `docs/card-catalog.md` 基础正文）。

### 已实现

- **抽牌 / 能量 / 疲劳**：首回合抽 5、之后抽 2；手牌上限 10 跳过；能量每回合重置为 4；
  疲劳（伤害固定 2、生成「血战」攻击力 1/2/3…，敌我独立）。
- **弃牌堆（= 墓地）**：法术/攻击卡打出后进弃牌；仆从阵亡后进弃牌。
- **出牌**：仆从插入式召唤、直接攻击卡（打脸限制）、法术（含施法数留手多次打出、仪式、冥界牵引回手免费用打一次等）。
- **词条 / 场地**：嘲讽、护盾、重生、多重攻击、溅射、大型（占两格 + 属性增益 +50%）、
  先锋（战斗开始置顶牌库）、仪式献祭（棋盘占位、献祭达标执行、生命为执行次数、归零进弃牌）、
  全局地狱场地（自动战斗后结算）、击杀抽牌等。
- **自动战斗**：左至右攻击、嘲讽优先、多重/溅射、死亡即时移除 + 格子左移、双向打脸、
  大型占两格、胜负即时判定；随后地狱 tick 与护盾/易伤清除。
- **敌人 AI**：尽量用光能量的组合；对新目标模式（弃牌/友方消灭等）选合法目标（启发式可糙）。
- **store 桥接**：Zustand 持有权威 `BattleState`，按 `BattleEvent[]` 播放动画。
- **战斗 UI**：敌我角色区、7 格仆从/仪式区、手牌、弃牌选用、中线（能量/回合/结束回合/地狱摘要）、
  指向选目标 / 插入位置，Framer Motion 动画。
- **英雄与技能**：玩家**地狱术士**（灵魂汲取；击杀：抽取 1）；敌人**训练假人**（无技能）。
  默认卡组：玩家为地狱主题组；敌人为恶魔 + 石像守卫（无仪式/法术）。
- **战斗日志**：左侧可折叠面板；由事件格式化（见 `docs/battle-log.md`）。

### 占位（第一版仅 UI，不含完整逻辑）

- 装备槽、遗物列表（角色区）
- 卡牌强化 1/2、构筑 / 成长 / 解锁

### 待办（战斗外系统，后续版本）

- 角色成长、卡牌解锁 / 构筑、更多英雄、装备 / 遗物的实际效果；卡牌强化路线。

## 引擎入口（纯 TS，见 `src/engine`）

```ts
createBattle(config: BattleInit, rng: Rng): BattleState;
playCard(state, action, rng): { state; events };
useSkill(state, action, rng): { state; events };
endTurn(state, rng): { state; events };
runAutoBattle(state, rng): { state; events };
runEnemyTurn(state, rng): { state; events };
```

引擎为纯函数、确定性：随机性通过可注入的种子化随机源（`makeRng(seed)`）实现，
`src/engine/rules.test.ts` 以固定种子覆盖 implementation-plan §2 的全部规则。

设计文档：[architecture.md](./docs/architecture.md)、[battle-design.md](./docs/battle-design.md)、[data-model.md](./docs/data-model.md)、[implementation-plan.md](./docs/implementation-plan.md)、[battle-log.md](./docs/battle-log.md)。
