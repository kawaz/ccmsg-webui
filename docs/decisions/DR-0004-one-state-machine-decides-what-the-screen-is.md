# DR-0004: 画面ぜんぶの姿は 1 つの状態機械が決める

Status: Proposed
Date: 2026-09-17

ここに書くのは**なぜそう決めたか / 何を捨てたか**。操作の器は [DR-0003](DR-0003-an-action-is-what-a-key-and-a-button-both-reach.md)、設定の器は [DR-0002](DR-0002-settings-are-sections-tried-before-they-are-kept.md)、色は [DR-0001](DR-0001-colour-is-computed-from-a-few-inputs.md)。

§7 に**裁定待ちの問い**がある。それが解けるまで実装に着手しない。

## 1. 背景

### 1.1 今、姿はどう決まっているか

画面ぜんぶのうちどの姿で立つかを決めているのは `App.tsx` の 5 つの `if` で、上から順に読まれる。

```
1. registration !== undefined   → 登録の画面 (バー無し)
2. route.at === "settings"      → 設定の画面 (バー無し)
3. needsSignIn                  → バー + 認証の画面
4. !listed                      → バー + 本文なし (言葉があれば言葉だけ)
5. それ以外                      → バー + workspace (Shell)
```

読まれている 5 つは互いを知らない独立した signal で、書く所も別々にある。

| 読むもの | 型 | 置き場 | 書く所 |
|---|---|---|---|
| `registration` | `Registration \| undefined` | `state.ts` | 登録 URL の fragment が届いた時 / 登録が済んだ時 |
| `route` | `Route` | `state.ts` | URL |
| `needsSignIn` | `boolean` | `auth/session.ts` | `signIn` の失敗、`authRequired` |
| `listed` | `boolean` | `state.ts` | `peers` の snapshot が届いた時、`disconnect` |
| — (姿には出てこない) | | | |
| `wanted` | `boolean` | `state.ts` | 人が接続 / 切断を押した時、`resume` |
| `status` | `ConnectionStatus` | `state.ts` | `Connection` が socket の各段で |
| `generationWarning` | `string \| undefined` | `state.ts` | `generationMismatch` |
| `needsRegistration` | `boolean` | `auth/session.ts` | `signIn` が declined で返った時 |

### 1.2 何が起きているか

**姿の組み合わせを点検する場所が無い**。5 つの `if` の順番が、書いた人の意図ではなく副作用として裁定を作っている。

- `registration !== undefined` が最初なので、**接続後に登録 URL を開くと workspace ごと消える**。読んでいた transcript は裏に残っているが、画面には登録の用紙しか出ない。
- `route.at === "settings"` が `needsSignIn` より先なので、**未認証のまま設定に入れる**。issue の裁定 (「設定は接続後のみ」) と食い違っているが、食い違っていることがコードのどこにも出ていない。
- 設定と登録では帯ごと画面が置き換わる。これは DR-0003 §2.2 が既に食い違いとして記録している。

**同じ状態の見せ方が 2 か所にある**。契約の世代の食い違い (`generationWarning`) は `Disconnected.tsx` と `Shell.tsx` の両方に同じ文言が書かれている。姿を決める `if` には出てこないので、「この画面はもう使えない」という**戻り道の無い状態**が、姿としてはどこにも無い。

**「繋がっているか」が 4 つに散っている**。`wanted` (人の意図) / `status` (socket が今していること) / `listed` (一度でも聞いたか) / `hello` (名乗りを受け取ったか) のどれ 1 つも、単独では「今どの姿で立つか」を言えない。組み合わせの意味は `App.tsx`・`Stale`・`ConnectionBar` に分かれて書かれている。

### 1.3 これから触るものが全部この上に乗る

- 接続バーの作り直し ([issue](../issue/2026-09-17-connection-bar-is-not-a-header-after-connect.md)) は「接続前は主役、接続後は小部品」を言う。**どこからが接続後か**を言う場所が要る。
- 設定は接続後のみ。同上。
- 登録 → 認証 → 接続の流れは今 3 つの signal に分かれている。
- DR-0003 のスコープの木の根は「未接続」と「接続後」で、**根がどちらに立つかは今どこにも書いていない**。
- 契約世代のずれ・再接続・世代の食い違いの後始末。

[daemon リポの research](https://github.com/kawaz/ccmsg/blob/main/docs/research/2026-09-17-vlmkit-and-agent-ui-article.md) が「記事の処方のうち ccmsg-webui に無い唯一の骨格」として名指したのがこれ。ccmsg-webui は Passive View も Root を頂点とする木も内から外へのバブルも既に持っていて (DR-0003)、持っていないのは**全体の状態と遷移を一望する 1 枚**だけ。

## 2. 決定

### 2.1 姿は 1 つの値で、`phase` と綴る

画面ぜんぶのうちどの姿で立つかは、`src/phase.ts` の `phase` 1 本が答える。値は 8 つ。

| 値 | 何か | 木の根 (DR-0003 §2.2) |
|---|---|---|
| `offline` | 住所を述べる所があり、繋いでいない | 未接続 |
| `registering` | 登録 URL を開いた | 未接続 |
| `authenticating` | passkey を求める所に居る | 未接続 |
| `connecting` | socket を開けている (名乗りの途中も含む) | 未接続 |
| `receiving` | socket は開いた、一覧の snapshot がまだ | 未接続 |
| `live` | 一覧があり、話し相手が居る | 接続後 |
| `stale` | 一覧があり、話し相手が居ない | 接続後 |
| `outdated` | 契約の世代が食い違う。再読み込みしか道が無い | どちらでもない (終端) |

**「未接続」は「一覧がまだ立っていない」の意**。socket が開いている `receiving` も未接続に入る — 根が分けているのは回線の有無ではなく**画面に本体が立っているか**で、DR-0003 §2.2 が未接続の子に「一覧を聞く前 (Disconnected)」を置いているのと同じ線。

**`stale` を `live` と分けるのは、出ている行がいつのものかが違うから**。切れただけの端末から画面まで消さないのがこの画面の方針 (`state.ts` の `status`) なので、`stale` でも本体は出たままで、古いことを帯が言う。

**切断中と再接続中は分けない**。姿が同じ (本体 + 帯) で、帯の中の語は `status` が既に答えている (`closed` なら「切断中」、`connecting` なら「接続し直しています…」)。既存フィールドが答えられる問いには何も足さない。

**住所が無い状態 (`endpoint === undefined`) を分けない**。姿は `offline` と同じ (バーがあり、本体が無い) で、違うのは接続のアクションが今できるかだけ。それは `endpoint` を読めば言えるので、姿を割る理由が無い。

### 2.2 `phase` は導出であって、代入されるものではない

`phase` は `computed` で、既存の signal から導く。

```
outdated      generationWarning !== undefined
registering   registration !== undefined
authenticating needsSignIn
live          listed かつ status === "open"
stale         listed
receiving     status === "open" または "greeting"
connecting    wanted
offline       それ以外
```

遷移を `send` で起こして `phase` に代入する形にはしない。**引き金はどれも既存の signal の変化そのもの**なので、代入すると同じ事実が 2 か所に住むことになり、片方だけが古くなる余地ができる。`computed` なら定義が 1 つで、遷移表 (§2.3) は**この式の読み方**になる。

上の並びは**上から順に読む**。これは §1.2 が問題にした「順番が裁定を作る」形と同じに見えるが、違うのは**順番そのものが裁定として 1 か所に書いてある**ことで、§2.3 の遷移表と §2.4 の姿の表がその裁定を点検できる形にしている。順番に意味があるのは 3 つだけ:

- `outdated` が最初 — 戻り道が無いので、他の何が真でも先に効く。
- `registering` が `live` より先か後かは裁定待ち (§7 Q3)。上の並びは今の挙動 (先) をそのまま写しただけで、決めたものではない。
- `live` / `stale` が `receiving` / `connecting` より先 — 一度聞いた一覧があるなら、回線が今どうであれ本体は立つ。

### 2.3 遷移は 1 つの表に書く

「何が起きたら移るか」を 1 枚にする。左の列が今の姿、真ん中が起きたこと、右が次の姿。**空欄が見落とし**として読める形にすることが表の目的で、網羅していることに価値がある。

| 今 | 起きたこと | 次 |
|---|---|---|
| (読み込み) | fragment に登録 URL がある | `registering` |
| (読み込み) | refresh cookie で session が取れた (`resume`) | `connecting` |
| (読み込み) | session が無い | `offline` |
| どれでも | 登録 URL の fragment が届いた (`hashchange`) | `registering` (§7 Q3) |
| どれでも | 契約の世代が食い違った (`generationMismatch`) | `outdated` |
| `offline` | 接続を押し、session を持っていた | `connecting` |
| `offline` | 接続を押し、session が無かった | `authenticating` |
| `offline` | 住所を述べ直した | `offline` |
| `registering` | 登録が済んだ (`completeRegistration`) | `connecting` |
| `registering` | やめた (`dismissRegistration`) | `resume` の答え (`connecting` か `offline`) |
| `registering` | この画面では登録できない URL だった | `offline` (言葉を添える) |
| `authenticating` | passkey が通った | `connecting` |
| `authenticating` | passkey を断られた (declined) | `authenticating` (登録の案内を添える) |
| `authenticating` | それ以外の失敗 | `authenticating` (instance の言葉を添える) |
| `connecting` | socket が開き、名乗りが通った | `receiving` |
| `connecting` | 提示するものが無かった (`authRequired`) | `authenticating` |
| `connecting` | 届かない / 拒まれた | `connecting` (退がりながら再試行) |
| `receiving` | `peers` の snapshot が届いた | `live` |
| `receiving` | socket が閉じた | `connecting` (一覧をまだ持っていないので `stale` にはならない) |
| `receiving` | `authRequired` | `authenticating` |
| `live` | socket が閉じた | `stale` |
| `stale` | socket が開き直り、snapshot が届いた | `live` |
| `stale` | `authRequired` | `authenticating` |
| `live` / `stale` | 人が切断を押した (`disconnect`) | `offline` |
| `live` / `stale` | 人が住所を述べ直した (`setEndpoint`) | `offline` |
| `outdated` | — | 終端。再読み込みで最初から |

`authRequired` がどの姿からでも `authenticating` へ行くのは、**持っていた許可が向こうで切れた**という 1 つの事実だからで、それが起きた時にこの画面にできることは 1 つしかない。

### 2.4 姿ごとに、何が見えるか

接続バーと設定の置き場は issue の裁定 (接続前の主役 / 接続後の小部品、設定は接続後のみ) をそのまま姿の列に割ったもの。

| 姿 | 接続バー | 本文 | 帯 | 設定 |
|---|---|---|---|---|
| `offline` | 主役 (住所 + 接続) | 無し (言葉があれば言葉だけ) | — | 入れない (§7 Q1) |
| `registering` | 主役 | 登録の用紙 | — | 入れない |
| `authenticating` | 主役 (語は無し) | passkey の画面 | — | 入れない |
| `connecting` | 主役 (語は「接続中」/「hello 送信中」) | 無し | — | 入れない |
| `receiving` | 主役 (語は「接続済み」) | 無し | — | 入れない |
| `live` | 小部品 (状態のアイコン + 極小の住所) | workspace | — | 入れる |
| `stale` | 小部品 | workspace (最後に聞いた内容) | 古いことを言う帯 + 接続 | 入れる |
| `outdated` | 小部品 | 再読み込みの案内だけ (§7 Q2) | — | 入れない |

**詳しい接続の情報 (instance、契約の版、token の期限、credential の webui、誰として繋がっているか) は帯の役目ではない**。接続後のグローバルな状態の画面と、セッションの状態の画面に置く。バーが持つのは「今どうなっているか」を 1 つの印で言うことだけ。

### 2.5 姿ごとに、何ができるか

DR-0003 の木の根がどちらに立つかは `phase` が答える。根が立てば、その下の節は木の形どおりに立つ。

| 姿 | 立つ根 | できること |
|---|---|---|
| `offline` | 未接続 | 住所を述べる / 接続を始める (住所がある時) |
| `registering` | 未接続 > 登録 | 登録する (6 桁が揃った時) / やめる |
| `authenticating` | 未接続 > 認証 | passkey で認証する (= 接続を始めるのと同じアクション) |
| `connecting` | 未接続 | 住所を述べる (述べ直せば `offline` へ) |
| `receiving` | 未接続 | 同上 |
| `live` | 接続後 | workspace のすべて / 設定 / 接続を止める |
| `stale` | 接続後 | 読むことはできる。instance に頼むもの (送る・終了・開く) は断られる |
| `outdated` | 無し | 再読み込みだけ |

**`stale` で 1 つ 1 つの操作が断られる判定は、この状態機械に吸収しない**。`phase` が答えるのは姿と根であって、個々のアクションの「できるか」は今どおりアクション側が持つ (DR-0003 §2.1) — 断り方は操作ごとに違う (送れない理由を言う `messageSendRefusal` と、単に押せなくなるものは同じではない)。

### 2.6 吸収されるもの、残るもの

| 今あるもの | どうなるか |
|---|---|
| `registration` | 残る。中身 (誰を・どの instance に登録するか) は登録の画面が読む。**姿を決めるためには読まれなくなる** |
| `needsSignIn` | `phase` に吸収。`authenticating` であることと同義になるので、signal としては消える |
| `needsRegistration` | 残る。`authenticating` の中で「登録の案内を添えるか」を言う従属フィールド |
| `listed` | 残る。`live` / `stale` と `receiving` を分ける導出元 |
| `status` | 残る。socket が今していること。主語が違う (socket の話で、画面の話ではない) |
| `wanted` | 残る。人の意図。`offline` と `connecting` を分ける導出元 |
| `generationWarning` | 残る。`outdated` の導出元であり、人に見せる言葉そのもの |
| `terminalsListed` / `listSettled` | 残る。姿ではなく**中身が揃ったか**の話 (空の一覧を出さないため、`data-settled` のため) |
| `hello` / `subject` / `connectionExpiresAt` / `statusDetail` | 残る。接続後の詳しい情報の中身 |
| `endpoint` | 残る。人が述べる住所。どの未接続の姿でも編集できる |
| `route` | 残る。**接続後のどの画面か**だけを言う。`settings` が姿を横取りすることはなくなる (§7 Q4) |

### 2.7 `App.tsx` は姿を読んで選ぶだけ

```
switch (phase.value) { ... }
```

**`App.tsx` 以外は `listed` / `registration` / `status` を読んで姿を決めない**。読んでよいのは中身を出す側 (帯が `status` を読んで語を選ぶ、一覧が `listSettled` を読んで空かどうかを言う) だけ。

これを文章の禁止だけにしない。**`src/ui/` のうち `App.tsx` 以外が姿を決める signal を import していないことを検査する test を置く** — この設計の核は「姿を決める場所が 1 つ」という**持たない**形をしているので、2 か所目を足す変更は局所的には改善に見え、文章では止まらない。

## 3. 名前

`phase` と綴るのは、**答えるのが「今どの段に居るか」だから**。8 つのうち 6 つは登録 → 認証 → 接続 → 受け取りの段で、`live` / `stale` も「一覧を得た後のどちらの段か」と読める。

## 4. 不採用

| 採らなかったもの | なぜ |
|---|---|
| **今の `if` の並びのまま** | 姿を決める条件が 5 つの独立した signal の優先順に散り、組み合わせの正当性を点検する場所が無い。登録が workspace を隠すことも、設定が認証より先に効くことも、意図した裁定ではなく順番の副作用 (§1.2) |
| **画面ごとに状態を持つ** | 世代の食い違いが `Disconnected` と `Shell` の 2 か所に同じ文言で書かれている今の形がその帰結。同じ状態の見せ方が 2 か所に分かれると、片方だけが古くなる |
| **XState 等の状態機械ライブラリ** | ライブラリが解く問題 (階層状態、並行領域、遅延イベント、actor 間の通信) が、この 8 状態では起きていない。導入すると遷移が「既存 signal の変化を見て `send` を呼ぶ層」になり、既に signal が持っている引き金を二重に持つ。`computed` 1 本で足りる所に、走る仕組みを増やす理由が無い |
| **`phase` を `signal` にして遷移で代入する** | 引き金はどれも既存 signal の変化なので、代入すると同じ事実が 2 か所に住む。遷移を書き忘れた経路では姿が固まったまま動かなくなり、しかもその失敗は画面を見るまで分からない (§2.2) |
| **`ConnectionStatus` に値を足して 1 つの enum にする** | socket が今していることと、画面が今どの姿かは主語が違う。`connection.ts` は契約と socket だけを知っていて、一覧を受け取ったかも登録 URL が来たかも知らないし、知るべきでない |
| **切断中と再接続中を別の姿にする** | 姿が同じ (本体 + 帯) で、違うのは帯の中の語だけ。それは `status` が既に答えている。姿を割ると、同じ見た目を 2 つの値が指すことになる |
| **住所の無い状態を別の姿にする** | 姿は `offline` と同じで、違うのは接続のアクションが今できるかだけ。それは `endpoint` を読めば言える |
| **`stale` で本体を消す (接続が切れたら画面も空にする)** | 電波の悪い所を歩いた人の画面が毎回空になる。持ち歩いて読む道具としては失いすぎで、最後に聞いた内容には次の snapshot まで読む価値がある (`state.ts` の `status`) |
| **綴りを `screen` にする** | `route` と紛らわしい。`settings` は URL が名指す所であって姿ではないのに、`screen` と綴ると同じ種類のものに見える |
| **綴りを `appState` にする** | 何を答える値なのかが読めない。`app` も `state` もこの画面では何にでも付く語 |
| **綴りを `standing` にする** | `runs.ts` の `runStanding` (run の立ち位置) と衝突する。同じ語が 2 つの別のものを指す |

## 5. 帰結

- `App.tsx` が `switch` 1 つになり、姿の一覧が読んで分かる。
- DR-0003 の木の根が `phase` を読むので、**木と姿がずれない**。根が立つ条件を木の側で別に決める必要が無い。
- 接続バーの作り直しが「`live` / `stale` では小部品」という 1 行の判断になる。設定が接続後のみ、も 1 か所で言える。
- 世代の食い違いが**姿として 1 つある**ので、2 か所に同じ文言を書かなくなる。
- 新しい姿を足す時の設計作業が「遷移表に行を足す」になり、**見落としが表の空欄として見える**。今は見落としがどこにも現れない。
- `needsSignIn` が消える。認証の画面が立っていることと「認証が要る」が別の値だったのをやめる。
- 逆に、**`phase` を読まずに `status` / `listed` を直接読む画面が 1 つでも残ると効き目が薄れる**。§2.7 の test がその歯止めで、この DR で唯一の「増やさない」の形をした核。
- 状態が 8 つに収まっているのは今の画面がそうだからで、姿が増えれば表も増える。表が 20 行を超えたら、それは軸が 2 つ混ざっている合図として読む (`design-spec/state-modeling` 8)。

## 6. 前提

| 前提 | 満たさない場合 |
|---|---|
| 姿を決める引き金が、すべて既に signal として在る | 在らないものが出たら `phase` の導出に足す。足せないもの (DOM に聞かないと分からない類) が出たら、`computed` を諦めるのではなく**その事実を signal にする所**から考える (DR-0003 §2.2 の「判定源はアプリ側の状態」と同じ線) |
| 一度に立つ姿は 1 つ | 2 つ同時に立てたくなったら、片方は姿ではなく**姿に重なるもの** (帯・トースト・ダイアログ) で、そちらは DR-0003 の木の節として持つ |
| 接続先は 1 つ | 複数 instance へ同時に繋ぐ形になれば `phase` は instance ごとの値になり、画面ぜんぶの姿はその集約になる。今は mesh の向こう側を 1 つの instance 越しに見る形なので、繋いでいる先は 1 つ |

## 7. 未決 (要裁定)

裁定が無いと実装に着手できないもの。

| | 問い | 何が対立しているか |
|---|---|---|
| Q1 | **未接続で設定に入れるか** | DR-0003 §2.2 は「言語と light / dark の切替は未接続の子」と書く (繋がらない instance を前にした人が真っ白な画面のまま dark に変えられないのはおかしい、DR-0001 §2.6)。issue の裁定は「設定は接続後のみ (置くとしても言語と light / dark の切替程度)」。**未接続に小さい設定を置く**のか、**まったく入れない**のかで §2.4 の設定の列が変わる |
| Q2 | **`outdated` は後ろにあるものを隠すか** | 隠す (再読み込みの案内だけ) なら、読んでいた transcript が読めなくなる。隠さない (帯だけ出して本体は残す) なら、押せる所が全部効かない画面を触らせることになる。今の実装は帯を出して本体も残す形と、本体を描かない形が姿によって分かれている |
| Q3 | **接続後に登録 URL を開いたら何が起きるか** | 今は `registering` が `live` を隠す。隠さない (知らせだけ出して人が選ぶ) 案もある — 登録 URL は別の instance のものかもしれず、今読んでいるものを黙って隠すのは強い。§2.2 の並びと §2.3 の「どれでも」の行がこれで変わる |
| Q4 | **接続後のみの画面に未接続で来たら、URL はどうなるか** | `/settings` を未接続で開いた時 (Q1 が「入れない」なら)、`/` へ書き換えるのか、URL はそのままで姿だけ未接続のものにするのか。後者なら繋がった瞬間に設定が開く。リンクを受け取った人の体験が変わる |

## 8. 関連

- [DR-0003](DR-0003-an-action-is-what-a-key-and-a-button-both-reach.md) — スコープの木。根 (未接続 / 接続後) がどちらに立つかを `phase` が答える (§2.5)
- [DR-0002](DR-0002-settings-are-sections-tried-before-they-are-kept.md) — 設定の器。設定へ入れる姿を §2.4 が決める
- [DR-0001](DR-0001-colour-is-computed-from-a-few-inputs.md) — 色。設定が instance に何も聞かないこと (§2.6) が Q1 の一方の根拠
- [docs/issue/2026-09-17-connection-bar-is-not-a-header-after-connect.md](../issue/2026-09-17-connection-bar-is-not-a-header-after-connect.md) — 接続バーと設定の置き場の裁定。§2.4 はこれを姿の列に割ったもの
- [daemon リポ docs/research/2026-09-17-vlmkit-and-agent-ui-article.md](https://github.com/kawaz/ccmsg/blob/main/docs/research/2026-09-17-vlmkit-and-agent-ui-article.md) — この DR の発端。「画面全体の状態機械」が ccmsg-webui に無い唯一の骨格だと名指した所
- [DESIGN-ja.md](../DESIGN-ja.md) — 今の姿。この DR が実装されたら、姿の一覧はそちらへ移る
