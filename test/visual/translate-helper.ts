#!/usr/bin/env bun
/** 使い捨ての翻訳 helper。
 *
 * daemon が本物の helper と話す行の約束 (`{id, texts}` を 1 行受け取り、
 * `{id, results}` を 1 行返す) をそのまま話す。本当に訳すわけではないので、
 * 返す文は**訳された文だと一目で分かる形**にしてある — この基準画像が見せるのは
 * 「host の経路を通って本文が入れ替わること」であって、翻訳の出来ではない。
 *
 * 空の text は helper 側の失敗として返す: 段落 1 つの失敗が本文ぜんぶを壊さない
 * ことが、画面側の約束 (`src/timeline/translate.ts`)。 */

export {};

const input = Bun.stdin.stream().getReader();
const decoder = new TextDecoder();
let held = "";

for (;;) {
  const { done, value } = await input.read();
  if (done) break;
  held += decoder.decode(value, { stream: true });
  let at: number;
  while ((at = held.indexOf("\n")) >= 0) {
    const line = held.slice(0, at);
    held = held.slice(at + 1);
    if (line.trim() === "") continue;
    const asked = JSON.parse(line) as { id: string; texts: string[] };
    const results = asked.texts.map((text) =>
      text.trim() === ""
        ? { ok: false, error: "この段落は訳せませんでした" }
        : { ok: true, text: `【host の訳】${text}` },
    );
    await Bun.write(Bun.stdout, `${JSON.stringify({ id: asked.id, results })}\n`);
  }
}
