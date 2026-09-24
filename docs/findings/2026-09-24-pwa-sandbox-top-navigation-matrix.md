# iOS / iPadOS の PWA で、sandbox iframe の中身が top を書き換えられるか

閲覧 iframe (DR-0005) の `sandbox` に何を付けるかを決めるための実測。実験頁は `test/manual/pwa-popups/` (outer = PWA 本体、kawaz.jp 側。inner = cross-site の iframe、tmpspace.net 側)。ホーム画面に追加した PWA (standalone) で kawaz が操作、2026-09-24。

## 1 回目: `_blank` / `window.open` の行き先 (iPad、sandbox は S1)

| 経路 | 結果 |
|---|---|
| 要素 `_blank` → 外部 site (top / iframe の中とも) | アプリ内ブラウザで開き、閉じれば戻る |
| 要素 `_blank` → 同じ site の別 host | 同上 |
| 要素 `_blank` → 同じ origin (top から) | **PWA 自身がその頁へ遷移** (scope 内なので戻れる) |
| `window.open` 同期 / 500ms 後 → 外部 (top / iframe の中とも) | アプリ内ブラウザ (非同期でもブロックされない) |
| 要素 `_top` → 外部 (top から) | アプリ内ブラウザ (PWA を離れない) |
| 要素 target なし → 外部 (top から) | アプリ内ブラウザ (scope 外への遷移は iOS がアプリ内ブラウザに逃がす) |
| iframe の中: `_blank` → 閲覧 site 自身の別 host / 同 origin | 別窓は開くが "Navigation was blocked by Cross-Origin-Opener-Policy" (tmpspace 側の hosting が COOP を付けているため) |

## 2 回目: sandbox のセット × 脱出経路 (iPad と iPhone)

中身の行: A 要素 `_blank` → 外部、B `window.open` → 外部、C 要素 `_top` → 外部、D 要素 `_top` → PWA の scope 内、E script で `top.location` 代入、F 要素 `_parent` → scope 内、G target なし → 外部、H `window.open` → scope 内。

| セット | sandbox | D / F | E | H |
|---|---|---|---|---|
| S0 | 属性なし | 乗っ取り | 通る | 乗っ取り |
| S1 | `allow-scripts allow-same-origin allow-popups` (現行) | **乗っ取り** (着地頁は standalone、opener あり) | SecurityError | 乗っ取り |
| S2 | S1 + `allow-popups-to-escape-sandbox` | 乗っ取り | SecurityError | 乗っ取り |
| S3 | S1 + `allow-top-navigation-by-user-activation` | 乗っ取り | SecurityError | 乗っ取り |
| S4 | S1 + `allow-top-navigation` | 乗っ取り | 通る | 乗っ取り |
| S5 | `allow-scripts allow-same-origin` | 遷移なし | SecurityError | null |

「乗っ取り」= 着地頁が PWA の窓そのものとして開く (`display-mode: standalone`)。S1 で `_top` が通るのは、WebKit が sandbox で塞いだ `_top` / `_parent` を `allow-popups` で別窓に逃がし、iOS が scope 内の URL の別窓を PWA の窓として開くため (opener あり = 別窓として開いた)。

## 3 回目: outer (webui 相当) に `Cross-Origin-Opener-Policy: same-origin` を付けて (iPhone)

| セット | D / F | H |
|---|---|---|
| S0 | 乗っ取り (opener なし) | 乗っ取り |
| **S1** | **blocked by COOP** (✕ で閉じられる窓にエラー頁) | **blocked** |
| S2 | 乗っ取り (opener なし) | 乗っ取り |
| S3 / S4 | 乗っ取り (top を直接遷移) | blocked |
| S5 | 開かず | null |

sandbox を継いだ別窓は COOP が `unsafe-none` でない文書を読み込めない (network error)。S2 は別窓が sandbox を脱ぐので通り、S3 / S4 は別窓を介さず top を遷移するので COOP が関与しない。

## 4 回目: hosting の header を外し、outer の Service Worker が navigation の応答に COOP を足す (iPhone)

| セット | D / F | H |
|---|---|---|
| S0 / S2 | 乗っ取り (opener なし、「SW 経由で配られた」) | 乗っ取り |
| **S1** | **blocked by COOP** | **blocked** |
| S3 / S4 | 乗っ取り (top を直接遷移) | blocked |

3 回目と同じ。WebKit は SW が返した応答の COOP を hosting の header と同じに評価する。`<meta http-equiv>` では COOP は付けられない (仕様上 応答 header 専用)。

## 5 回目: `Clear-Site-Data: "cookies"` が何を消すか

実験頁 `/csd.html` (SW が header を足す) と `/csd-direct.html` (SW を通らず hosting が header を付ける) で、host-only の cookie と `Domain=<site>` 付きの cookie を置いてから頁を開き直す。

| | SW の応答の header | hosting の header: host-only | hosting の header: `Domain=` 付き |
|---|---|---|---|
| iOS Safari / PWA (kawaz) | 消えない | 消える | **残る** |
| playwright WebKit (統括) | — | 消える | **残る** |
| Mac Chrome (kawaz) / playwright Chromium | — | 消える | 消える |

WebKit は `Clear-Site-Data` を SW の応答からは評価せず、hosting の header でも host の cookie しか消さない。WebKit main (2026-09 時点、`Source/WebKit/NetworkProcess/cocoa/NetworkStorageSessionCocoa.mm` の `deleteCookies(const ClientOrigin&)`) の述語は `partitionMatched && domain == String(cookie.domain)` で、応答の host と cookie の `domain` の文字列一致 + partition (top-level site) の一致。`Domain=` 付き (`.suffix` で始まる) は一致しないので残り、cross-site iframe で受けた header はその partition の cookie しか消さない。MDN / browser-compat-data には書かれていない (Safari 17 で対応、notes 無し)。仕様 (Clear Site Data §4.2.4) は 2017 年の WD から登録ドメインでの domain-match を定めていて、WebKit は初回実装 (2022-09、bug 203215) から応答の host 名で消しており、2023-01 の partition 対応 (bug 251094) もそれを引き継いだ。意図した除外ではなく、取り込んだ WPT が host-only の cookie しか置かないので検出されていない。WebKit bug 325085 として報告済み。SW の応答の header を評価しないのは仕様どおり (header は network response でのみ評価する)。別 id origin 間で共有される `Domain=` cookie を消すのは起動の頁の JS (中身を置く前に失効) が主で、header は storage の一掃と Chrome での保険 (DR-0005 §2.1)。

実運用での効き方: 閲覧 iframe は webui (`kawaz.jp`) の下の cross-site iframe なので、Safari / iOS は ITP で third-party cookie を丸ごと遮断し (`document.cookie` は読めず書きも捨てられる)、中身から cookie を置く経路が無い。Chrome は third-party cookie を許すが header が site 全体に効く。起動の頁の JS の失効 (`view/boot.ts` の `expireCookies`) はその外側の保険で、**自動試験では未検証**: harness は http で配るため cross-site iframe から `SameSite=None; Secure` の cookie が置けず、`Domain=localhost` も拒否される。

## 結論 (DR-0005 §2.2、§6 FV-Q6 / FV-C1)

- 閲覧 iframe の sandbox は S1 のまま。`allow-popups-to-escape-sandbox` と `allow-top-navigation*` は付けない
- webui 自身の Service Worker が navigation の応答に `Cross-Origin-Opener-Policy: same-origin` を足す (hosting に頼らず build に閉じる。canddy-app-proxy の Caddyfile にも同じ header を付けてあるが、それは保険で要求ではない)
- 外部リンクは中身から開ける (アプリ内ブラウザ)。scope 内へ出ようとする経路は全部エラー頁になり、閉じれば戻る
- 同 origin への `_blank` は PWA 自身が遷移する。webui の中に同 origin への `_blank` は置かない

## 未確認

- B (`window.open` → 外部) は 1 回目は開き、2 回目以降は null を返した。webui の中身には `window.open` を使う経路が無いので追わない
- Android / Chrome の PWA は未実測
