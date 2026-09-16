// 誰が言ったかの色相を配る規則。**色は 1 つも出てこない** — ここが見るのは
// 「どの色相に置くか」だけで、その色相が何色になるかは段表と CSS が決める。
import { describe, expect, test } from "bun:test";
import { MAIN, pickHue, USER, wishedHue } from "../src/member.ts";
import { memberOf } from "../src/timeline/item-view.ts";
import { item } from "./item.ts";

/** 配った先が、既に居る誰からも離れているか。「別の色に見える」の唯一の条件。 */
function apartFrom(hue: number, taken: readonly number[]): number {
  return Math.min(...taken.map((one) => Math.abs(((hue - one + 540) % 360) - 180)));
}

describe("色相を配る", () => {
  /** 意味色 4 つと固定の 2 人。既定の入力と同じ並び。 */
  const RESERVED = [30, 76, 152, 194, 236, 313];

  test("誰も居なければ希望どおり", () => {
    expect(pickHue([], [], 200)).toBe(200);
  });

  test("希望が空いていればそこに置く", () => {
    expect(pickHue([30, 300], [], 180)).toBe(180);
  });

  test("希望が誰かの近くなら、空いている所へ寄せる", () => {
    const peers = [120];
    const hue = pickHue([], peers, 125);
    expect(hue).not.toBe(125);
    expect(apartFrom(hue, peers)).toBeGreaterThanOrEqual(15);
  });

  test("増えても既に居る相手から 15 度以上離れる", () => {
    const peers: number[] = [];
    for (let nth = 0; nth < 5; nth += 1) {
      const hue = pickHue(RESERVED, peers, wishedHue(`peer-${String(nth)}`));
      if (peers.length > 0) expect(apartFrom(hue, peers)).toBeGreaterThanOrEqual(15);
      peers.push(hue);
    }
  });

  // 意味色の帯と帯の間に残る狭い隙間は使わない。危険 (30) と注意 (76) の間は
  // 15 度ずつ除くと 16 度しか残らず、そこに落ちた相手は「注意」の琥珀と見分けが
  // 付かない。**混んできても**そこへは落ちない。
  test("危険と注意の間には落ちない", () => {
    const peers: number[] = [];
    for (let nth = 0; nth < 24; nth += 1) {
      const hue = pickHue(RESERVED, peers, wishedHue(`peer-${String(nth)}`));
      expect(hue > 45 && hue < 61).toBe(false);
      peers.push(hue);
    }
  });

  test("意味色からはどれも 15 度以上離れる", () => {
    const peers: number[] = [];
    for (let nth = 0; nth < 12; nth += 1) {
      const hue = pickHue(RESERVED, peers, wishedHue(`name-${String(nth)}`));
      expect(apartFrom(hue, RESERVED)).toBeGreaterThanOrEqual(15);
      peers.push(hue);
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
    expect(memberOf(item("message.user.out"))).toBe(MAIN);
    expect(memberOf(item("thinking"))).toBe(MAIN);
  });

  test("相手の出てこない型はこのセッションがしたこと", () => {
    expect(memberOf(item("tool.Bash", { role: "use" }))).toBe(MAIN);
    expect(memberOf(item("system.compact"))).toBe(MAIN);
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
