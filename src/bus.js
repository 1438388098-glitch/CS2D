export function createBus() {
  const handlers = new Map();
  const bus = {
    on(evt, fn) {
      let list = handlers.get(evt);
      if (!list) { list = new Set(); handlers.set(evt, list); }
      list.add(fn);
      return () => bus.off(evt, fn);
    },
    off(evt, fn) {
      const list = handlers.get(evt);
      if (list) list.delete(fn);
    },
    emit(evt, payload) {
      const list = handlers.get(evt);
      if (!list || list.size === 0) return;
      for (const fn of list) {
        try { fn(payload); } catch (err) { console.error('bus[' + evt + '] handler error:', err); }
      }
    },
    clear() { handlers.clear(); }
  };
  return bus;
}
