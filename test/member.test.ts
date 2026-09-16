// 誰が言ったかの色相を配る規則。**色は 1 つも出てこない** — ここが見るのは
// 「どの色相に置くか」だけで、その色相が何色になるかは段表と CSS が決める。
import { describe, expect, test } from "bun:test";
import { pickHue, SELF, USER, wishedHue } from "../src/member.ts";
import { memberOf } from "../src/timeline/item-view.ts";
import { item } from "./item.ts";

/** 配った先が、既に居る誰からも離れているか。「別の色に見える」の唯一の条件。 */
function apartFrom(hue: number, taken: readonly number[]): number {
  return Math.min(...taken.map((one) => Math.abs(((hue - one + 540) % 360) - 180)));
}

describe("色相を配る", () => {
  test("誰も居なければ希望どおり", () => {
    expect(pickHue([], 200)).toBe(200);
  });

  test("希望が空いていればそこに置く", () => {
    // 30 からも 300 からも十分離れている希望は、動かす理由が無い。
    expect(pickHue([30, 300], 180)).toBe(180);
  });

  test("希望が誰かの近くなら、いちばん広い空きの真ん中へ寄せる", () => {
    const taken = [0, 20];
    const hue = pickHue(taken, 10);
    expect(hue).not.toBe(10);
    expect(apartFrom(hue, taken)).toBeGreaterThan(15);
  });

  test("増えても既に居る誰かから 15 度以上離れる", () => {
    const taken: number[] = [];
    for (let nth = 0; nth < 8; nth += 1) {
      const hue = pickHue(taken, wishedHue(`peer-${String(nth)}`));
      if (taken.length > 0) expect(apartFrom(hue, taken)).toBeGreaterThanOrEqual(15);
      taken.push(hue);
    }
  });

  test("希望は名前だけで決まる", () => {
    // 世代を跨いで立ち上がり直した相手が、同じ色から始まるための性質。
    expect(wishedHue("session:lead")).toBe(wishedHue("session:lead"));
    expect(wishedHue("session:lead")).toBeGreaterThanOrEqual(0);
    expect(wishedHue("session:lead")).toBeLessThan(360);
  });
});

/** 名乗りが言うのは主語から見た**関係**で、色が言うのは**相手**。向きの違う 2 行が
 * 同じ 1 人に落ちることがこの分け方の要。 */
describe("誰が言ったか", () => {
  test("人とこのセッションは固定の 2 人", () => {
    expect(memberOf(item("message.user.in"))).toBe(USER);
    expect(memberOf(item("message.user.out"))).toBe(SELF);
    expect(memberOf(item("thinking"))).toBe(SELF);
  });

  test("相手の出てこない型はこのセッションがしたこと", () => {
    expect(memberOf(item("tool.Bash", { role: "use" }))).toBe(SELF);
    expect(memberOf(item("system.compact"))).toBe(SELF);
  });

  test("行き先と来し方が同じ相手なら同じ鍵", () => {
    const sent = memberOf(item("message.session.out", { to: "lead" }));
    expect(memberOf(item("message.session.in", { from: "lead" }))).toBe(sent);
  });

  test("サブエージェントは id で揃う", () => {
    const sent = memberOf(item("message.sub.out", { agent_id: "a1", name: "reviewer" }));
    expect(memberOf(item("message.sub.in", { agent_id: "a1" }))).toBe(sent);
  });

  test("別の相手は別の鍵", () => {
    expect(memberOf(item("message.team.in", { harness_name: "sol" }))).not.toBe(
      memberOf(item("message.team.in", { harness_name: "luna" })),
    );
  });
});
