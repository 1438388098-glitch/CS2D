// AI 系统（拆分为子模块，本文件仅作兼容出口）：
//   ai/core.js        主循环 + 感知→决策调度（botThink）
//   ai/perception.js  视野感知（公平约束：感知 ≤ 玩家屏幕）
//   ai/decisions.js   战术目标（守点/进攻/装弹/保枪/绕后/指令服从）
//   ai/actions.js     动作执行（IGL 拍板/道具/装拆弹/开火）
//   ai/roles.js       队伍编成（角色/队长/玩家指令）
//   ai/buys.js        购买决策（经济纪律）
//   ai/shared.js      日志 / 人格乘子
export * from './ai/index.js';
