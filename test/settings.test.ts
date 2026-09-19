import { beforeEach, describe, expect, test } from "bun:test";
import { clearLocal, keepOnSignOut, type Store } from "../src/settings.ts";

/** ログアウトが手元から何を消し、何を残すか (DR-0004 §2.6)。
 *
 * 確かめるのは**判定そのもの**: 名前を作る所が好みだと名乗ったか、末尾の `:` が
 * その先の名前ぜんぶを指すか。実際にどの名前が名乗るかは名前を作る所 (`state.ts`
 * の並べ方、`theme.ts` の色、`display.ts` の読み方…) に在り、そこはブラウザを
 * 連れてくるので、ここでは同じ名前を同じ形で名乗らせて規則だけを固定する。 */

/** 書ける所。消えたかどうかだけを読む。 */
function fakeStore(names: readonly string[]): Store & { readonly left: () => string[] } {
  const held = new Map<string, string>(names.map((one) => [one, "何か"]));
  return {
    get: (key) => held.get(key),
    set: (key, value) => {
      held.set(key, value);
    },
    remove: (key) => {
      held.delete(key);
    },
    keys: () => [...held.keys()],
    left: () => [...held.keys()].sort(),
  };
}

/** 好みだと名乗っている名前たち。名乗る場所は散っているが、名乗り方は 1 つ。 */
const PREFERENCES = [
  "ccmsg.sessions.sort",
  "ccmsg.theme",
  "ccmsg.settings",
  "ccmsg.layout.sessions-open",
  // 末尾が `:` のものは、その先に面が付く名前ぜんぶを指す。
  "ccmsg.timeline.display:",
];

/** 好みではない名前たち。ユーザ・instance・sid のどれかを名前で名乗る。 */
const THE_REST = [
  "ccmsg.endpoint",
  "ccmsg.sessions.pinned:instance-one",
  "ccmsg.layout.split:instance-one",
  "ccmsg.layout.sessions-split:instance-one",
  "ccmsg.files:instance-one:sid-one",
  "ccmsg.draft:instance-one:sid-one",
];

const ALL = [...PREFERENCES.map((one) => (one.endsWith(":") ? `${one}main` : one)), ...THE_REST];

beforeEach(() => {
  for (const one of PREFERENCES) keepOnSignOut(one);
});

describe("降りた端末に何が残るか", () => {
  test("既定では 1 つも残らない", () => {
    // ログアウトは「この端末から降りる」なので、既定が「降りた跡が残る」形を
    // していてはいけない (§2.6)。
    const store = fakeStore(ALL);
    clearLocal(false, store);
    expect(store.left()).toEqual([]);
  });

  test("残す設定を入れると、好みだと名乗った名前だけが残る", () => {
    const store = fakeStore(ALL);
    clearLocal(true, store);
    expect(store.left()).toEqual(
      [
        "ccmsg.layout.sessions-open",
        "ccmsg.sessions.sort",
        "ccmsg.settings",
        "ccmsg.theme",
        "ccmsg.timeline.display:main",
      ].sort(),
    );
  });

  test("末尾の `:` はその先に何が付いても指す。それ以外は完全一致", () => {
    const store = fakeStore([
      "ccmsg.timeline.display:main",
      "ccmsg.timeline.display:sub",
      // 好みの名前で始まるだけの別の名前は、好みではない。
      "ccmsg.theme.instance-one",
      "ccmsg.sessions.sorted-by-someone",
    ]);
    clearLocal(true, store);
    expect(store.left()).toEqual(["ccmsg.timeline.display:main", "ccmsg.timeline.display:sub"]);
  });
});
