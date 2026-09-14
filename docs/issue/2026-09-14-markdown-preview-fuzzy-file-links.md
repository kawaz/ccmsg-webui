---
title: Markdown プレビューで、省略されたファイル名の言及をプロジェクト内ファイルへのリンクにする
status: open
category: request
created: 2026-09-14T13:08:11+09:00
last_read:
open_entered: 2026-09-14T13:08:11+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: kawaz からの要望
---

# Markdown プレビューで、省略されたファイル名の言及をプロジェクト内ファイルへのリンクにする

## 概要

kawaz の要望 (2026-09-14、v1 で便利だった点の v2 への持ち込み)。AI の出力には `docs/decisions/DR-0015-async-io-principle.md` のような実在パスだけでなく、`async-dr-and-persist` / `fold-from-head-with-versioned-cache` のように拡張子・ディレクトリ・日付 prefix を省いた名前での言及が多い。Markdown プレビューのカスタムとして、こうした言及をプロジェクト内のファイルへのリンクにする。

## 背景

v1 の webui で便利だった機能を v2 へ持ち込む一連の要望のひとつ。着手前に v1 の Markdown プレビュー実装 (`~/.local/share/repos/github.com/kawaz/claude-ccmsg/main/packages/webui/src/`) と対応する DR を読み、何に気を使っていたかを把握してから作る (写さない)。

## 振る舞い

- `` `...` `` (inline code) 内の `[\/\.\w]+(-[\/\.\w]+)+` 相当のトークンを候補とする
- そのパスがプロジェクト内に存在すればファイルビューア (Files) へのリンク
- 存在しなくても、プロジェクト内にそのファイル名の前に `^[\d-]+` (日付 prefix)、後ろに `\.[\.\-\w]+$` (拡張子) が付いたファイルがあれば候補にする
- 曖昧さ・複数マッチがあるので、トークンの後ろに書類の絵文字を表示し、押すとアンカー位置に候補パスの一覧が出て、クリックで Files で開く。候補が 0 件なら何も出さない (誤陽性は見えない)
- 候補の探索は client で行わず instance の `file.find` に投げる。名前の部分一致・日付 prefix / 拡張子の緩和をどちらが担うか (契約の `file.find` の検索仕様に足すか、webui が候補名を展開して問い合わせるか) は着手時に決める

## 同種の項目 (同じ Markdown プレビューのカスタムとして)

- `#\d+` の処理 (issue / PR 番号のリンク化。何にリンクするかはプロジェクトの設定)
- v1 で便利だった点は kawaz が順次伝えるので、この issue に項目を追記して育てる

## 関連

- v1 の Markdown プレビュー実装 (`~/.local/share/repos/github.com/kawaz/claude-ccmsg/main/packages/webui/src/`) と対応する DR
- 契約 `file.find` op

## 受け入れ条件

- [ ] inline code 内のファイル名らしきトークンから、実在パス / 日付 prefix・拡張子省略の候補パスを検出できる
- [ ] 候補があるトークンにのみ書類アイコンが付き、クリックで候補一覧 → Files 遷移ができる
- [ ] 候補 0 件のトークンには何も表示されない
- [ ] 候補探索は client 側の全文字列比較ではなく `file.find` 経由になっている

## 適用先 (kawaz 2026-09-14 追記)

会話のメッセージバブル内のプレビューだけでなく、**Files でプロジェクト内の md をプレビューする時**にも同じ処理を掛ける。md 内で別の md を参照する時は本来 `[./sibling.md](./sibling.md)` と書かないとリンクにならないが、そう書いていない言及も UI 側で勝手にリンクになれば、AI にドキュメントを書かせる時に「リンクは md リンクで書け」と言い続ける必要が無くなる。

設計上の差: 候補探索の基準パスが表示元で違う。バブルはセッションの cwd / root、md ファイルのプレビューはそのファイルのディレクトリ (相対言及はそこから、無ければプロジェクト全体で日付 prefix / 拡張子を緩めて探す)。
