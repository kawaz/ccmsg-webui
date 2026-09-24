# DR-0005: ファイルは別の site が Service Worker 越しに描く

Status: Accepted
Date: 2026-09-19

ここに書くのは**なぜそう決めたか / 何を捨てたか**。画面ぜんぶの姿は [DR-0004](DR-0004-one-state-machine-decides-what-the-screen-is.md)、操作の器は [DR-0003](DR-0003-an-action-is-what-a-key-and-a-button-both-reach.md)。

§6 は**裁定の記録**。

## 1. 背景

### 1.1 今、ファイルはどう見えているか

`src/ui/Files.tsx` は木と中身の 2 枚で、中身の側が描けるのは**文字だけ**。

| ファイル | 今どうなるか |
|---|---|
| テキスト | 行番号付きで出る。markdown は「原文 / プレビュー」を切り替えられる |
| 大きなテキスト | 途中で切れ、「`file.read` は続きを求める引数を持たないので、この先はここからは読めません」と出る |
| 画像・PDF・動画・書庫 | `binary` が真。**中身は一切届かない** ("バイナリファイルです" と出るだけ) |

契約の `FileReadResult` が `content: string` / `binary: boolean` で、`binary` の時は本文を送らないと決めているため (`@ccmsg/protocol` `src/control/files.ts`)。

### 1.2 何が要るか

人が見たいのは、セッションの手元にある**スクリーンショット・図・PDF・ビルドした HTML**で、これらは**ブラウザが素で描ける**。自前で描き直す道具を webui に積む話ではなく、**ブラウザに渡す**話。

渡し方は 1 つしか無い — そのファイルが、**URL を持つ**こと。`<img src>` も `<iframe src>` も `<video src>` も、指せるのは URL だけ。

### 1.3 なぜ webui の中では描けないか

任意の HTML を描くということは、**その HTML の中の script が、描いた頁と同じ出自で走りうる**ということ。webui の頁で描けば、その script は webui の storage・DOM・そして endpoint へ向かう認証済みの往復に手が届く。

`sandbox` 属性の iframe に閉じ込める手はあるが、閉じ込め先が同じ **site** に居る限り**cookie の分割の単位を共有する**。分割された cookie (CHIPS) の分割の単位は origin ではなく top-level site で、同じ site の別 origin は同じ分割 cookie を共有しうる (契約 [DR-0028](https://github.com/kawaz/ccmsg-protocol/blob/main/docs/decisions/DR-0028-refresh-cookie-across-sites.md))。つまり **origin を分けるだけでは足りない**。

壁はもう 1 枚要る。描いたファイルの script は、**同じ origin の中の物なら何でも見える** — 同じ SW が答える他のパス、origin の storage、他の iframe の DOM。閲覧の場所が 1 つの origin だと、描いたファイル同士に壁が無い。webui と endpoint から隔てるのは **site** の壁、描いたファイル同士を隔てるのは **origin** の壁で、役目が違う。

### 1.4 daemon は HTTP を足したくない

ファイルに URL を与える最も素直な形は「instance が `/files/...` を配る」だが、それは daemon に**認証付きの静的配信**という責務をもう 1 つ積むことになる。今 daemon が HTTP で持っているのは `auth/*` だけで、残りは全部 1 本の接続の上に載っている。

## 2. 決定

### 2.1 閲覧は別の site が引き受け、開くたびに別の origin で描く

webui と endpoint のどちらとも **site が違う** 1 つの site (以下**閲覧 site**) を立てる。**別 origin では足りない** — §1.3 の通り、分割 cookie の単位は site だから。

その site の中で、**開くたびに乱数の id を振った origin** (`https://ccmsg-view-<id>.<閲覧 site>`) を使う。描いたファイル同士の壁は origin (§1.3)。id は開く webui が振り、何からも導出しない — 同じファイルを開き直しても別の origin になる。閲覧 site は cookie も秘密も持たない (§2.6) が、同じ site に居る origin 同士が共有しうる物が 1 つだけある — **cookie**。描いたファイルの script は `document.cookie` に `Domain=<閲覧 site>` を付けて書け、それは別の id の origin からも読める (cookie は origin でなく host と `Domain` で括られる)。この抜け道は 2 段で塞ぐ。**起動の頁が中身を置く前に、自分から見える cookie (host-only と `Domain=` 付き、パス `/` と `/view`) を失効させる** — 別の sid の中身と共有できるパスはその中に入る。加えて hosting が閲覧 site の頁の応答に **`Clear-Site-Data: "cookies", "storage"`** を付け、site の cookie と origin の storage (DOM storage、IndexedDB、Cache、OPFS、SW の登録) を消す。header の `cookies` は Chrome では site 全体に効くが、**WebKit は host の分しか消さず `Domain=` 付きは残る** (実測、`docs/findings/2026-09-24-pwa-sandbox-top-navigation-matrix.md`)。だから主は起動の頁の JS で、header は storage の一掃と Chrome での保険。header は起動の頁にだけ付く — 中身は SW が答えるので、描いている最中に消えることはない。webui の中の cross-site の iframe は、ブラウザによっては cookie に触れないが (Safari の ITP、Chrome の third-party cookie の扱い)、それは環境の話なので当てにしない。

閲覧 site の中身は **2 つの静的ファイル**だけで、どの origin にも同じ物を配る。

| 置く物 | 役目 |
|---|---|
| 頁 1 枚 (`index.html`) | 親からの message を待つ。「開く」なら `MessageChannel` のポートを受け取って Service Worker を登録し、ポートを渡す。「片付ける」なら origin に残る物を全部消して答える。**読み込まれただけでは何もしない** |
| Service Worker | 自分の scope への fetch を横取りし、ポート越しにバイト列を頼んで `Response` を組む |

**動く物は置かない**。配るのは proxy (hosting) で、FQDN の用意・証明書・配信は**フロントの責務**。この DR はそこに「この site は他のどれとも site が違うこと」「`ccmsg-view-<id>` のどの host も名前が引けて (wildcard の DNS) 同じ 2 つのファイルを返すこと」「頁の応答に `Clear-Site-Data: "cookies", "storage"` を付けること」だけを要求する。

**daemon には何も足さない**。閲覧 site は instance を知らず、instance も閲覧 site を知らない。

### 2.2 閲覧は常に webui の頁の中の iframe で、トップレベルの遷移を伴わない

```
webui の頁 ──┬─ 接続 (WS / 将来は DataChannel) ── instance
             │
             └─ iframe: 閲覧 site
                  │  postMessage で MessageChannel の port2 を渡す
                  ▼
                Service Worker ── fetch を横取り ── port 越しに「このパスのバイト列」
```

- webui は id を振り、`<iframe src="https://ccmsg-view-<id>.<閲覧 site>/view/<sid>/<kind>/<path>">` を置き、id を台帳に控える (§2.5)
- 閲覧 site の頁は「開く」の message でポートを受け取ってから SW を登録し、ポートを SW へ引き渡す
- 頁は**同じパスに印 (`?ccmsg-view`) だけ付けた iframe を内側に置く**。中身を描くのはそれ
- SW は自分の scope の fetch を横取りし、ポートに「このパスの、この範囲」を頼む
- webui の頁は接続中のチャネルの `file.read` で取り、ポートに返す
- SW はそれを `Response` に組んで返す。**ブラウザから見れば、ただの HTTP 応答**

**「別タブで開く」「新しい窓で開く」は提供しない**。ホーム画面に追加した PWA では、トップレベルで別 FQDN へ遷移すると **scope の外に出て戻れない** — 閲覧 site は定義上 webui と site が違う (§2.1) ので、トップレベルで開いた瞬間にそれが起きる。閲覧が常に iframe の中に居ることは、この形の**要件であって副作用ではない**。iframe の中からトップレベルへ出る経路 (`top` への遷移) も同じ理由で塞ぐ。`<a target="_blank">` / `window.open` は許す — 開いた窓は sandbox を継ぐ。iOS / iPadOS の PWA では外部への別窓はアプリ内ブラウザで開き、閉じれば戻る (実測、`docs/findings/2026-09-24-pwa-sandbox-top-navigation-matrix.md`)。

**`allow-popups` だけでは top は守れない**。WebKit は sandbox で塞いだ `_top` / `_parent` を別窓に逃がし、PWA は scope 内の URL の別窓を **PWA の窓そのものとして開く** — 中身から webui の URL を `_top` で指すだけで画面が乗っ取られる (実測)。塞ぐのは **webui の頁の応答に付く `Cross-Origin-Opener-Policy: same-origin`**: sandbox を継いだ別窓は COOP が `unsafe-none` でない文書を読み込めない (network error) ので、中身から webui の URL を別窓で開く経路 (`_top` / `_parent` / `window.open`、`noopener` の有無を問わず) は全部エラー頁になり、閉じれば戻る。外部への別窓には効かないので、外部リンクは開けたまま。この header は **webui 自身の Service Worker が navigation の応答に足す** — hosting に頼らず build に閉じるためで、WebKit は SW が返した応答の COOP を hosting の header と同じに評価する (実測)。meta では付けられない (COOP は応答 header 専用)。`allow-popups-to-escape-sandbox` を付けると別窓が sandbox を脱いで COOP をすり抜け、`allow-top-navigation(-by-user-activation)` を付けると別窓を介さず top を直接遷移するので、どちらも付けない。

これは iframe + `MessageChannel` を選ぶ理由の 1 つでもある。別タブ方式は §5 の「親が生きている必要」を外せるように見えるが、**PWA では入口そのものが無い**。

**中身が入れ子の 1 枚内側に居るのは、順番を構造で決めるため**。親が置く URL には印が無く、印の無い navigate には **SW が答えない** — 配信元が起動の頁を返し、その頁がポートを渡してから、印を付けて中身を頼む。こうすると「ポートが揃う前に中身の要求が着く」道も、「前の親の死んだポートで答えようとする」道も**存在しなくなる**。

素直に見える「ポートを渡してから同じ URL を開き直す」形は後者で壊れる: 親の頁が別のファイルへ移ると、渡し済みのポートは向こうの端が死んだまま SW に残り、次の navigate はその死んだポートで答えようとして**永久に返らない** (実機で観測)。SW の側で待つのをやめる形は時間の当て推量になるので、**待たなくて済む順番**を入れ子で作る。

印は query なので**パスは変わらない**。相対参照は query に関わらず同じ `/view/...` へ落ちるので、§2.4 の効き目はそのまま残る。中身の iframe は起動の頁の `sandbox` を継ぐので、閉じ込めも弱まらない。

中身の中のリンクを押した遷移 (印の無い navigate) は、SW が **同じ URL に印を付けた redirect** で答える — 見分けるのは `referrer` で、同じ origin の `/view/...` から来た遷移がそれ。referrer が無い、または別 origin (= webui が新しく開いた) 時だけ答えず、配信元が起動の頁を返す。中身の中を辿る遷移が起動の頁 (と、その応答に付く `Clear-Site-Data`、§2.1) を踏まないのはこのため。

**中身は起動の頁と同じ権限を持つ**。中身の iframe に `allow-same-origin` が要る (SW は opaque origin の文書を制御できない) ので、中身と起動の頁は同じ origin で、起動の頁が同 origin の中身から守れる物は無い。中身は起動の頁が送れる message を webui にも SW にも全部送れる。だから守りは 2 つに限る: webui の門番 (下) と、SW に渡ったポートが transfer 済みで誰からも取り出せないこと (§2.6)。SW はポートを**登録ごとに最初の 1 回だけ**受ける (中身は起動の頁がポートを渡した後にしか存在せず、origin は開くたびに変わるので差し替えは要らない)。webui は閲覧 origin からの message で、iframe の除去と、主経路の nonce が一致した時の台帳の削除以外の動作をしない。

**ポートの向こうに居るのは常に webui の頁で、SW が自分で接続を張ることはない**。閲覧 site には access token も endpoint の住所も**一切置かない** — 置けば、静的配信でしかないはずの site が秘密を持つ場所になる。加えて webui の頁が**門番**を兼ねる: 頼まれたパスが「今開いているセッションの木の中か」を見てから `file.read` に渡す。

### 2.3 SW は仮想の web サーバで、それ以上の物ではない

SW がすることは 1 つだけ — **fetch が来た時点で親に問い合わせ、返ってきたヘッダと本文をそのまま `Response` にする**。

- **fetch が来るまで何もしない**。先読みも、一覧の取り寄せも、パスの解釈もしない
- **頼むのは要求どおりの範囲だけ**。ブラウザが `Range` で聞いた分を渡し、その範囲が契約の 1 回の上限 (契約 DR-0031) を超える時だけ、上限で割って続けて頼む。**次に何を聞かれるかを当てにいかない** — 当てが外れた分は、誰も見ないバイト列を運んだことになる
- 返す物は `Content-Type` ほかのヘッダと本文。**組み立てはするが、中身は作らない**
- 本文は **`ReadableStream` として渡す** (kawaz 2026-09-19)。親頁の file クライアントが範囲読みを繋いだ stream を返し、SW はそれを `Response` の body にそのまま載せる。届いた分から描き始められ、背圧は stream の `pull` が受け持つ。範囲読みは線の上の形で、stream はその線を越えないアプリ側の境界 — 直列に繋ぐか並行に繋ぐかは stream の中に閉じる
- ブラウザから見れば、**普通の web サーバが 1 つ居る**のと区別がつかない。だからこそ `<img>` も `<video>` の `Range` も `<iframe>` の相対参照も、何も足さずに動く

`Content-Type` を決めるのは**親頁**で、根拠は**拡張子**。instance には聞かない (契約 DR-0031 §3: 契約は media type を答えない)。決める場所を親に置くのは、**描画の性質を決める値を、描く責務を持つ側が持つ**ため — instance の嗅ぎ分けが、閲覧 site で何が script として走るかを決める形にしない。

### 2.4 相対参照が同じ経路で解ける

`/view/<sid>/<kind>/<path>` という**パスの形をそのまま保つ**のが、この設計の効き目の中心。

描いた HTML が `<img src="./fig.png">` と書いていれば、ブラウザはそれを `/view/<sid>/<kind>/<dir>/fig.png` として引きに行く。それも SW の scope の中なので、**同じ横取りが同じように拾う**。CSS も、CSS の中の `url()` も同じ。

**ディレクトリ単位の閲覧が、何も足さずに成り立つ**。1 ファイルを描く仕組みを作ったら、サイトを描く仕組みが付いてきた形で、これは目的と手段が噛み合っている合図 (`design-spec/spec-preflight`)。

### 2.5 見たものは残らない

閲覧は**毎回使い捨て**。見た中身は iframe を閉じれば消える。

- **SW はキャッシュを持たない**。同じファイルを 2 回開けば 2 回取りに行く
- 明示の TTL は**任意**。持たなくてよい — 持つ物が無ければ、期限を決める必要も無い
- 閲覧 site に**中身は残らない**ので「古い中身が出る」は起こらない。残るのは origin の storage の類で、それは下で webui が消す

読んでいるファイルは編集され得るし (`file.edit` は同じ画面の中にある)、閲覧 site は誰の物でもない場所なので、**残さないことが既定として正しい**。取り直す代償は往復 1 つで、それは §5 が既に受けている代償と同じ種類。

**残る物は origin に紐づく storage の類**。SW の登録、localStorage / sessionStorage、IndexedDB、Cache Storage、OPFS、cookie — 描いた script はどれにも書けるし、SW の登録は頁が自分で作る。ブラウザはこれらを origin ごとに永続化し、iframe を外しても消さない。開くたびに origin が変わる (§2.1) ので、放っておけば開いた数だけ溜まる。ブラウザの自動回収は当てにしない (Chrome は storage が逼迫した時に origin 単位で退去させるだけ、Safari の期限付き退去は site 単位で条件付き)。**消すのは iframe を置いた側 = webui の責務**で、経路は 2 本:

- **主経路: 台帳から掃除する**。webui は id を振ったら**台帳 (webui の origin の storage) に控えてから** iframe を置き、開いている間はその id に生存印 (時刻) を打ち続け、定期 (数時間ごと) と起動時に、生存印が一定時間より古い id の頁を見えない iframe で開いて「片付ける」を**乱数の nonce 付き**で送り、**同じ nonce を返す答え**が来た時だけ台帳から消す。台帳から消せるのはこの経路だけ — 掃除で開いた頁には中身が居ない (起動の頁は「開く」が来るまで何もしない、§2.1) ので、nonce を知る同 origin の script は起動の頁自身しか無い。古さを開いた時刻でなく生存印で測るのは、長く開いたままの閲覧を別のタブの webui が片付けてしまわないため (台帳は同じブラウザの webui のタブで共有される)。答えが一定時間で返らなければその回は諦めて id を残し、次の回にまた試す — 「片付ける」は何度送っても同じ結果 (登録が無ければ何もしない) なので、同時に 2 つのタブが同じ id を片付けても壊れない。「片付ける」は **origin に紐づく物を届く範囲で全部**消す: SW の登録は scope を問わず全部 (`getRegistrations()`)、localStorage / sessionStorage、IndexedDB (`databases()` の全部)、Cache Storage (`keys()` の全部)、OPFS (root の全 entry)、cookie (名前ごとに `Domain` 有り無しの両方で失効)。hosting の `Clear-Site-Data` (§2.1) が頁を開いた時点で同じ物を消すので、JS の側は header が効かない環境の保険。id は webui しか振らず、控えるのが先なので、台帳に無い登録が生まれるのは台帳の側が消えた時 (webui の storage の退去) だけ。それは残る物が登録レコードと数 KB の script という上限付きの残骸で、受ける
- **副経路: 閉じる時にその場で片付ける**。iframe を外す前に「片付ける」を送り、答えを待ってから外す。**台帳からは消さない** — この時点では中身がまだ生きていて、同 origin なので起動の頁に届いた nonce を読めるし、起動の頁の掃除の関数を書き換えることもできる。副経路は残骸を減らす試みで、消えたことの確認は主経路が後でやる

登録し直す道は 2 つとも無い: 頁が読み込まれただけでは登録しない (§2.1) ので掃除で開いた頁は登録せず、描いた物の SW は script の取得が hosting へ直接行って失敗する (§6 FV-Q6)。それでも「片付ける」は `getRegistrations()` の全件を外す。掃除の答えは親が `event.origin` / `event.source` でその id の頁からの物と確かめてから台帳を消す (FV-Q8 と同じ確かめ方)。台帳が webui の origin の storage に居るのは、別のブラウザで開いた分はそのブラウザの webui が掃除する、という分担にするため — 登録もブラウザごとの物なので、これで揃う。

### 2.6 権限は「親が繋がっていること」そのもの

閲覧 site は**何の権限も持たない**。持っているのはポート 1 本で、そのポートの向こうに居るのは、**その瞬間にそのセッションへ接続していて `file.read` を通せる webui の頁**。

- ポートは `postMessage` で 1 回だけ渡り、**複製できない**
- iframe を直接開いた人 (URL を人に送った、ブックマークした) にはポートが無く、SW は**何も答えられない**
- webui の頁が閉じれば、ポートの向こうが消える

**capability URL は要らない**。URL に権限を載せる形 (daemon の `sandbox_grant`) は、URL が漏れた時に権限も漏れる・失効を別に設計する必要がある・URL が history や Referer に残る、を全部引き受けることになるが、この形はそのどれも持たない。よって daemon の issue `sandbox-grant-delivery-path` は、**配信経路を実装する側ではなく、capability を撤回する側で閉じる** (撤回そのものは daemon の仕事で、この DR の範囲外)。

### 2.7 transport を知らない

ポートの向こうが何で繋がっているかを、閲覧 site も SW も**知らない**。今は WS、将来は WebRTC DataChannel かもしれないが、頼む物は常に「この sid の、この kind の、このパスの、この範囲のバイト列」で、答えはバイト列。

差し替えの時にこの DR の中で残る依存は `auth/*` (HTTP + cookie) だけで、それは**この DR の範囲外** — 認証の carrier は契約 [DR-0020](https://github.com/kawaz/ccmsg-protocol/blob/main/docs/decisions/DR-0020-auth-shape-on-the-wire.md) の持ち物で、ここで決めることではない。

### 2.8 契約に足りない物

範囲読みとバイト列は契約側で足す (契約 DR-0031)。この DR はそれを**前提として使う**だけで、形はここには複製しない。

SW は HTTP の `Range` を受けうる (動画のシークがそれ) ので、飛び飛びの範囲が頼めることが要る。

## 3. 不採用

| 採らなかったもの | なぜ |
|---|---|
| **webui の頁の中で `blob:` URL を作って描く** | 描いた HTML の script が webui と同じ出自で走る。`blob:` の出自は作った頁の出自 |
| **`sandbox` 付きの iframe に、同じ site のまま閉じ込める** | `sandbox` は出自を無くすが、**site は変わらない**。分割 cookie の単位は site なので、閉じ込めたことにならない (§1.3、契約 DR-0028) |
| **別 origin にするが、同じ site に置く** (`view.<webui>`) | 同上。origin の分離は cookie の分割の粒度より細かく、この用途では足りない |
| **閲覧 site の origin を 1 つに固定し、パスの `/view/<sid>/...` で分ける** | 描いたファイルの script は同じ origin の物を何でも見る。別セッションのパスも同じ SW が答え、storage も全ファイルで共有になる。ファイル同士の壁は origin でしか作れない (§1.3、§2.1) |
| **origin の id を sid やパスから導出する** | 同じ木のファイル同士、あるいは同じファイルの前回と今回が同じ origin になる。残す物が無い (§2.5) のだから同じ origin に戻る利点が無く、導出の規則が 1 つ増えるだけ。乱数なら何も決めなくてよい |
| **SW の登録をブラウザの回収に任せる** | Chrome は storage の逼迫時に origin 単位で退去させるだけで、使われない登録を定期的には消さない。Safari の期限付き退去は site 単位で条件付き。開くたびに origin が増える設計 (§2.1) では、開いた数だけ登録が溜まる (§2.5) |
| **閲覧 site を Public Suffix List に載せ、`ccmsg-view-*` をそれぞれ別 site にする** | `Domain=` cookie の共有も、分割 cookie の単位も、origin ごとに切れる。だが公開リストへの登録が要り、自分で立てる人にも同じ手間が乗る。Safari は cross-site iframe の cookie を遮断し、Chrome は `Clear-Site-Data` が site 全体に効くので、今は起動の頁の失効 (§2.1) で足りる |
| **登録の掃除を閉じる時だけ、または起動時だけにする** | 閉じる時だけでは、タブごと落ちた分が永久に残る。起動時だけでは、PWA は何か月も再起動しないことがあり、次の掃除がいつ来るか分からない。定期の掃除を主にして、閉じる時の掃除はその上に載せる (§2.5) |
| **instance が `/files/...` を配る** | daemon に認証付きの静的配信という責務が増える。今 HTTP で持っているのは `auth/*` だけで、その 1 点に閉じているのは意図した形 |
| **capability URL (`sandbox_grant`) を配る** | 権限が URL に載ると、漏れれば権限も漏れ、失効の設計が別に要り、history と Referer に残る。§2.6 の形はそのどれも持たない。加えて発行しても**届ける経路が無いまま**だった (daemon issue `sandbox-grant-delivery-path`) |
| **閲覧 site を別タブ / 別窓で開く** | **PWA では入口が無い**。トップレベルで別 FQDN へ出ると scope の外になり、戻る手も開く手も無くなる (§2.2)。加えてポートを渡せない — 窓越しに `postMessage` する手はあるが、親が閉じた後に生き残る窓が「まだ読めるように見えて読めない」状態を作る。§5 の制約を制約のまま受ける方が、状態が 1 つ少ない |
| **SW が自分で instance へ繋ぐ** (親を介さない) | 閲覧 site が access token か endpoint の住所を持つことになる。静的配信でしかないはずの site が秘密を持つ場所に変わり、§2.6 の「閲覧 site は何の権限も持たない」が崩れる。門番 (今開いているセッションの木の中か) を置く場所も無くなる |
| **SW がキャッシュを持つ** | 読んでいるファイルは同じ画面から編集され得る (`file.edit`)。古い中身が出る経路を作る代わりに得るのは往復 1 つで、割に合わない。消し忘れが誰の物でもない site に残る形にもなる (§2.5) |
| **`Content-Type` を instance に決めさせる** | instance の嗅ぎ分けが、閲覧 site で何が script として走るかを決めることになる。描画の性質を決める値は、描く責務を持つ側が持つ (§2.3、契約 DR-0031 §3) |
| **ポートを渡してから、同じ URL を開き直す** (入れ子にしない) | 親が別のファイルへ移ると、渡し済みのポートは向こうの端が死んだまま SW に残る。次の navigate はその死んだポートで答えようとして永久に返らない (実機で観測)。SW 側で待つのをやめる形は時間の当て推量になるので、待たなくて済む順番を入れ子で作る (§2.2) |
| **SW を使わず、親が `blob:` を作って iframe に渡す** | 相対参照が解けない。`<img src="./fig.png">` は blob の中からは引けず、**HTML 全体を書き換えて回る**ことになる。CSS の中の `url()` まで含めて書き換え切るのは、やり切れない種類の仕事 |
| **閲覧 site に webui のコードを載せる** (同じビルドを 2 か所に配る) | 閲覧 site が動く物を持つと、そこが攻撃面になる。持ち物が「頁 1 枚と SW」だけなら、読んで確かめ切れる |
| **ファイルの種類ごとに描く部品を webui 側に積む** (画像ビューア・PDF ビューア・動画プレイヤー) | ブラウザが既に持っている物を作り直すことになり、種類が増えるたびに増える。しかも HTML は結局描けない |

## 4. 帰結

- **画像・PDF・動画・HTML が見えるようになる**。Files の中身の側は「テキストとして描くか、閲覧 site に渡すか」の 2 択になる
- **ディレクトリ単位で見える**。ビルドした docs をその場で読む、といった使い方が副産物として付く (§2.4)
- webui は**描画の責務を持たない**。種類が増えても webui は増えない
- daemon は**何も増えない**。`sandbox_grant` は逆に減る (§2.6)
- 配る物が 1 つ増える。**FQDN・証明書・配信の運用がフロントに乗る** (§2.1)。wildcard の DNS と証明書、`ccmsg-view-*` のどの host にも同じ物を返す route が要る
- 閲覧中は**親の頁が生きている必要がある**。別タブに切り出せない — PWA では入口自体が無いので、これは失っている物ではない (§2.2)
- **開くたびに SW の登録という往復が 1 つ増える**。origin が毎回変わる (§2.1) ので、初回に限らない。頁 1 枚と SW の取得で、描き始めが ms 単位で遅れる
- webui が **id の台帳と掃除の仕事を持つ** (§2.5)。閲覧 site に残る物 (SW の登録、storage 全種、cookie) を無くす責務は、iframe を置いた側にある
- **同じファイルを 2 回開けば 2 回取りに行く**。キャッシュを持たないので、大きな物を何度も開く使い方は往復の数がそのまま出る (§2.5)
- 拡張子から `Content-Type` を決める表が **webui の持ち物として 1 つ増える** (§2.3)

## 5. 前提

| 前提 | 満たさない場合 |
|---|---|
| 閲覧 site が、webui とも endpoint とも **site が違う** | 満たさなければこの設計の根拠が消える (§1.3)。フロントの配置がそれを保証できないなら、閲覧の機能ごと成り立たない |
| Service Worker が登録できる | **登録できない**環境 (private browsing の一部) では閲覧が使えない — テキストの描画は今のまま残るので、失うのは増えた分だけ。登録は開くたびに新しい origin でやり直す (§2.1) ので、「登録が消えていた」という状態は無い |
| hosting が `ccmsg-view-<id>` のどの host にも同じ 2 つのファイルを返せる | wildcard の DNS と証明書、host の pattern で route を切れることが要る。固定の host しか配れないなら、描いたファイル同士の壁 (§1.3) が作れない |
| 親の頁が、閲覧中ずっと生きている | 親が消えればポートの向こうが消え、SW は答えられなくなる。**別タブに切り出す道は無い** (§3 の不採用) |
| 契約が範囲読みとバイト列を持つ (契約 DR-0031) | 持たなければ、描けるのは今も読めているテキストだけ。この DR は契約の変更に**乗っている**ので、先に契約が要る |
| webui の Service Worker が登録できる (navigation の応答に `Cross-Origin-Opener-Policy: same-origin` を足すため) | 付いていなければ、閲覧 iframe の中身が `_top` で webui の URL を指すだけで PWA の画面が乗っ取られる (§2.2)。閲覧 site の側では防げない。SW が登録できない環境では閲覧の機能ごと出さない (閲覧 site 自身も SW を要る、上の行) |
| 1 度に見ているのは 1 つの instance (DR-0004 §6) | 複数へ同時に繋ぐ形になれば、ポートは instance ごとになる。URL の `<sid>` がどの instance の物かを言う必要が出る |

## 6. 裁定の記録

2026-09-19 裁定 (FV-Q6 の script の可否、FV-Q14、FV-Q15 は 2026-09-24)。FV-Q9 だけは統括の判断で、残りは kawaz。

| | 問い | 裁定 | なぜ |
|---|---|---|---|
| FV-Q1 | ファイルをどこで描くか | **別の site を立て、静的な頁 1 枚 + SW だけを置く** | 別 origin では分割 cookie の単位を共有する (契約 DR-0028)。閉じ込めの単位は site |
| FV-Q2 | その site を誰が配るか | **proxy (hosting) が静的配信する。FQDN の管理はフロントの責務。daemon は HTTP を足さない** | daemon が HTTP で持つのは `auth/*` だけ、という今の形を保つ |
| FV-Q3 | バイト列をどう渡すか | **iframe に `MessageChannel` のポートを渡し、SW の fetch 横取りがそのポート越しに頼む** | SW が `Response` を組むので、相対参照も同じ横取りが拾う (§2.4) |
| FV-Q4 | 権限をどう表すか | **親がそのセッションに接続していて `file.read` を通せること、そのもの。capability URL は持たない** | URL に権限を載せると、漏洩・失効・履歴残りを全部引き受ける。daemon issue `sandbox-grant-delivery-path` は撤回側で閉じる (§2.6) |
| FV-Q5 | transport との関係 | **transport 非依存。WS でも DataChannel でも同じ形** | 頼む物は「バイト列」で、運び方は問わない (§2.7) |
| FV-Q10 | 見たものを残すか | **毎回使い捨て。中身は iframe を閉じれば消え、SW はキャッシュを持たない**。明示の TTL は任意 (無くてよい)。残るのは origin の storage の類で、それは webui が消す (FV-Q15) | 読んでいるファイルは同じ画面から編集され得る。中身を残さなければ古い中身は出ない (§2.5) |
| FV-Q11 | SW はどこまでやるか | **fetch が来た時点で問い合わせ、ヘッダと本文をそのまま `Response` にする**。それ以上は持たない = 普通の web サーバに見える仮想サーバ。`Content-Type` は**親頁が拡張子から**決める | ブラウザから普通の web サーバに見えれば、`<img>` も `Range` も相対参照も何も足さずに動く。型を決める場所を親に置くのは、描画の性質を描く側が持つため (§2.3) |
| FV-Q12 | 経路と、閲覧 site が持つ物 | **SW → `MessageChannel` → 親頁 (webui) → `file.read`**。SW は自分で接続を張らず、閲覧 site に access token 等の秘密を一切置かない。親頁が「今開いているセッションの木の中か」の門番 | 静的配信でしかない site に秘密を置けば、そこが守る対象になる。門番を親に置けば、権限の判断が接続を持っている側で完結する (§2.2、§2.6) |
| FV-Q9 | 大きなファイルの読み進め方 | **要求どおりの範囲だけを頼み、先読みしない**。契約の 1 回の上限を超える時だけ割って続ける | 当てが外れた先読みは、誰も見ないバイト列を運ぶ。描き心地の問題が実測で出たら、その時に別 issue として持つ (§2.3) |
| FV-Q13 | 別タブ / 別窓で開けるようにするか | **提供しない**。閲覧は常に webui の頁の中の iframe で、トップレベルの遷移を伴わない。iframe から外へ出る経路も塞ぐ | PWA ではトップレベルで別 FQDN へ出ると scope の外になり、戻れない / 開けない (§2.2) |
| FV-Q7 | 閲覧 site の FQDN をどう決め、webui はそれをどこから知るか | **ビルド時の定数**。定数が持つのは host の後半 (`<閲覧 site>` = `kawaz-….tmpspace.net` のような suffix) で、origin (`https://ccmsg-view-<id>.<suffix>`) は webui が開くたびに組む (FV-Q14) | webui を build するのは hosting で、閲覧 site を配るのも hosting。同じ場所で決まる値を 2 か所に持たない。自分で立てる人も build は必ず通る |
| FV-Q14 | 閲覧の origin を 1 つにするか、分けるか | **開くたびに乱数の id で別 origin** (`ccmsg-view-<id>.<閲覧 site>`)。何からも導出しない | 描いたファイル同士の壁は origin でしか作れない。同じ origin に戻る利点は無い (残す物が無い) ので、導出の規則を持たない (§1.3、§2.1) |
| FV-Q15 | 溜まる origin の残骸 (SW の登録、storage 全種、cookie) を誰がどう消すか | **webui が id の台帳を持ち、定期 + 起動時に見えない iframe で「片付ける」を送る掃除を主経路にする。閉じる時にその場で片付けるのは副経路**。「片付ける」は origin に紐づく物を届く範囲で全部消し、hosting の `Clear-Site-Data: "cookies", "storage"` が頁を開いた時点で同じ物を消す。閲覧側の頁は読み込まれただけでは登録しない | storage の類は origin ごとに永続し、ブラウザの回収は当てにならない。iframe を置いた側が消す。閉じる時だけでは異常終了の分が残り、起動時だけでは次がいつ来るか分からない (§2.5) |
| FV-Q8 | ポートを渡す前の相手の確かめ方 | **親は `targetOrigin` にその開きの origin (`https://ccmsg-view-<id>.<閲覧 site>`) を指定し、閲覧側の頁は `event.origin` で親が webui であることを確かめる** | 渡せる物は親自身の接続だけで実害は薄いが、確かめない理由も無い。確かめる側が 1 行で済む |
| FV-Q6 (一部) | iframe から外へ出る経路 | **`_top` は `allow-top-navigation` なしで塞ぎ、`_blank` / `window.open` は `allow-popups` で許し、webui 自身の Service Worker が navigation の応答に `Cross-Origin-Opener-Policy: same-origin` を足す** (`allow-popups-to-escape-sandbox` と `allow-top-navigation-by-user-activation` は付けない) | sandbox だけでは WebKit が `_top` を別窓に逃がし、PWA は scope 内の別窓を自分の窓として開くので画面が乗っ取られる。sandbox を継いだ別窓は COOP 付きの文書を読み込めないので、webui の頁に COOP を付ければその経路が全部エラーになる。SW が足した COOP も同じに効く (実測、§2.2)。meta では付けられないので hosting か SW で、build に閉じる SW を取る。外部リンクはアプリ内ブラウザで開いて閉じれば戻る |
| FV-C1 | iOS / iPadOS の PWA で `_blank` / `window.open` がどう動くか | **外部への別窓はアプリ内ブラウザで開き、閉じれば戻る。同期でも 500ms 後でも同じ。scope 内の URL の別窓は PWA の窓そのものとして開く** (2026-09-24 実測、iPad と iPhone) | 後者が乗っ取りの経路で、FV-Q6 の COOP がそれを塞ぐ。実験頁は `test/manual/pwa-popups/` |
| FV-Q6 (script) | 閲覧 site の CSP で **script を許すか** | **許す**。描いた物の CSP は `script-src 'self' 'unsafe-inline'` で、`default-src 'self'` 相当に絞る。`worker-src` は `'self'` で、描いた物の Worker は動く。描いた物が自分の script を SW として登録することは構造上できない — SW の script の取得は他の SW を通らず (仕様)、hosting へ直接行って `/view/...` が無いので失敗する。hosting にある閲覧 site 自身の `/sw.js` は登録できるが、同じ scope なら既存の登録が返るだけ、深い scope なら同じコードの別インスタンスがポート無しで立ち (ポートは登録ごとに最初の 1 回、§2.2)、その配下の fetch は断りになる — 権限は増えず自分の配下を壊すだけ。登録できた SW の `fetch()` は親のポートに届かず、自分のアプリの資源を取れない。SW が無いと成立しないアプリはプレビューできず、それは §2.6 の閉じ込めの裏面として受ける | 閉じ込めは site の分離 (§1.3) + トップレベル遷移不可 (§2.2) + バイト列が親経由でしか届かないこと (§2.6) で効いていて、script を止めても閉じ込めは強くならない。許せばビルドした docs や図が動く形で見える (= この機能の値打ちの一部) |

## 7. 関連

- [DR-0004](DR-0004-one-state-machine-decides-what-the-screen-is.md) — 画面ぜんぶの姿。閲覧が立てるのは `live` / `stale` だけ
- [DR-0003](DR-0003-an-action-is-what-a-key-and-a-button-both-reach.md) — 操作の器。閲覧の開閉がアクションになる時の置き場
- 契約 `docs/decisions/DR-0031-file-read-answers-bytes-in-ranges.md` — この DR が乗っている契約の変更
- 契約 [DR-0028](https://github.com/kawaz/ccmsg-protocol/blob/main/docs/decisions/DR-0028-refresh-cookie-across-sites.md) — 分割 cookie の単位が site であること。§1.3 の根拠
- 契約 [DR-0020](https://github.com/kawaz/ccmsg-protocol/blob/main/docs/decisions/DR-0020-auth-shape-on-the-wire.md) — `auth/*` が HTTP に居ること。transport を差し替えても残る依存 (§2.7)
- daemon `docs/issue/2026-09-09-sandbox-grant-delivery-path.md` — §2.6 が撤回側で閉じると判断した相手
- `src/ui/Files.tsx` — 今の Files。中身の側がここに 1 択を足す
