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

第一版战斗系统（M1–M7）已完成，可在 `npm run dev` 中进行一局完整人机对战。

### 已实现

- **抽牌 / 能量 / 疲劳**：首回合抽 5、之后抽 2；手牌上限 10 跳过；能量每回合重置为 4；
  疲劳递增（伤害 2/4/6…、生成攻击卡攻击力 1/2/3…，敌我独立）。
- **出牌**：仆从插入式召唤（可选左右/中间位置）、直接攻击卡（打脸限制 + 自选目标）、
  法术卡（自由目标 + 伤害/治疗）。
- **自动战斗**：左至右攻击、嘲讽优先（多个随机）、攻击力 0 跳过、实时存活列表随机选目标、
  死亡即时移除 + 格子左移、无仆从时双向打脸结算、大型仆从占两格且视为单一目标、胜负即时判定。
- **敌人 AI**：搜索能尽量用光 4 点能量的出牌组合（恰好用光优先，否则尽量多消耗），依次出牌并自选目标。
- **store 桥接**：Zustand 持有权威 `BattleState`，调用 engine 得到「新状态 + `BattleEvent[]`」，
  按事件序列驱动 UI 逐步播放。
- **战斗 UI 与动画**：敌我角色区、7 格仆从区、手牌、中线（能量/回合箭头/结束回合）、
  指向选目标 / 插入位置选择，配合 Framer Motion（`layout` + `AnimatePresence`）实现
  召唤插入、重排让位、死亡移除、出牌进出场动画。

### 占位（第一版仅 UI，不含逻辑）

- 装备槽（角色头像旁圆形 holder）
- 遗物列表（角色区图标列）
- 技能按钮（角色区）
- 场地效果图标（中线左侧）

### 待办（战斗外系统，后续版本）

- 角色成长、卡牌解锁 / 构筑、装备 / 遗物 / 技能 / 场地效果的实际效果逻辑。

## 引擎入口（纯 TS，见 `src/engine`）

```ts
createBattle(config: BattleInit, rng: Rng): BattleState;
playCard(state, action, rng): { state; events };
endTurn(state, rng): { state; events };
runAutoBattle(state, rng): { state; events };
runEnemyTurn(state, rng): { state; events };
```

引擎为纯函数、确定性：随机性通过可注入的种子化随机源（`makeRng(seed)`）实现，
`src/engine/rules.test.ts` 以固定种子覆盖 implementation-plan §2 的全部规则。

设计文档：[architecture.md](./docs/architecture.md)、[battle-design.md](./docs/battle-design.md)、[data-model.md](./docs/data-model.md)、[implementation-plan.md](./docs/implementation-plan.md)。
