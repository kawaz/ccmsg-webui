# Decisions

このリポの判断記録 (DR) の索引。**なぜそう決めたか / 何を捨てたか**はここにあり、[docs/DESIGN-ja.md](../DESIGN-ja.md) / [DESIGN.md](../DESIGN.md) は今の姿だけを述べる。

番号はこのリポの中で閉じている。`契約 DR-NNNN` / `daemon DR-NNNN` と書いてあるものは [ccmsg](https://github.com/kawaz/ccmsg) 側の別の系列で、ここの番号とは関係が無い — 無印がこのリポ、外は必ず名乗る。

Status は各 DR ファイルの `Status:` 行が正本。

状態は実装エビデンス — その DR の Decision の各項目が `src/` と `test/` に現れているか — で決める。`💭 提案` (裁定待ち、実装に着手しない) / `✅ 実装済` (Decision の全部にエビデンスあり) / `🟡 部分実装` / `⬜ 未実装` (裁定済み、着手してよい) / `🚧 進行中` / `N/A` (実装対象でない) / `❌ 撤退`。

## Active

| DR | 状態 | 説明 |
|---|---|---|
| [DR-0001](DR-0001-colour-is-computed-from-a-few-inputs.md) | ✅ 実装済 | 色は数個の入力から算出し、部品は意味名だけを書く。読めることは段表に閉じ込め、検査は test が持つ |
| [DR-0002](DR-0002-settings-are-sections-tried-before-they-are-kept.md) | ✅ 実装済 | 設定は section の集合で、触ることと決めることを分ける。組・差・「戻す」は section を問わない |
| [DR-0003](DR-0003-an-action-is-what-a-key-and-a-button-both-reach.md) | 🟡 部分実装 | 操作はアクションとして名指し、押す所も打鍵も同じものを起こす。スコープの木は UI の木と同じ形で内から外へ辿り、キーの割り当ては既定で空。器 (`src/actions/`) と §2.7 の最初のアクション群は載っているが、付録 A の残り (タブ・端末・files の木とプレビュー・訳の切替) と FAB (`main.open-prompt`) はまだアクションになっていない |
| [DR-0004](DR-0004-one-state-machine-decides-what-the-screen-is.md) | 🟡 部分実装 | 画面ぜんぶの姿は `phase` 1 本が決め、遷移は 1 表にする。接続バーと設定の置き場、DR-0003 の木の根もそこから読む。姿・`App` の `switch`・接続後の帯の消滅・`stale` の再認証 (閉じられる / 断られても画面を残す)・回線断と認証切れの分け・ログアウトと設定 1 項が載っている。ログアウトの往復は本物の instance で成功側を通してある。未検証は失敗側 (`auth.signout` が届かない時) だけ |
| [DR-0005](DR-0005-a-viewing-site-draws-files-through-a-service-worker.md) | ⬜ 未実装 | ファイルは webui とも endpoint とも site の違う閲覧 site が描く。中身は静的な頁 1 枚 + Service Worker で、親から渡ったポート越しに `file.read` のバイト列を取って `Response` を組む。権限は接続そのもので、capability URL は持たない |
