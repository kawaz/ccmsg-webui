---
title: markdown code span 内の URL がリンクにならない
status: resolved
category: bug
created: 2026-09-18T18:43:21+09:00
last_read:
open_entered: 2026-09-18T18:43:21+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered: 2026-09-21T00:05:46+09:00
discard_reason:
pending_reason:
close_reason: ["done:code span も classifyMarkdownLinkUrl に通し、scheme を持つものだけリンク化 (scheme 無しは普通の code span のまま)。unit 2 本 + visual 1 例"]
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

- [x] code で書かれた URL がクリックで開く
- [x] code span の中身も本文と同じ linkify 規則で判定される (テンプレ文字専用の除外ロジックを別途作らない)
- [x] visual test に 1 例

## 直した時に分かったこと (2026-09-20)

**地の文には linkify 規則が無い**。GFM の autolink-literal を入れていないので、裸の URL は裸のまま (`test/markdown-view.test.ts` の「a bare URL in prose is not autolinked」がそれを固定している)。リンクの判定を持っているのは `classifyMarkdownLinkUrl` だけなので、code span もそれに通した。

scheme を持つものに限る条件を 1 つ足してある。scheme が無い綴りは `classifyMarkdownLinkUrl` では `path` になり、`rows` のような普通の code span が残らずファイルへのリンクになってしまうため (それを拾うのは `file-word.ts` の別の仕事)。テンプレ文字の除外ロジックではなく、「括ったもの全体が 1 つの行き先か」の判定。
