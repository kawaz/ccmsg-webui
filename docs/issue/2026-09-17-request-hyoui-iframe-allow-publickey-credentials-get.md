---
title: hyoui を埋め込む iframe の allow に publickey-credentials-get を足す
status: open
category: request
created: 2026-09-17T16:15:00+09:00
last_read:
open_entered: 2026-09-17T16:15:00+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: hyoui DR-0036 (passkey 認証、v0.9.52 で実機稼働)
---

# hyoui を埋め込む iframe の allow に publickey-credentials-get を足す

## 概要

hyoui の web gateway が passkey 認証必須になった (hyoui DR-0036、v0.9.52)。Terminal タブが埋め込む hyoui の iframe (`src/ui/TerminalPanel.tsx:37`、現在 `allow="clipboard-read; clipboard-write"`) の中で WebAuthn の `get()` が走れるように、`allow` に `publickey-credentials-get` を足してほしい。

```tsx
allow="clipboard-read; clipboard-write; publickey-credentials-get"
```

## 背景

- hyoui 側は iframe 内での認証を許す設計 (登録は top-level 限定、認証は `clientDataJSON.origin` が hyoui endpoint の origin と一致すれば通す。`topOrigin` は見ない)。Chrome で実測済み
- この属性が無いと、iframe 内の `get()` は `NotAllowedError` になり、hyoui 側の overlay から直接サインインできない。top-level で hyoui にログインして cookie を持てば iframe 内でも refresh は通るので致命ではないが、初回や失効後に「別タブで hyoui を開いてログイン」が要る
- `publickey-credentials-create` は不要 (登録は CLI の招待 URL を top-level で開く経路のみ)
- `sandbox` は現状 (`allow-scripts allow-same-origin allow-forms allow-popups`) のままでよい

## 受け入れ条件

- [ ] ccmsg webui の Terminal タブ内で、hyoui の overlay から passkey サインインが完了する (Chrome、iOS Safari)
