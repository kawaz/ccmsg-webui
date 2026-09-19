/** アクション = 名前を持ち、今できるかを自分で言う 1 つの操作 (DR-0003 §2.1)。
 *
 * ここにあるのは **id と題と印**だけで、実装は 1 つも無い。実装 (「できるか」と
 * 「実行」) はスコープの側が名乗り出て持つ — 同じ id を場所ごとに別の担当が
 * 持てることが、人が「次へ」1 語で済むことの中身そのものだから (§2.3)。
 *
 * この一覧が**人の見る唯一のアクション一覧**になる。キーの設定に並ぶのはここの
 * 題で、押す所のラベルも `title` も同じものを読む — 別々に書くと、片方だけが
 * 古くなる先が生まれる。 */

/** id の綴りは**スコープの綴り + 操作の綴り**。どのスコープが担当するかが id を
 * 読んだだけで分かる (§2.1)。 */
export interface Action {
  readonly id: string;
  /** 人に見せる語。 */
  readonly title: string;
  /** 取り返しがつかないもの。**無効な時に上へ流さずそこで止まり** (§2.3)、
   * 呼ばれたら確認を開くまでが責務になる (§2.8)。
   *
   * 印で括るのは止めたい理由が 1 つだから — 終了・強制終了・削除は「間違って
   * 起きると取り返しがつかない」という同じ性質で止めたい。 */
  readonly destructive?: true;
}

/** 今この画面にあるアクションぜんぶ。並びは DR-0003 §2.2 の木の順。 */
export const ACTIONS: readonly Action[] = [
  // 画面ぜんぶ。読み込み直しはどの姿にも居り、残る 2 つは接続後だけ
  // (DR-0004 §2.5)。
  { id: "app.reload", title: "読み込み直す" },
  { id: "app.connect", title: "接続する" },
  { id: "app.disconnect", title: "切断する" },
  { id: "app.sign-out", title: "ログアウトする", destructive: true },

  // 他の画面への道。押す所は今も各画面の中に散っているが、**担当は木の上の
  // 1 か所に集まる** (付録 A) — どこから起こしても同じ所に着く。
  { id: "app.open-sessions", title: "セッションの一覧へ" },
  { id: "app.open-terminals", title: "端末の一覧へ" },
  { id: "app.open-parent-session", title: "親のセッションに戻る" },
  { id: "app.open-usage", title: "使用量とクオータを開く" },
  { id: "app.open-settings", title: "設定を開く" },

  // メインコンテンツ
  { id: "main.prev-tab", title: "前の見方へ" },
  { id: "main.next-tab", title: "次の見方へ" },

  // 端末。行が自分の端末を対象に担当するので、綴りは木の節を指していない
  // (一覧の行からも端末の一覧からも同じ 1 つを起こす)。
  { id: "terminal.open", title: "端末を開く" },

  // 区画をまたぐ移動 (workspace が担当)。押す所を持たない — 押す所を作ると、
  // 押した時点でそこがフォーカスを持ってしまい、目的の「手を離さず辿る」が
  // 消える (§2.4)。
  { id: "workspace.focus-sidebar", title: "サイドバーへ移る" },
  { id: "workspace.focus-main", title: "メインコンテンツへ移る" },
  { id: "workspace.toggle-sidebar", title: "サイドバーを出す / しまう" },

  // セッションリスト
  { id: "session-list.select-prev", title: "前へ (一覧)" },
  { id: "session-list.select-next", title: "次へ (一覧)" },
  { id: "session-list.collapse", title: "セクションを閉じる" },
  { id: "session-list.expand", title: "セクションを開く / セッションを開く" },
  { id: "session-list.open", title: "セッションを開く" },
  { id: "session-list.open-search", title: "クイックフィルタを開く" },
  { id: "session-list.rename", title: "セッションを改名する" },
  { id: "session-list.pin", title: "一覧の先頭に留める / やめる" },
  { id: "session-list.new", title: "新しいセッションを始める" },
  { id: "session-list.kill", title: "セッションを終了する", destructive: true },
  { id: "session-list.kill-force", title: "セッションを強制終了する", destructive: true },
  { id: "session-list.forget", title: "失われたセッションを削除する", destructive: true },

  // tl 本体 / 選択中のメッセージ
  { id: "timeline.select-message", title: "メッセージを選ぶ" },
  { id: "timeline.select-prev", title: "前へ (transcript)" },
  { id: "timeline.select-next", title: "次へ (transcript)" },
  { id: "timeline.page-up", title: "1 画面戻る (transcript)" },
  { id: "timeline.page-down", title: "1 画面進む (transcript)" },
  { id: "timeline.open-search", title: "この transcript の中を探す" },
  { id: "timeline.select-prev-in-voice", title: "同じ声の前へ" },
  { id: "timeline.select-next-in-voice", title: "同じ声の次へ" },

  // files。木と本文は別々の節なので、同じ上下でも届く先が違う (§2.2)。
  { id: "files.open", title: "ファイルを開く" },

  // 文書の畳み。**綴りが木の節を指していない**のは検索と同じ理由で、これが
  // files プレビューと tl 本体の 2 か所に立つ区画の役だから (付録 A)。
  { id: "document.open-all-sections", title: "文書の全セクションを開く" },
  { id: "document.close-all-sections", title: "文書の全セクションを閉じる" },

  // 検索 (窓が開いている間)
  { id: "search.prev-match", title: "前の一致へ" },
  { id: "search.next-match", title: "次の一致へ" },
  { id: "search.close", title: "検索をやめる" },
];

const BY_ID = new Map(ACTIONS.map((one) => [one.id, one]));

export function actionOf(id: string): Action | undefined {
  return BY_ID.get(id);
}

/** その id が印付きか。**知らない id は印無し扱い** — 設定に残っている古い行が
 * 「止まる」側に倒れると、なぜ何も起きないのかを人が読み解けない。 */
export function isDestructive(id: string): boolean {
  return BY_ID.get(id)?.destructive === true;
}
