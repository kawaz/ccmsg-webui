---
title: markdown code span 内の URL がリンクにならない
status: open
category: bug
created: 2026-09-18T18:43:21+09:00
last_read:
open_entered: 2026-09-18T18:43:21+09:00
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

# markdown code span 内の URL がリンクにならない

## 概要

メッセージ本文の markdown で、インライン code (`` `https://…` ``) に書かれた URL がリンクにならない。

## 背景

kawaz からの報告 (2026-09-18)。直すこと: code span の中身が整形済みの http(s) URL 1 つだけ (空白なし、`{}` 等のテンプレ文字なし) なら、code の見た目のまま `<a href>` にする (既存の fuzzy file link / リンクの扱いと同じ target)。v1 (claude-ccmsg) にも同じ issue がある。

kawaz 2026-09-18: テンプレ文字の例外は不要。code span の中身も本文と同じ URL 判定 (既存の linkify の規則) に通すだけ。

## 受け入れ条件

- [ ] code で書かれた URL がクリックで開く
- [ ] code span の中身も本文と同じ linkify 規則で判定される (テンプレ文字専用の除外ロジックを別途作らない)
- [ ] visual test に 1 例
