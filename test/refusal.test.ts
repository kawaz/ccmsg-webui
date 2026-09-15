import { describe, expect, test } from "bun:test";
import { Refused } from "../src/connection.ts";
import { describeRefusal } from "../src/refusal.ts";

describe("断られたことを人の言葉にする", () => {
  test("人の側に次の手がある断り方は、その手を言う", () => {
    expect(describeRefusal(new Refused("session_duplicated", "two runs"))).toContain(
      "どちらを終わらせるか",
    );
    expect(describeRefusal(new Refused("ambiguous_run", "name a pid"))).toContain("run を選び直");
  });

  test("知らない断り方は instance の説明をそのまま見せる", () => {
    // 「予期しないエラー」に丸めると、instance が書いたことまで消える。
    expect(describeRefusal(new Refused("not_found", "そのファイルはありません"))).toBe(
      "そのファイルはありません",
    );
  });

  test("断りですらないもの (切断など) はそのまま", () => {
    expect(describeRefusal(new Error("接続していません"))).toBe("Error: 接続していません");
  });
});
