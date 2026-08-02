import { createBus } from './bus.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createContext(overrides = {}) {
  const ctx = {
    bus: overrides.bus || createBus(),
    rand: overrides.rand || Math.random,
    seed: overrides.seed !== undefined ? overrides.seed : null,
    game: null,
    map: null,
    layers: null,
    canvas: null,
    services: {},
    get service() { return ctx.services; },
    setService(name, obj) { ctx.services[name] = obj; return ctx; },
    getService(name) { return ctx.services[name] || null; }
  };
  if (ctx.seed !== null) ctx.rand = mulberry32(ctx.seed);
  return ctx;
}

export const ctx = createContext();
