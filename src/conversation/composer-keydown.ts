/** 打鍵から「送る / 改行する / 何もしない」を決める、DOM を持たない判定。
 *
 * **Enter は改行**。書いている途中の改行は打った通りに入るのが当たり前で、
 * 手のひらのソフトキーボードでは特にそう — Enter が送信だと、段落を分ける手が
 * そのまま送信になる。送るのは ⌘Enter (Windows/Linux では Ctrl+Enter) と送信
 * ボタンで、送るという意思をもう一方の手が言う形にしてある。
 *
 * IME の変換確定中 (`isComposing`) は打鍵が確定の Enter なので何もしない。 */

export interface ComposerKey {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly isComposing: boolean;
}

export type ComposerAction = "send" | "newline" | "ignore";

export function composerAction(event: ComposerKey): ComposerAction {
  if (event.key !== "Enter") return "ignore";
  if (event.isComposing) return "ignore";
  if (event.altKey) return "ignore";
  return event.metaKey || event.ctrlKey ? "send" : "newline";
}
