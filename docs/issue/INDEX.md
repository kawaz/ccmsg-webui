# Issue INDEX

active な issue の一覧。close 済みは archive/ にあり、ここには載せない。

| date | category | status | slug | 概要 |
|---|---|---|---|---|
| 2026-09-12 | design | open | [color-system-three-layers](./2026-09-12-color-system-three-layers.md) | 色システムを 3 層構造 (入力 / scale / 意味名) で v2 webui に導入する |
| 2026-09-11 | request | open | [team-overview-view](./2026-09-11-team-overview-view.md) | teammate 同士の会話を俯瞰する view (team overview) |
| 2026-09-11 | bug | open | [anchor-snapshot-one-frame-stale](./2026-09-11-anchor-snapshot-one-frame-stale.md) | Timeline 遡り読みの錨が scroll 事象 1 フレーム分だけ古くなる |

<!--
INDEX の列構成・canonical 順序・行形式の唯一の正本:

- 列構成は固定 (= 上記 5 列、列名と順序を変えない)
- 行の {{rows}} は active issue の行に置換する
- canonical 順序:
  1. status 優先順: idea → open → wip → blocked → pending-sublimation
  2. 同 status 内は date 降順 (= 新しい起票が上)
- 各行: `| YYYY-MM-DD | <category> | <status> | [<slug>](./YYYY-MM-DD-<slug>.md) | <本文 1 行目から 80 文字以内> |`
- 概要は 80 文字を超えたら末尾を「…」で省略
-->
