# Decisions

このリポの判断記録 (DR) の索引。**なぜそう決めたか / 何を捨てたか**はここにあり、[docs/DESIGN-ja.md](../DESIGN-ja.md) / [DESIGN.md](../DESIGN.md) は今の姿だけを述べる。

番号はこのリポの中で閉じている。DESIGN が `契約 DR-NNNN` と書いているものは [ccmsg](https://github.com/kawaz/ccmsg) 側の別の系列で、ここの番号とは関係が無い。

Status は各 DR ファイルの `Status:` 行が正本。

状態は実装エビデンス — その DR の Decision の各項目が `src/` と `test/` に現れているか — で決める。`✅ 実装済` (Decision の全部にエビデンスあり) / `🟡 部分実装` / `⬜ 未実装` / `🚧 進行中` / `N/A` (実装対象でない) / `❌ 撤退`。

## Active

| DR | 状態 | 説明 |
|---|---|---|
| [DR-0001](DR-0001-colour-is-computed-from-a-few-inputs.md) | ✅ 実装済 | 色は数個の入力から算出し、部品は意味名だけを書く。読めることは段表に閉じ込め、検査は test が持つ |
