// AI module aggregate exports (updateBots / assignRoles / botBuyAll / setPlayerOrder)
// Module map: roles=assignment/tactics, decisions=objectives, actions=execution,
// core=main loop, perception/senses=vision/audio, buys=economy, shared=common helpers
// AI 模块聚合出口（对外 API：updateBots / assignRoles / botBuyAll / setPlayerOrder）
export { updateBots } from './core.js';
export { assignRoles, setPlayerOrder, recordRoundResult } from './roles.js';
export { botBuyAll } from './buys.js';
