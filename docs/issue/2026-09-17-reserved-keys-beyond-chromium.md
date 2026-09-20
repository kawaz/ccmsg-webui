---
title: 予約キーの表を Chromium 以外まで広げる
status: open
category: request
created: 2026-09-17T13:40:00+09:00
last_read:
open_entered: 2026-09-17T13:40:00+09:00
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

# 予約キーの表を Chromium 以外まで広げる

## 概要

キーバインドの「予約」(ブラウザがページに keydown を渡さない組み合わせ) の一覧は、今は **Chromium のソースと、macOS の Safari の最小限の観測**だけが出典になっている。他のエンジンと、まだ出典の無い列を埋めたい。

## 済んでいること

DR-0003 §2.5 に出典付きで写し済み (HEAD `9dfda8687c6295931baa7bcd3b4d888e6d064000`):

- `chrome/browser/ui/browser_command_controller.cc` の `IsReservedCommandOrKey` — 予約とするコマンドの列挙
- `chrome/browser/ui/accelerator_table.cc` — Windows / Linux の accelerator (**旧 `chrome/browser/ui/views/accelerator_table.cc` は 2025-08-21 に親ディレクトリへ移動済み**)
- mac は `chrome/browser/ui/cocoa/accelerators_cocoa.mm` と `chrome/browser/global_keyboard_shortcuts_mac.mm`
- Windows / Linux の列も実装 (`src/actions/binding.ts` の `RESERVED`) に入れ済み

Safari は本体非公開なので、Apple の公開ショートカット一覧と、`/Applications/Safari.app/Contents/Resources/Base.lproj/MainMenu.nib` から抜いたメニューのキー等価 (71 項目) を出典にし、「ページに渡るか」だけ最小限を観測した。

2026-09-20 に Firefox / Edge / Safari の残りを足した (DR-0003 §2.5):

- **Firefox はソースに「予約」がそのまま書いてある**。`browser/base/content/browser-sets.inc` の `<key reserved="true">` を `dom/events/GlobalKeyListener.cpp` の `IsReservedKey` がページへ配らない。`mozilla/gecko-dev` master、HEAD `5836a062726f715fda621338a17b51aff30d0a8c`。Firefox だけが取るのはプライベートウィンドウ (`⇧⌘P` / `Ctrl+Shift+P`) と終了 (`Ctrl+Q` / `Ctrl+Shift+Q`) で、`src/actions/binding.ts` の `RESERVED` に足した
- **Edge は出典が無いことを書いた**。本体は非公開で、Microsoft が公開しているのはショートカット一覧だけ (「ページに渡すか」は書かれていない)
- **Safari の動的なキー等価の出所**: メニュー項目自体は `MainMenu.nib` にあり (`selectNextTab:` / `selectPreviousTab:` / `reopenLastClosedTabOrWindow:` と、`selectNextTabMenuItem` / `selectPreviousTabMenuItem` outlet)、キー等価だけが実行時に付く。書き換えている場所は非公開で追えない

## 残っていること

1. **Windows / Linux は実機で 1 度も見ていない**。出典は Chromium と Firefox のソースだけで、実際に keydown が届かないことは確かめていない。この機械は mac しか無いので、ここは機会待ち
2. **Edge 独自の予約があるかは不明のまま**。Chromium 系なので Chromium の表は効くとみられるが、足された分は分からない

## 受け入れ条件

- [ ] Windows / Linux の予約が、ソース以外の根拠 (実機か、別の一次資料) でも裏付けられている
- [x] Firefox / Edge について、予約の出典があるか「無い」ことが書かれている
- [x] Safari の動的に足されるショートカットの出所が分かるか、分からないことが DR に書かれている

## 注意

実機で確かめる場合、**headed のブラウザで人の操作を横取りしない**こと (キーを送っている間その機械のキーボードを奪う)。2026-09-17 の調査でそれをやって止められている。
