---
title: セッションリストがページ全体の高さを決めてしまい、遷移直後の TL が空の最下部にスクロールされて読めない
status: resolved
category: bug
created: 2026-09-14T13:36:50+09:00
last_read:
open_entered: 2026-09-14T13:36:50+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered: 2026-09-14T14:09:23+09:00
discard_reason:
pending_reason:
close_reason: ["done: v0.19.0 で頁を scroll させず2ペインがそれぞれ自分の高さの中で scroll するよう変更、TL の末尾追従は本文ペインの scroll 容器基準に (src/layout/scroller.ts)","done: visual に layout-tail を追加、linux 基準も描画済み、本番 build 済み"]
blocked_by:
origin: kawaz
---

# セッションリストがページ全体の高さを決めてしまい、遷移直後の TL が空の最下部にスクロールされて読めない

## 概要

kawaz 2026-09-14 (v0.18.0)。セッションリストからセッションを選ぶと transcript に遷移し、TL の一番下へ移動しようとするが、左のセッションリストがページ全体の height を決めているため、右の TL は何も無い最下層の部分にスクロールされて読めない。

## 背景

セッションリストはページ全体に対して箱を広げず、自分の高さ (viewport) の中で scroll するべき。ページ (main) の scroll は main の内容 (TL) が決めるべきで、TL の末尾追従は main の scroll container を基準に行う必要がある (ページ全体の scrollHeight を見ない)。

v1 の対応画面 (`~/.local/share/repos/github.com/kawaz/claude-ccmsg/main/packages/webui/src/`) のレイアウトを先に読んで、何に気を使っていたかを把握してから直す (写さない)。

## 受け入れ条件

- [ ] セッション数が viewport より多い状態で別セッションに遷移しても、TL の末尾 (最新の item) が見える位置で止まる
- [ ] サイドバーは独立に scroll でき、main の scroll 位置に影響しない
- [ ] visual test の基準画面 (4 面 31 画面) に「長いセッションリスト + 遷移直後」のケースを足す
