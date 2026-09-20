---
title: Session Launcher にディレクトリツリー選択を追加
status: open
category: task
created: 2026-09-12T20:01:33+09:00
last_read:
open_entered: 2026-09-12T20:01:33+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: v1-parity-for-migration (束 0)
---

# Session Launcher にディレクトリツリー選択を追加

## 概要

Session Launcher の「始める場所」は root_dirs を押して下の欄に書き足す形 (v0.13.0)。v1 は root 配下を深さ 2 まで展開したディレクトリツリー + 検索フィルタを持っていた (DR-0018、`SessionCreator.tsx`)。v2 でツリーを出すには `dir.tree` (契約 `dir.tree`、daemon 実装済み) の往復と、それ用の UI (展開 / フィルタ / 選択) が要る。

## 背景

v1-parity-for-migration の棚卸しから派生。daemon 側の `dir.tree` 契約は実装済みで、webui 側の UI が未対応。

## 受け入れ条件

- [x] root ごとにツリーを展開できる
- [x] 名前でフィルタできる
- [x] 選ぶと欄に入る
- [x] 深さ上限は config (`dir_tree_depth` 相当) で決まる

## 実装 (2026-09-20)

`src/files/dir-tree.ts` (木を 1 本の並びに下ろす / 深く聞いた答えを継ぐ、DOM 無しで測れる形) と `src/ui/Launcher.tsx` の `DirPicker`、`src/state.ts` の `readDirTree`。

- 深さは `depth` を**送らない**ことで config が決める。開いた節だけ `depth: 1` で聞き直す
- 絞り込みは instance の `filter` に任せる (当たった節と先祖が残る)。押すまで走らせないのは、打つたびに木を作り直させないため。絞った時は当たった所まで開いた姿で出す
- 根そのものも始められる場所なので、行として残した (前の「根のボタン」で出来ていたことを落とさない)

### 実機で分かった契約の振る舞い

**`dir.tree` は聞いた所そのものを答えに入れない**。`roots: [A, B]` で聞くと、返るのは A の下と B の下が 1 本の配列に混ざったもので、A / B の節は入らない。契約の記述 (`DirTreeArgs.roots` の「Configured roots, or any directory below one」) からはこれが読み取れず、最初は「根の節が返る」と読んで作って外した。

そのため **根ごとに 1 回ずつ聞く**。まとめて聞くと、どの根の下だったかが失われて 2 本の木が 1 本に混ざる (根が入れ子になっている config では特に区別が付かない)。
