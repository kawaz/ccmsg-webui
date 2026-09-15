---
title: visual test が起動した daemon (`ccmsg-webui-visual/home`) がホストに残る
status: open
category: bug
created: 2026-09-15T11:56:06+09:00
last_read:
open_entered: 2026-09-15T11:56:06+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: kawaz/ccmsg (main セッション)
---

# visual test が起動した daemon (`ccmsg-webui-visual/home`) がホストに残る

## 概要

2026-09-15 にホスト上で `bun …/ccmsg/main/src/cli.ts daemon run <tmp>/ccmsg-webui-visual/home` が 5 本、4 日間 (9/10 から) 残っていた。visual test の harness が起動した daemon を、test の失敗 / 中断時に止めていない。

## 背景

visual test harness は daemon を起動して UI 確認を行うが、teardown が test の成功パスにしか結び付いていない可能性がある。中断 (kill) や失敗時に daemon プロセスが孤児化し、ホストに残留する。

## 直すこと

- visual harness の teardown を成功 / 失敗 / 中断で必ず走らせる (pid を記録して kill、または daemon の `stop` を確実に呼ぶ)
- 起動前に同じ home の残骸が居れば回収する

## 受け入れ条件

- [ ] `just visual` を途中で kill しても `ccmsg-webui-visual` の daemon が残らない
- [ ] `just visual` 後に `pgrep -f ccmsg-webui-visual` が 0

## 関連

- ccmsg (daemon) issue `fork-probe-test-leaves-processes` (同型)
