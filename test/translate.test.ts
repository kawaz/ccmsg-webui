import { afterEach, describe, expect, test } from "bun:test";
import {
  forgetTranslations,
  isAlreadyJapanese,
  needsNoTranslation,
  segments,
  translatedSoFar,
  translateText,
  type Translator,
} from "../src/timeline/translate.ts";

afterEach(() => {
  forgetTranslations();
});

/** 訳す人の代役。何を渡されたかを覚え、指示どおりに答えるか失敗する。 */
function stub(
  answer: (paragraph: string) => Promise<string> | string,
  route: "host" | "browser" = "host",
): Translator & { asked: string[] } {
  const asked: string[] = [];
  return {
    route,
    asked,
    translate: async (paragraph) => {
      asked.push(paragraph);
      return await answer(paragraph);
    },
  };
}

describe("もう日本語の段落は訳さない", () => {
  test("日本語だけの段落は訳す相手にならない", () => {
    expect(isAlreadyJapanese("この topic の畳み方を説明します。")).toBe(true);
  });

  test("英文の中に一言だけ引用された日本語は、英文として訳しに回す", () => {
    // 実際の思考はこれくらいの長さの英文で、日本語はその中の一言。比率で
    // 判定しないと、この段落ぜんぶが英語のまま残る。
    const paragraph =
      "The user said 「作り直した方がいい?」 and I need to decide whether the fold survives the rewrite of this module, or whether the whole reader is better off starting from the contract again rather than patching what is here.";
    expect(isAlreadyJapanese(paragraph)).toBe(false);
  });

  test("識別子だらけの日本語文は、なお日本語として残す", () => {
    expect(isAlreadyJapanese("topic-fold.ts の isFoldable と union を読んで決める。")).toBe(true);
  });

  test("空の段落は訳す相手にならない", () => {
    expect(isAlreadyJapanese("   ")).toBe(true);
  });

  test("訳す所が 1 段落も無い本文は、その item に入口を出さないために分かる", () => {
    expect(needsNoTranslation("これは日本語です。\n\nこれも日本語。")).toBe(true);
    expect(needsNoTranslation("This is English.\n\nこれは日本語。")).toBe(false);
  });
});

describe("段落ごとに訳す", () => {
  test("段落の境は保たれ、日本語の段落は渡されない", async () => {
    const translator = stub((paragraph) => `<${paragraph}>`);
    const said = await translateText(translator, "First.\n\nもう日本語。\n\nSecond.");
    expect(said).toBe("<First.>\n\nもう日本語。\n\n<Second.>");
    expect(translator.asked).toEqual(["First.", "Second."]);
  });

  test("届いた段落から出す — 全部揃うまで原文で固めない", async () => {
    let release: (() => void) | undefined;
    const slow = new Promise<void>((done) => {
      release = done;
    });
    const translator = stub(async (paragraph) => {
      if (paragraph === "Slow.") await slow;
      return `<${paragraph}>`;
    });
    const partials: string[] = [];
    const running = translateText(translator, "Slow.\n\nFast.", (partial) => {
      partials.push(partial);
    });
    // 速い方の訳が先に出る。遅い段落はまだ原文のまま。
    await Promise.resolve();
    await new Promise((done) => setTimeout(done, 0));
    expect(partials.at(-1)).toBe("Slow.\n\n<Fast.>");
    release?.();
    expect(await running).toBe("<Slow.>\n\n<Fast.>");
  });

  test("失敗した段落は原文のまま残り、他の段落は訳される", async () => {
    const translator = stub((paragraph) => {
      if (paragraph === "Bad.") throw new Error("helper failed");
      return `<${paragraph}>`;
    });
    expect(await translateText(translator, "Bad.\n\nGood.")).toBe("Bad.\n\n<Good.>");
  });

  test("失敗は覚えない — helper が戻ったら次に開いた時にもう 1 度試す", async () => {
    let fail = true;
    const translator = stub((paragraph) => {
      if (fail) throw new Error("helper failed");
      return `<${paragraph}>`;
    });
    expect(await translateText(translator, "Once.")).toBe("Once.");
    fail = false;
    expect(await translateText(translator, "Once.")).toBe("<Once.>");
  });
});

describe("覚えた訳", () => {
  test("同じ段落は item をまたいで 1 度しか訳さない", async () => {
    const translator = stub((paragraph) => `<${paragraph}>`);
    await translateText(translator, "Shared.\n\nOne.");
    await translateText(translator, "Shared.\n\nTwo.");
    expect(translator.asked).toEqual(["Shared.", "One.", "Two."]);
  });

  test("同じ段落の同時の求めは 1 回にまとまる", async () => {
    const translator = stub(async (paragraph) => {
      await new Promise((done) => setTimeout(done, 5));
      return `<${paragraph}>`;
    });
    await Promise.all([translateText(translator, "Same."), translateText(translator, "Same.")]);
    expect(translator.asked).toEqual(["Same."]);
  });

  test("経路ごとに別の訳として持つ — 片方の答えをもう片方の名前で出さない", async () => {
    await translateText(
      stub((paragraph) => `host<${paragraph}>`, "host"),
      "Text.",
    );
    expect(translatedSoFar("host", "Text.")).toBe("host<Text.>");
    expect(translatedSoFar("browser", "Text.")).toBeUndefined();
  });

  test("1 段落も訳せていなければ、出せる訳は無い", () => {
    expect(translatedSoFar("host", "Nothing yet.")).toBeUndefined();
  });
});

describe("囲みコードには触らない", () => {
  const WITH_CODE = `Read the fold from the contract.

\`\`\`ts
export function union<T>(slots: ReadonlyMap<string, T>): readonly T[] {
  return [...slots.values()];
}
\`\`\`

Only \`append\` carries a window.`;

  test("塊に分けると、囲みは中の空行ごと 1 つで、訳さない側に立つ", () => {
    const parts = segments(WITH_CODE);
    expect(parts.map((part) => part.code)).toEqual([false, true, false]);
    expect(parts[1]?.text).toContain("slots.values()");
  });

  test("繋ぎ直すと元の文字列に戻る (訳さなければ 1 文字も動かない)", () => {
    expect(
      segments(WITH_CODE)
        .map((part) => `${part.text}${part.after}`)
        .join(""),
    ).toBe(WITH_CODE);
  });

  test("訳しても、囲みの中は原文のまま", async () => {
    const translator = stub((paragraph) => `<${paragraph}>`);
    const said = await translateText(translator, WITH_CODE);
    expect(said).toContain("export function union<T>");
    expect(said).not.toContain("<```ts");
    expect(said).toContain("<Read the fold from the contract.>");
    expect(translator.asked).toEqual([
      "Read the fold from the contract.",
      "Only `append` carries a window.",
    ]);
  });

  test("囲みしか無い本文は、訳す所が無い", () => {
    expect(needsNoTranslation("```sh\njust visual\n```")).toBe(true);
  });
});

describe("繋ぎ直しは元の文字列に戻る", () => {
  const CASES = [
    "",
    "one line",
    "A\n\nB",
    "A\n\n\n\nB",
    "A\n",
    "\n\nA",
    "```\ncode\n```",
    "text\n```ts\na\n\nb\n```\nmore",
    "```unclosed\nstill code",
    "   \n",
  ];

  for (const text of CASES) {
    test(JSON.stringify(text), () => {
      expect(
        segments(text)
          .map((part) => `${part.text}${part.after}`)
          .join(""),
      ).toBe(text);
    });
  }
});
