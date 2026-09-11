import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { reading, runTranslate } from "../state.ts";
import { needsNoTranslation, translateText, translatedSoFar } from "./translate.ts";
import { browserRoute, hostRoute } from "./translators.ts";

/** 今の設定でこの本文をどう出すか。
 *
 * 訳が走るのは**この item が描かれている間だけ**。窓が描く範囲の外に出た item は
 * component ごと消えるので、遡って読んでいない何百もの item を訳しに行くことは
 * ない。届いた段落から書き換わり、まだ届いていない段落は原文のまま出る。 */
export interface Reading {
  readonly text: string;
  /** まだ届いていない段落がある。 */
  readonly pending: boolean;
}

export function useTranslated(text: string): Reading {
  const route = reading.value;
  const shown = useSignal<string | undefined>(undefined);
  const pending = useSignal(false);

  useEffect(() => {
    if (route === "original" || needsNoTranslation(text)) {
      shown.value = undefined;
      pending.value = false;
      return;
    }
    // 覚えている分を先に出す。同じ段落を読み直すたびに訳し直さない。
    shown.value = translatedSoFar(route, text);
    pending.value = true;
    let live = true;
    const translator = route === "host" ? hostRoute(runTranslate) : browserRoute;
    void translateText(translator, text, (partial) => {
      if (live) shown.value = partial;
    })
      .then((whole) => {
        if (live) shown.value = whole;
      })
      .finally(() => {
        if (live) pending.value = false;
      });
    return () => {
      live = false;
    };
  }, [route, text, shown, pending]);

  return {
    text: shown.value ?? text,
    pending: pending.value && shown.value !== text,
  };
}
