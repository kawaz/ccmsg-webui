---
title: webui のファイル閲覧が ccmsg v1.7.0 の file.read に追随していない
status: open
category: bug
created: 2026-09-19T21:52:47+09:00
last_read:
open_entered: 2026-09-19T21:52:47+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: ccmsg (依頼元プロジェクト)
---

# webui のファイル閲覧が ccmsg v1.7.0 の file.read に追随していない

## 概要

ccmsg v1.7.0 (f6e4e12「file.read はバイト列を範囲で答える (契約 v2.8.0 / DR-0031)」、2026-09-19 21:28) 以降、webui の `src/files/files-view.ts` が `file.read` の答えを従来どおり `reply.content` の文字列として読んでいるため、ファイルの中身が画面に出ない。

## 背景

visual の files-code / files-markdown / file-word-candidates が light/dark 合わせて 6 本、darwin で 3 回連続して同じ理由で落ちる (`getByText("isFoldable")` が見つからない)。webui v1.12.2 の作業コピーで再現し、変更前の tree でも同じなので webui 側の変更とは無関係 (= ccmsg 側の契約変更が原因)。

## 受け入れ条件

- [ ] 契約 v2.8.0 の `file.read` の答え (バイト列 + 範囲) に `files-view.ts` を追随させる
- [ ] 範囲で答える形になったので `Files.tsx` の「`file.read` は続きを求める引数を持たない」という表示も見直す
- [ ] visual の files-code / files-markdown / file-word-candidates が通り、基準を撮り直す
