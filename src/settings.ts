/** What this browser keeps between visits.
 *
 * The endpoint is one of them: this page is published at an origin of its own
 * and reaches an instance that may be another site, so where to dial is
 * something the person states and something they should not have to state
 * twice. No secret is kept — the access token is held in memory and the
 * refresh token is a cookie this page cannot read (daemon DR-0001 §2.4). The rest is
 * per-screen memory, whose keys name the instance they belong to so that two
 * instances read through one page do not read each other's. */

/** A storage that answers as empty rather than throwing, which is what a
 * private window and a browser with site data blocked both look like. */
export interface Store {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): void;
  /** この origin にある、この画面のものの名前ぜんぶ。 */
  keys(): readonly string[];
}

/** この画面が書く名前の頭。ログアウトが消す範囲でもあるので、1 か所に持つ。 */
const MINE = "ccmsg.";

export const localStore: Store = {
  get(key) {
    try {
      return localStorage.getItem(key) ?? undefined;
    } catch {
      return undefined;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // A viewer who cannot persist still gets a working page for this visit.
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // 書けない browser は読めもしないので、消えていないものは無い。
    }
  },
  keys() {
    try {
      const names: string[] = [];
      for (let at = 0; at < localStorage.length; at += 1) {
        const name = localStorage.key(at);
        if (name !== null && name.startsWith(MINE)) names.push(name);
      }
      return names;
    } catch {
      return [];
    }
  },
};

/** 「ログアウト時にローカルの設定を残す」で残る名前 (DR-0004 §2.6)。
 *
 * **名乗るのは名前を作る所**。残す物の一覧を別に持つと、鍵が増えた時にその一覧
 * だけが古くなる — 名前の付け方が既に「その値が誰のものか」を言っているので、
 * それを言った所がそのまま名乗ればよい (DESIGN「localStorage のキー規律」)。
 *
 * 末尾が `:` のものは、その先に面や主語が付く名前ぜんぶを指す。 */
const preferences: string[] = [];

export function keepOnSignOut<T extends string>(name: T): T {
  preferences.push(name);
  return name;
}

function isPreference(key: string): boolean {
  return preferences.some((one) => (one.endsWith(":") ? key.startsWith(one) : key === one));
}

/** ログアウトが手元から消すもの (DR-0004 §2.6)。
 *
 * **既定は全部**。`ccmsg.` の付くこの origin の名前を、好みも含めて 1 つ残らず
 * 消す — ログアウトは「この端末から降りる」なので、既定が「降りた跡が残る」形を
 * しているべきではない。
 *
 * 残す設定を入れた時に残るのは、名前を作る所が好みだと名乗ったものだけ。認証・
 * 接続・セッションに属する名前はこの設定でも残らない。 */
export function clearLocal(keepPreferences: boolean): void {
  for (const key of localStore.keys()) {
    if (keepPreferences && isPreference(key)) continue;
    localStore.remove(key);
  }
}
