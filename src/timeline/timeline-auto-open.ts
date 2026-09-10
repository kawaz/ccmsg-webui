import { itemCategory, type ItemRow } from "./items.ts";

export interface TimelineAutoOpenSettings {
  thinking: boolean;
  ccmsg: boolean;
  agent: boolean;
  items: boolean;
}

/** TL (親) は自セッション主体の会話 + 他セッション ccmsg も主要文脈なので
 * C=true。thinking も自セッションの思考過程として T=true。agent 通信は自身の
 * subagent 呼出の詳細なので既定は畳む。agent TL (drilldown) では逆に peer/
 * agent 通信軸を主にするため T/C を閉じ、A/items を開く (agent 通信の詳細を
 * 一目で追える方が用途に合う)。 */
export function defaultTimelineAutoOpen(agentTimeline: boolean): TimelineAutoOpenSettings {
  return agentTimeline
    ? { thinking: false, ccmsg: false, agent: true, items: true }
    : { thinking: true, ccmsg: true, agent: false, items: false };
}

export function toggleTimelineAutoOpen(
  settings: TimelineAutoOpenSettings,
  key: keyof TimelineAutoOpenSettings,
): TimelineAutoOpenSettings {
  return { ...settings, [key]: !settings[key] };
}

/** localStorage key for a Timeline's auto-open toggle state.
 *
 * A session id names a session on one instance, and a browser reaches several
 * instances from the one store, so what is kept per session is keyed by both
 * (`ccmsg.<feature>:<instance>:<sid>`). The parent Timeline passes
 * `agentKey: undefined`; a drilldown Timeline passes the agent's
 * `agentId ?? runId ?? teammate` so each subagent remembers its own toggle
 * state independent of the parent session and of sibling agents. */
export function timelineAutoOpenStorageKey(
  instance: string,
  sid: string,
  agentKey: string | undefined,
): string {
  const scope = agentKey === undefined ? sid : `${sid}/${agentKey}`;
  return `ccmsg.tl.autoOpen:${instance}:${scope}`;
}

/** Parses a raw `localStorage.getItem(timelineAutoOpenStorageKey(...))`
 * result, tolerating anything a prior schema version / manual edit / storage
 * corruption could have left behind: absent key, non-JSON, non-object JSON,
 * or an object missing/mistyping any of the four boolean fields all fall
 * back to `fallback` (the timeline's default settings) rather than throwing
 * or partially applying a corrupt value — same posture as `parseFavorites`
 * in utils.ts. */
export function parseTimelineAutoOpenSettings(
  raw: string | null,
  fallback: TimelineAutoOpenSettings,
): TimelineAutoOpenSettings {
  if (raw === null) return fallback;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (typeof parsed !== "object" || parsed === null) return fallback;
  const candidate = parsed as Record<string, unknown>;
  const keys: (keyof TimelineAutoOpenSettings)[] = ["thinking", "ccmsg", "agent", "items"];
  if (!keys.every((key) => typeof candidate[key] === "boolean")) return fallback;
  return {
    thinking: candidate.thinking as boolean,
    ccmsg: candidate.ccmsg as boolean,
    agent: candidate.agent as boolean,
    items: candidate.items as boolean,
  };
}

/** 畳みを自動で開くか。
 *
 * 開くのは「その軸のものが中に居る」畳みだけ。設定は軸ごとに独立していて、
 * 読み手が気にしている種類を 1 度決めれば、同じ種類の畳みを何度も開かずに
 * 済む。 */
export function foldShouldAutoOpen(
  rows: readonly ItemRow[],
  settings: TimelineAutoOpenSettings,
): boolean {
  return rows.some((row) => {
    switch (itemCategory(row.item)) {
      case "thinking":
        return settings.thinking;
      case "ccmsg":
        return settings.ccmsg;
      case "agent":
        return settings.agent;
      case "other":
        return settings.items;
    }
  });
}
