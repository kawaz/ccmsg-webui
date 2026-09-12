import type { Bucket } from "../llm/stats-view.ts";
import { usdWords } from "../llm/stats-view.ts";

/** 束ごとの費用を、model で積んだ棒で。
 *
 * 手書きの SVG にしてあるのは、描くものが「棒と、その中の区切り」しか無いから
 * — 図の library を 1 つ入れるより、読む人が見る形をそのまま書く方が小さい。
 *
 * 高さは**その画面でいちばん高い束**を基準にする。絶対額で固定すると、安い週が
 * 潰れて読めなくなる (比べたいのは束の間の差)。 */

const HEIGHT = 90;
const GAP = 2;

export function SpendChart({
  rows,
  models,
}: {
  rows: readonly Bucket[];
  models: readonly string[];
}) {
  // 古い方が左。読みは右肩 (直近) で終わるので、並びは時間の向きに合わせる。
  const bars = [...rows].reverse();
  const top = Math.max(...bars.map((row) => row.usd), 0);
  if (bars.length === 0 || top <= 0) return null;
  const slot = 100 / bars.length;
  const width = Math.max(slot - 0.6, 0.4);
  return (
    <svg
      class="spend-chart"
      viewBox={`0 0 100 ${String(HEIGHT)}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="束ごとの費用"
    >
      {bars.map((row, index) => {
        let y = HEIGHT;
        return (
          <g key={row.key}>
            <title>{`${row.key} ${usdWords(row.usd)}`}</title>
            {row.models.map((part) => {
              const height = (part.usd / top) * (HEIGHT - GAP);
              y -= height;
              const at = models.indexOf(part.model);
              return (
                <rect
                  key={part.model}
                  class={`spend-part tone-${String(at < 0 ? 0 : at % 6)}`}
                  x={index * slot}
                  y={y}
                  width={width}
                  height={Math.max(height, 0)}
                />
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
