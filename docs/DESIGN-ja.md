# ccmsg-webui 設計

> 🇬🇧 [DESIGN.md](./DESIGN.md)

## ドメイン

このリポジトリが持つのは **契約の読み手 1 つ**。daemon が push するものを畳んで見せ、人の操作を op に変えて送る。ドメインの語彙 (セッションとは何か、分類はどう決まるか、topic はどう畳むか) は全て契約側にあり、ここには置かない。

daemon はこのページを配信しない。ページは自分の origin を持つ静的サイトで、daemon が提供するのは WS の API だけになる。この非対称が設計の起点で、次の 3 つがそこから出る。

- **接続先を推測できない**。ページの出所は daemon と無関係なので、endpoint も entry token も人が与える (`src/settings.ts`)
- **入口の許可は daemon の設定**。origin の許可集合に入っていなければ handshake は 403 で、ブラウザにはその番号が見えない (下記「観測できないもの」)
- **世代が違えば話さない**。互換経路は持たず、リロードを促す (契約「版と互換」)

## 層

| 層 | ファイル | 責務 |
|---|---|---|
| 接続 | `src/connection.ts` | socket の生死、`hello`、request と reply の相関、再接続、購読の復元 |
| 畳み | `src/topic-fold.ts` | topic frame を手元の値に畳む。規則は契約の `granularity` |
| 状態 | `src/state.ts` | signal と、その唯一の書き手である関数 |
| 派生 | `src/sessions.ts` `src/route.ts` | 並び・セクション・表示名・URL 文法 (純関数) |
| 画面 | `src/ui/` | 読むだけ |

状態層は `@preact/signals`。更新関数を state module に集約したものが action で、`useMemo` / `memo` は置かない (DR-0032 §2.1)。

## topic の畳み方は契約から引く

`TopicFold` は topic 名から契約の `topicGranularity()` を引いて畳む。webui 側にどの topic がどう畳むかの表は無く、契約に topic が増えてもこのファイルは変わらない。

畳んだ結果は常に **(instance, payload) のスロットの列**で、`whole` と `per_instance_whole` はスロットの鍵が違うだけの同じ操作になる (前者は topic に 1 つ、後者は instance に 1 つ)。読む側は 1 つの形だけを読む。instance ごとの全体を横断で足すのが `union()` で、これが契約の言う「手元の値は instance 横断の和」にあたる。

**`append` と `element` は畳まない**。購読する画面がまだ無く、畳めない topic を購読して「空」として読ませないために、購読時点で拒否する (`isFoldable`)。Timeline (`transcript`、`append`) を作る時に足す。

instance との接続が切れたら、その instance が言ったことは捨てる。止まった値は生きた値と見分けが付かない。

## 契約の検証は契約の検証器で

届いた topic frame は `TOPIC_SCHEMAS` と契約の `isValid()` に通す。フィールドを 1 つずつ見る検査をここに書かない — 検査は契約の仕事で、通らない frame は「契約の食い違い」という 1 つの結論にしかならないため、警告バナーに落ちる。

## 観測できないもの

**ページは拒否された handshake の HTTP status を読めない。** 401 (token 不一致) も 403 (origin 不許可) も、WebSocket API 上はどちらも詳細のない `error` イベントとして届く。ページはそのため「接続を拒否されたか、届きませんでした」としか言えない。

status 自体は消えているわけではなく、**ブラウザの console と network パネルには出る** (Chrome は `Unexpected response code: 403` と書く)。読めないのは JS であって人ではないので、切り分けはそこと daemon のログで行う。この曖昧さを埋めるために HTTP を先に叩くことはしない (別 origin なので CORS で同じだけ見えない)。

## 契約に無いもの

entry token を運ぶ subprotocol の接頭辞 (`ccmsg.token.`) は契約ではなく daemon の入口ポリシー (daemon §3.1) にある。`@ccmsg/protocol` は export しないので `src/connection.ts` に定数として置いてある。

## ビルド

vite + esbuild の automatic JSX (`jsxImportSource: preact`)。`@preact/preset-vite` は使っていない: 提供するのは prefresh の HMR で、そのために Babel のツールチェーン全体が依存に入る。JSX の変換自体は esbuild が同じ出力を出す。HMR が要るようになったら preset を入れる判断に戻る。
