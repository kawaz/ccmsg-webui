---
title: localStorage キーを mount path で名前空間化する
status: open
category: bug
created: 2026-09-17T14:54:30+09:00
last_read:
open_entered: 2026-09-17T14:54:30+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: kawaz
---

# localStorage キーを mount path で名前空間化する

## 概要

kawaz 2026-09-17 の確認で判明。localStorage のキー (`ccmsg.endpoint` / `ccmsg.settings` / `ccmsg.sessions.sort` / `ccmsg.sessions.pinned` / `ccmsg.layout.sessions-open`、TabShare の channel 名) が固定で、同じ origin の別 path に 2 つの webui を mount すると衝突する (endpoint の保存が特に致命的)。cookie は endpoint が `<endpoint>auth/*` の path で置くので区別される。

## 背景

同一 origin 上に複数の ccmsg-webui を異なる path に mount する運用がありうるが、現状 localStorage キーと BroadcastChannel 名が固定文字列のため、mount 先ごとの状態 (特に endpoint) が上書き・混線する。cookie は path scope で自然に区別されているのに対し、localStorage / BroadcastChannel は origin scope なので同じ対処が要る。

## 受け入れ条件

- [ ] localStorage キーを webui の mount path (`BASE`) で名前空間化する (例 `ccmsg:<base>:endpoint`)
- [ ] 既存キー (名前空間化前の固定キー) は読み取りだけの後始末とし、次の保存で新キーへ移す (DR-0002 の `ccmsg.theme` 移行と同じ扱い)
- [ ] TabShare の BroadcastChannel 名も mount path で名前空間化する
- [ ] 同一 origin の 2 つの base で endpoint と設定が独立して保持されることを確認
- [ ] 既存の保存値 (旧キー) が移行時に失われないことを確認
- [ ] DR-0002 か DR-0004 に「保存の名前空間は mount path」である旨を明記する
