/** 打鍵から「送る / 改行する / 何もしない」を決める、DOM を持たない判定。
 *
 * 送信は Enter。⌘Enter (Windows/Linux では Ctrl+Enter) も送信で、下書きが
 * 複数行になったあとも手が同じ形のまま送れる。Shift+Enter は改行 — 段落を
 * 書いてから送りたいときの逃げ道で、これが無いと 1 行しか書けない画面になる。
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
  if (event.shiftKey) return "newline";
  return "send";
}
