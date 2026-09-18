import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isConnected, type Phase, type PhaseInputs, phaseOf } from "../src/phase.ts";

/** 姿を決める 1 つの値 (DR-0004)。
 *
 * 材料から姿を導く所だけを固定する — 遷移の引き金は既存の signal の変化そのもの
 * なので、確かめられるのは「その signal がこう立っている時にどの姿になるか」で、
 * それが §2.3 の遷移表の右の列にあたる。 */

const NOTHING: PhaseInputs = {
  enrolling: false,
  needsSignIn: false,
  listed: false,
  open: false,
  greeting: false,
  wanted: false,
};

function at(said: Partial<PhaseInputs>): Phase {
  return phaseOf({ ...NOTHING, ...said });
}

describe("姿は材料から導かれる", () => {
  test("何も無ければ offline", () => {
    expect(at({})).toBe("offline");
  });

  test("人が繋ぐつもりで、まだ socket が開いていなければ connecting", () => {
    expect(at({ wanted: true })).toBe("connecting");
  });

  test("名乗りの途中も、socket が開いた直後も receiving", () => {
    expect(at({ wanted: true, greeting: true })).toBe("receiving");
    expect(at({ wanted: true, open: true })).toBe("receiving");
  });

  test("一覧を受け取り、話し相手が居れば live", () => {
    expect(at({ wanted: true, open: true, listed: true })).toBe("live");
  });

  test("一覧を受け取った後に socket が閉じたら stale", () => {
    expect(at({ wanted: true, listed: true })).toBe("stale");
  });

  test("繋ぎ直している最中も、一覧があるなら stale のまま", () => {
    // 切断中と再接続中を姿で分けない (§2.1) — 違うのは帯の中の語だけで、
    // それは `status` が既に答えている。
    expect(at({ wanted: true, listed: true, greeting: true })).toBe("stale");
  });

  test("passkey を求める所は authenticating", () => {
    expect(at({ needsSignIn: true })).toBe("authenticating");
  });

  test("登録 URL を開いたら、何を読んでいても registering に置き換わる", () => {
    // §7 Q3 の裁定。捨てているように見えるものは instance が持っている。
    expect(at({ enrolling: true, listed: true, open: true })).toBe("registering");
  });
});

describe("順番そのものが裁定", () => {
  test("一覧があるなら、回線が今どうであれ本体が立つ", () => {
    // `live` / `stale` が `receiving` / `connecting` より先 (§2.2)。
    expect(at({ listed: true, wanted: true })).toBe("stale");
  });

  test("一覧を持っていない間に許可が切れたら authenticating へ行く", () => {
    // 捨てるものがそこに無いから (§2.3)。
    expect(at({ needsSignIn: true, wanted: true })).toBe("authenticating");
  });

  test("`needsSignIn` は一覧より先に読まれるので、一覧がある間は立ててはいけない", () => {
    // 順番そのものが裁定 (§2.2) なので、規則の側では一覧より認証が勝つ。だから
    // **重ねた再認証が断られても `needsSignIn` を立てない**のが材料を書く側の
    // 責務で (§2.3 の「重ねた再認証が断られた」)、立てた瞬間に読んでいたものが
    // 消えることをここに置いておく。
    expect(at({ needsSignIn: true, listed: true, open: true })).toBe("authenticating");
  });

  test("一覧を持っている姿では、許可が切れても画面を捨てない", () => {
    // 人に頼むのは passkey をもう一度だけで、姿は `stale` のまま (§2.3)。
    // `authRequired` は `wanted` を下ろすので、そこも合わせて確かめる。
    expect(at({ needsSignIn: false, listed: true, wanted: false })).toBe("stale");
  });
});

describe("木の根は姿が答える", () => {
  test("一覧が立っている姿だけが接続後", () => {
    expect(isConnected("live")).toBe(true);
    expect(isConnected("stale")).toBe(true);
    for (const one of [
      "offline",
      "registering",
      "authenticating",
      "connecting",
      "receiving",
    ] as const) {
      expect(isConnected(one)).toBe(false);
    }
  });
});

/** この設計の核は「姿を決める場所が 1 つ」という**持たない**形なので、2 か所目を
 * 足す変更は局所的には改善に見え、文章では止まらない (§2.9)。 */
describe("姿を決める signal を読むのは App.tsx だけ", () => {
  /** 姿を決める材料そのもの。中身を出すために読む値 (`status` で語を選ぶ、
   * `listSettled` で空かどうかを言う) はここに入らない。 */
  const DECIDERS = ["enrolment", "needsSignIn", "listed", "wanted", "phase", "connected"];

  const dir = new URL("../src/ui/", import.meta.url).pathname;

  function importedNames(source: string): Set<string> {
    const names = new Set<string>();
    for (const match of source.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from/g)) {
      for (const one of (match[1] ?? "").split(",")) {
        const name = one
          .trim()
          .split(/\s+as\s+/)[0]
          ?.trim();
        if (name !== undefined && name !== "") names.add(name);
      }
    }
    return names;
  }

  for (const file of readdirSync(dir).filter(
    (one) => one.endsWith(".tsx") || one.endsWith(".ts"),
  )) {
    if (file === "App.tsx") continue;
    test(`${file} は姿を決めない`, () => {
      const names = importedNames(readFileSync(join(dir, file), "utf8"));
      expect(DECIDERS.filter((one) => names.has(one))).toEqual([]);
    });
  }
});
