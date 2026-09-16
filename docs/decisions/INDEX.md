# Decisions

このリポの判断記録 (DR) の索引。**なぜそう決めたか / 何を捨てたか**はここにあり、[docs/DESIGN-ja.md](../DESIGN-ja.md) / [DESIGN.md](../DESIGN.md) は今の姿だけを述べる。

番号はこのリポの中で閉じている。`契約 DR-NNNN` / `daemon DR-NNNN` と書いてあるものは [ccmsg](https://github.com/kawaz/ccmsg) 側の別の系列で、ここの番号とは関係が無い — 無印がこのリポ、外は必ず名乗る。

Status は各 DR ファイルの `Status:` 行が正本。

状態は実装エビデンス — その DR の Decision の各項目が `src/` と `test/` に現れているか — で決める。`✅ 実装済` (Decision の全部にエビデンスあり) / `🟡 部分実装` / `⬜ 未実装` / `🚧 進行中` / `N/A` (実装対象でない) / `❌ 撤退`。

## Active

| DR | 状態 | 説明 |
|---|---|---|
| [DR-0001](DR-0001-colour-is-computed-from-a-few-inputs.md) | ✅ 実装済 | 色は数個の入力から算出し、部品は意味名だけを書く。読めることは段表に閉じ込め、検査は test が持つ |
| [DR-0002](DR-0002-settings-are-sections-tried-before-they-are-kept.md) | ✅ 実装済 | 設定は section の集合で、触ることと決めることを分ける。組・差・「戻す」は section を問わない |
| [DR-0003](DR-0003-an-action-is-what-a-key-and-a-button-both-reach.md) | ⬜ 未実装 | 操作はアクションとして名指し、押す所も打鍵も同じものを起こす。スコープの木を内から外へ辿り、キーの割り当ては既定で空 |
