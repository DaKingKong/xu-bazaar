# 实施规范（Implementation Plan）

> 本文档定义 xu-bazaar 第一版战斗系统的落地顺序、验收标准、API 契约与代码约束。
> 关联文档：[battle-design.md](./battle-design.md)、[architecture.md](./architecture.md)、[data-model.md](./data-model.md)。

---

## 1. 分阶段里程碑

每个里程碑都有明确的完成定义（DoD），须逐一达成后再进入下一阶段。

> **进度（2026-07）**：M1–M7 DoD 均已达成；§6 总验收清单亦已勾选。战斗日志（见
> [battle-log.md](./battle-log.md)）已落地。默认对局已切换为目录卡地狱术士主题组（基础正文；
> 规格见 `.scratch/catalog-deck-v1/spec.md`）。后续工作见 README「待办」。

### M1 — 项目骨架与类型 ✅
- 搭建 Vite + React + TypeScript 项目，配置 Vitest、ESLint/Prettier。
- 建立目录：`src/engine`、`src/data`、`src/store`、`src/ui`。
- 依据 `data-model.md` 落地核心类型（CardDef/CardInstance/Minion/Hero/PlayerState/BattleState/BattleEvent 等）。
- **DoD**：`npm install`、`npm run dev`、`npm run build`、`npm test` 均可运行（可为空测试）。

### M2 — 抽牌 / 能量 / 疲劳 ✅
- 实现卡组抽牌、首回合抽 5 之后抽 2、手牌上限 10 跳过、能量回合重置为 4、疲劳递增（伤害 +2 / 生成攻击卡攻击力 +1，敌我独立）。
- **DoD**：M2 相关单测全绿（见 §2）。

### M3 — 出牌与自动战斗结算 ✅
- 出牌：仆从召唤（插入位置）、直接攻击卡（打脸限制+自由选目标）、法术卡（自由目标+治疗/伤害）。
- 自动战斗：左至右攻击、随机选目标（实时存活列表）、嘲讽优先（多个随机）、攻击力 0 跳过、每仆从每回合 1 次、死亡即时移除+格子左移、无仆从时双向打脸结算、大型仆从占两格且视为单一目标。
- 胜负即时判定。
- **DoD**：M3 相关单测全绿。

### M4 — 敌人 AI ✅
- 生成能尽量用光 4 能量的出牌组合（能恰好用光优先，否则尽量多消耗），依次打出并自选合法目标。
- **DoD**：AI 组合搜索单测通过（用光/尽量多消耗两种场景）。

### M5 — store 桥接 ✅
- Zustand 持有 BattleState，接收 UI 动作调用 engine，得到新状态 + `BattleEvent[]`，按序驱动 UI。
- **DoD**：可在无动画前提下走通完整一局（含敌人回合）。

### M6 — UI 与动画 ✅
- React 组件：敌我角色区、7 格仆从区、手牌、中线（能量/回合箭头/结束回合）、指向箭头选目标。
- Framer Motion（`layout` + `AnimatePresence`）：仆从插入/重排/进出场、手牌出牌、死亡移除+左移。
- **DoD**：`npm run dev` 可完整打一局，动画流畅。

### M7 — 占位 UI 与文档 ✅
- 装备槽、遗物列表、技能按钮、场地效果占位 UI。
- README：项目结构、运行方式、已实现/待办（成长/解锁/装备）、战斗规格链接。
- **DoD**：占位元素可见但不含逻辑；README 完整。

---

## 2. 测试策略（Vitest）

引擎须为**纯函数、确定性**：随机性通过**可注入的随机源（种子）**实现，测试中注入固定种子以断言结果。

**必须覆盖的规则清单：**
- 手牌满（10 张）跳过抽牌，以单次抽牌统计。
- 首回合抽 5、之后抽 2。
- 疲劳递增：伤害 2/4/6…，生成攻击卡攻击力 1/2/3…，敌我独立。
- 能量每回合重置为 4，不增长。
- 嘲讽优先：有嘲讽只能选嘲讽；多个嘲讽随机选。
- 攻击力 0 仆从跳过攻击。
- 双向打脸结算：仆从对角色造成伤害且受角色攻击力反伤。
- 死亡即时移除 + 格子左移。
- 随机选目标使用实时存活列表。
- 大型仆从占两格：7 格占满不可召唤；视为单一目标。
- 胜负即时判定（自动战斗中途角色 HP 归零立即结束）。
- 敌人 AI 组合：能用光/尽量多消耗两种场景。

---

## 3. 引擎 API 契约

- **不可变状态**：所有处理函数接收状态、返回**新状态**，不原地修改。
- **返回事件序列**：结算类操作返回 `{ state: BattleState; events: BattleEvent[] }`，供 UI 播放动画。
- **随机注入**：随机源作为参数/依赖注入（如 `rng: () => number` 或种子），保证可测试与可回放。

约定的核心入口（签名示意，实现以此为准）：

```ts
function createBattle(config: BattleInit, rng: Rng): BattleState;
function playCard(state: BattleState, action: PlayCardAction, rng: Rng): { state: BattleState; events: BattleEvent[] };
function useSkill(state: BattleState, action: UseSkillAction, rng: Rng): { state: BattleState; events: BattleEvent[] };
function endTurn(state: BattleState, rng: Rng): { state: BattleState; events: BattleEvent[] };
function runAutoBattle(state: BattleState, rng: Rng): { state: BattleState; events: BattleEvent[] };
function runEnemyTurn(state: BattleState, rng: Rng): { state: BattleState; events: BattleEvent[] };
```

---

## 4. 代码规范与约束

- **`src/engine/` 严禁 import React 或任何 UI 库**（可用 lint 规则/依赖检查保证）。
- 战斗规则**只**存在于 engine，UI 与 store 不得实现规则。
- 通过 TypeScript 严格类型检查（`strict: true`）与 lint。
- 目录/命名遵循 `architecture.md` 的分层。
- 提交信息用约定式（如 `feat:`/`fix:`/`docs:`/`test:`）；PR 需说明覆盖的里程碑与测试情况。

---

## 5. 动画事件消费约定

- store 持有事件队列，按 `BattleEvent[]` **顺序**逐个播放。
- 每个事件对应一种动画（draw/summon/attack/counter/death/heal/energyReset/phaseChange/useSkill/gameOver）。
- 播放期间可锁定交互，播放完毕后解锁并同步最终状态。
- UI 只根据事件与最终状态渲染，不重新计算规则。

---

## 6. 总验收清单（第一版 DoD）

- [x] `npm run dev` 可进行一局完整人机对战（出牌、选目标、选召唤位置、结束回合、自动战斗有动画）。
- [x] `npm run build` 通过（类型检查无误）。
- [x] `npm test` 全绿，覆盖 §2 全部规则。
- [x] `src/engine` 为纯 TS，无 UI 依赖。
- [x] 装备/遗物/技能/场地效果占位 UI 存在。
- [x] README 完整，含结构、运行方式、待办与规格链接。
