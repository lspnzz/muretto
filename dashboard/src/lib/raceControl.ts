// 2026 mode announcements from Race Control. The car feed carries no
// energy/override channel (docs/plans/0005-driver-detail-tab.md), but Race
// Control broadcasts track-wide mode messages. The strings below were
// observed in pre-season testing and are still experimental — if FOM rewords
// them, this file is the only place to adjust.

import type { Message, RaceControlMessages } from "@/types";

export type OvertakeMode = "enabled" | "disabled";
export type StraightMode = "normal grip" | "low grip" | "disabled";

/** Messages in feed order — the map is keyed by stringified index. */
function orderedMessages(messages: RaceControlMessages | null | undefined): Message[] {
  const map = messages?.Messages ?? {};
  return Object.keys(map)
    .sort((a, b) => Number(a) - Number(b))
    .flatMap((key) => (map[key] ? [map[key]] : []));
}

/** Latest track-wide overtake-mode state, if Race Control announced one. */
export function overtakeMode(
  messages: RaceControlMessages | null | undefined,
): OvertakeMode | null {
  let mode: OvertakeMode | null = null;
  for (const message of orderedMessages(messages)) {
    const text = message.Message.toUpperCase();
    if (text.includes("OVERTAKE ENABLED")) mode = "enabled";
    else if (text.includes("OVERTAKE DISABLED")) mode = "disabled";
  }
  return mode;
}

/** Latest straight-mode (active aero) state, if Race Control announced one. */
export function straightMode(
  messages: RaceControlMessages | null | undefined,
): StraightMode | null {
  let mode: StraightMode | null = null;
  for (const message of orderedMessages(messages)) {
    const text = message.Message.toUpperCase();
    if (!text.includes("STRAIGHT MODE")) continue;
    if (text.includes("NORMAL GRIP")) mode = "normal grip";
    else if (text.includes("LOW GRIP")) mode = "low grip";
    else if (text.includes("DISABLED")) mode = "disabled";
  }
  return mode;
}
