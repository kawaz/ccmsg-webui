// The fold open/closed state a timeline keeps outside its fold components, so
// that the state outlives the component drawing it and so that opening one
// fold leaves the rest of the timeline alone.
import { describe, expect, test } from "bun:test";
import { effect } from "@preact/signals";
import { FoldOpen } from "../src/timeline/fold-open.ts";

describe("FoldOpen", () => {
  test("an untouched fold reports the caller's default", () => {
    const store = new FoldOpen();
    expect(store.isOpen("a", false)).toBe(false);
    expect(store.isOpen("a", true)).toBe(true);
  });

  test("an override wins over the default in both directions", () => {
    const store = new FoldOpen();
    store.set("a", true);
    expect(store.isOpen("a", false)).toBe(true);
    store.set("a", false);
    expect(store.isOpen("a", true)).toBe(false);
  });

  test("reset drops overrides so folds fall back to a changed default", () => {
    const store = new FoldOpen();
    store.set("a", false);
    store.reset();
    expect(store.isOpen("a", true)).toBe(true);
  });

  test("a body stays mounted after the fold is closed again", () => {
    // Re-closing must not discard what the reader can see inside: a code
    // block's highlighting is tokenized asynchronously and would be redone.
    const store = new FoldOpen();
    expect(store.isBodyMounted("a")).toBe(false);
    store.set("a", true);
    store.set("a", false);
    expect(store.isBodyMounted("a")).toBe(true);
  });

  test("reset re-closes folds without discarding their bodies", () => {
    const store = new FoldOpen();
    store.set("a", true);
    store.reset();
    expect(store.isOpen("a", false)).toBe(false);
    expect(store.isBodyMounted("a")).toBe(true);
  });

  test("a fold that opened by default is latched too", () => {
    // Nothing calls set() on a fold the settings open, so the component says so.
    const store = new FoldOpen();
    store.markMounted("a");
    expect(store.isBodyMounted("a")).toBe(true);
  });

  test("only the toggled fold's readers are re-run", () => {
    // The whole point of one signal per key: opening one fold must not
    // re-render the rest of the timeline.
    const store = new FoldOpen();
    let a = 0;
    let b = 0;
    const stopA = effect(() => {
      store.isOpen("a", false);
      a += 1;
    });
    const stopB = effect(() => {
      store.isOpen("b", false);
      b += 1;
    });
    store.set("a", true);
    expect([a, b]).toEqual([2, 1]);
    stopA();
    stopB();
  });

  test("setting the state a fold is already in re-runs no one", () => {
    const store = new FoldOpen();
    store.set("a", true);
    let calls = 0;
    const stop = effect(() => {
      store.isOpen("a", false);
      calls += 1;
    });
    store.set("a", true);
    expect(calls).toBe(1);
    stop();
  });

  test("reset re-runs every fold it changed, and nothing else", () => {
    const store = new FoldOpen();
    store.set("a", true);
    let a = 0;
    let untouched = 0;
    const stopA = effect(() => {
      store.isOpen("a", false);
      a += 1;
    });
    const stopU = effect(() => {
      store.isOpen("untouched", false);
      untouched += 1;
    });
    store.reset();
    expect([a, untouched]).toEqual([2, 1]);
    store.reset();
    expect(a).toBe(2);
    stopA();
    stopU();
  });

  test("a body mount is announced to whoever is watching that fold", () => {
    // Opening a fold is what brings its body into existence, so anything
    // waiting on the body watches the same key.
    const store = new FoldOpen();
    let mounts = 0;
    const stop = effect(() => {
      store.isBodyMounted("a");
      mounts += 1;
    });
    store.set("a", true);
    store.set("a", false);
    store.set("a", true);
    expect(mounts).toBe(2);
    stop();
  });
});
