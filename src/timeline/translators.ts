import type { TranslateRunResult } from "@ccmsg/protocol";
import type { TranslateRoute, Translator } from "./translate.ts";

/** 2 つの訳す人。**どちらも残す**のは、違う道具が違う訳を出すから — 片方は
 * 辞書寄りで、もう片方は言い換えを作る。どちらが正しいかは読む人が決めることで、
 * 混ぜて 1 つにすると、おかしな 1 文が**どの道具の仕業か**が消える。
 *
 * だから訳は経路ごとに別のものとして持ち、画面も別の選択肢として並べる。 */

/** ブラウザが持っている翻訳機 (Chrome の Translator API)。型はまだ標準の
 * 宣言に無いので、使う形だけここで書く。 */
interface BrowserTranslator {
  translate(text: string): Promise<string>;
}

interface BrowserTranslatorFactory {
  create(options: { sourceLanguage: string; targetLanguage: string }): Promise<BrowserTranslator>;
}

function factory(): BrowserTranslatorFactory | undefined {
  const held = (globalThis as Record<string, unknown>)["Translator"];
  if (held === undefined || held === null) return undefined;
  return typeof held === "function" || typeof held === "object"
    ? (held as BrowserTranslatorFactory)
    : undefined;
}

/** このブラウザが自分で訳せるか。持っていないブラウザでは選択肢自体を出さない。 */
export function hasBrowserTranslator(): boolean {
  return factory() !== undefined;
}

let opened: Promise<BrowserTranslator> | undefined;

/** 翻訳機は作るのが高い (言語の一式を読み込む) ので 1 つを使い回す。作るのに
 * 失敗したら覚えない — 言語の一式を落としている最中の失敗が、以後ずっと
 * 「訳せない」として残ってしまう。 */
function browserTranslator(): Promise<BrowserTranslator> {
  if (opened === undefined) {
    const made = factory();
    if (made === undefined) return Promise.reject(new Error("このブラウザは訳せません"));
    opened = made.create({ sourceLanguage: "en", targetLanguage: "ja" }).catch((cause: unknown) => {
      opened = undefined;
      throw cause instanceof Error ? cause : new Error(String(cause));
    });
  }
  return opened;
}

export const browserRoute: Translator = {
  route: "browser",
  translate: async (paragraph) => (await browserTranslator()).translate(paragraph),
};

/** instance の host が持っている翻訳機 (`translate.run`)。
 *
 * **1 段落 = 1 op** で投げる。契約は文の配列を受けるが、daemon は helper を 1 つ
 * ずつ回すので、束ねると短い段落まで長い段落の後ろで待つことになる。段落ごとに
 * 分けて投げれば、helper は順に返し、画面は届いた段落から書き換わる。 */
export function hostRoute(
  run: (texts: readonly string[]) => Promise<TranslateRunResult>,
): Translator {
  return {
    route: "host",
    translate: async (paragraph) => {
      const reply = await run([paragraph]);
      const result = reply.results[0];
      if (result === undefined) throw new Error("host が何も返しませんでした");
      if (!result.ok) throw new Error(result.error);
      return result.text;
    },
  };
}

/** 画面に並ぶ選択肢の名前。経路の名前をそのまま出すのは、**どの道具の訳か**が
 * 読む人の判断材料そのものだから。 */
export const ROUTE_LABELS: Readonly<Record<TranslateRoute, string>> = {
  host: "日本語 (host)",
  browser: "日本語 (browser)",
};
