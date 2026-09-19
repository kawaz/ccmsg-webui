---
title: visual test の file-word-bubble が縦位置ずれで落ちる (原因未特定)
status: open
category: bug
created: 2026-09-19T12:41:02+09:00
last_read:
open_entered: 2026-09-19T12:41:02+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: ccmsg
---

# visual test の file-word-bubble が縦位置ずれで落ちる (原因未特定)

## 概要

`test/visual/screens.visual.ts` の `file-word-bubble` (light / dark) が、DR-0003 のアクション体系の実装とは無関係に落ちていた。差分は transcript 本文ぜんぶの**縦位置のずれ**で、色や字形の違いではない。落差は約 47222 px (全体の 0.05)。

## 背景

### 実測

落ちることを確認した commit: `vwyzltvk 09316297` (`issue(close): 2026-09-17-timeline-selected-message-and-voice-nav -> archive`)。DR-0003 の実装に着手する前の working copy の内容に戻して測った。

手順と実出力:

```
$ git checkout HEAD -- src/ui/Files.tsx src/markdown/markdown-view.tsx src/actions/catalogue.ts
$ bun x playwright test --grep "file-word"
  2 failed
    [light] › test/visual/screens.visual.ts:239:1 › file-word-bubble
    [dark] › test/visual/screens.visual.ts:239:1 › file-word-bubble
  2 passed
```

同じ実行で `file-word-candidates` は通る。つまり DR-0003 の変更を全部外しても `file-word-bubble` だけが落ちる。

### 分かっていないこと

**原因は特定していない。** この test は `.md-file-word-more` を押して候補の一覧を出した後に撮るので、候補が開いたぶんの高さが基準と合っていないのが最も近い読みだが、裏は取っていない。

### 基準画像の状態

**基準は v1.11.0 で撮り直し済み**なので、この縦位置ずれはそのまま新しい基準に取り込まれている。つまり今は緑だが、**ずれが起きた原因は未特定のまま**。撮り直し前の基準と比べたい時は snapshots リポの履歴を辿ること。

## 受け入れ条件

- [ ] 縦位置がずれた原因を特定する (候補の一覧の高さか、別の要因か)
- [ ] 意図した描画であれば、その旨を test か基準の近くに残す
- [ ] 意図しない描画であれば直し、基準を撮り直す
