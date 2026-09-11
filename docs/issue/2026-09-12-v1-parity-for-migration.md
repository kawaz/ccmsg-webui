---
title: v1 webui から v2 への移行に要るもの (v1 parity 棚卸し)
status: open
category: task
created: 2026-09-12T07:32:30+09:00
last_read:
open_entered: 2026-09-12T07:32:30+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: kawaz 個人棚卸し (2026-09-12)
---

# v1 webui から v2 への移行に要るもの (v1 parity 棚卸し)

## 概要

kawaz が v1 webui (`~/.local/share/repos/github.com/kawaz/claude-ccmsg/main`) から v2 に移るために何が要るかの棚卸し (2026-09-12、v1 リポ DR 34 本と webui 画面 vs v2 契約 / daemon / webui を突き合わせ)。

結論: 契約と daemon は揃っていて、**画面が無いだけ**のものが上位を占める。

## 背景

優先順 (使用頻度 → 実装の軽さ):

1. Usage / クォータ画面 — `llm.usage.read` 実装済み
2. prompt cache 残り時間リング + LLM status — topic `llm.status` / `llm.requests` 実装済み (リングに要る残時間項目が契約に揃うかは型定義で確認が必要)
3. Timeline の翻訳タブ — v1 は Chrome 内蔵 Translator API でブラウザ完結、daemon 経由の `translate.run` もある。どちらを採るかは設計判断
4. Status タブの中身 (workflow / background / TODO) — `session.status` / `session.errors` 実装済み、タブ枠は `route.ts` にあり「未実装です」表示のまま
5. Session Search (ccmsg 未起動の過去セッション検索) — `session.search` 実装済み
6. Session Launcher — `launcher.run` / `launcher.config.read` 実装済み
7. LLM stats 画面 — `llm.stats.read` 実装済み
8. session dump ボタン — `session.dump.write` / `dump.presets.read` 実装済み
9. session kill / rename、pinned — kill / rename は daemon 実装済み、pinned は webui ローカル

契約 / daemon から要るもの (本 issue と別 issue の対象):

10. sandbox 配信 (daemon 未実装、issue `sandbox-grant-delivery-path`)
11. Composer 添付 (契約に op 無し)
12. `.code-workspace` セクション (該当 op 不明)

v2 で意図的に捨てたもの: room 系一式 (DR-0001 §3-6 / 0003 / 0011-0014)、`mid` / `seq` (ただし契約 issue `notification-lacks-mid` が論点として残る)、PATH symlink インストール、旧 daemon 互換経路、人が inbox を見ること。

不明 (v1 INDEX が「webui へ移管 (裁定待ち)」): DR-0015 添付 / DR-0025 workflow 掘り下げ / DR-0028 session_kill、v1 `docs/design/webui-rebuild-checklist.md` の未決 3 件。

## 受け入れ条件

- [ ] kawaz が日常的に v2 webui を使い v1 を止められること

## TODO

<!-- wip 時のみ -->

- [ ] 上記 1〜9 を 1 件ずつ子 issue に切って着手 (本 issue は束の親)
