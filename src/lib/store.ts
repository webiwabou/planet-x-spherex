import { useSyncExternalStore } from "react";
import type { Camera } from "./camera";

export type Store<T> = {
  get: () => T;
  set: (next: Partial<T> | ((s: T) => T)) => void;
  subscribe: (fn: () => void) => () => void;
};

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next) {
      const value = typeof next === "function" ? next(state) : { ...state, ...next };
      if (value === state) return;
      state = value;
      listeners.forEach((fn) => fn());
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

type Readable<T> = { get: () => T; subscribe: (fn: () => void) => () => void };

// The selector must return a primitive or a stable reference, or the component re-renders on every change
export function useStoreValue<T, U>(store: Readable<T>, select: (s: T) => U): U {
  return useSyncExternalStore(store.subscribe, () => select(store.get()), () => select(store.get()));
}

export const useCameraValue = <U,>(store: Readable<Camera>, select: (c: Camera) => U) => useStoreValue(store, select);
