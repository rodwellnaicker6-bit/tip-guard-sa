/** Central registry for listeners/subscriptions — cleanup on unmount or hot reload. */

type Cleanup = () => void;

const registry = new Map<string, Cleanup>();

export const subscriptionManager = {
  register(key: string, cleanup: Cleanup): Cleanup {
    registry.get(key)?.();
    registry.set(key, cleanup);
    return () => {
      cleanup();
      registry.delete(key);
    };
  },

  cleanup(key: string): void {
    registry.get(key)?.();
    registry.delete(key);
  },

  cleanupAll(): void {
    for (const fn of registry.values()) fn();
    registry.clear();
  },

  size(): number {
    return registry.size;
  },
};
