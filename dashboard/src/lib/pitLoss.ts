// Per-circuit pit-lane time loss in seconds (green flag / VSC), keyed by a
// lowercase substring of `SessionInfo.Meeting.Circuit.ShortName`. Values from
// formula1.com strategy guides — see docs/references/strategy-screens.md.

export type PitLoss = { green: number; vsc: number };

export const DEFAULT_PIT_LOSS: PitLoss = { green: 21, vsc: 15 };

const TABLE: Array<[needle: string, loss: PitLoss]> = [
  ["sakhir", { green: 22.5, vsc: 15 }],
  ["bahrain", { green: 22.5, vsc: 15 }],
  ["jeddah", { green: 20, vsc: 11 }],
  ["melbourne", { green: 19.5, vsc: 13.5 }],
  ["albert park", { green: 19.5, vsc: 13.5 }],
  ["baku", { green: 20.5, vsc: 11 }],
  ["miami", { green: 17, vsc: 9 }],
  ["imola", { green: 26.5, vsc: 16.5 }],
  ["monaco", { green: 19.5, vsc: 12 }],
  ["monte carlo", { green: 19.5, vsc: 12 }],
  ["barcelona", { green: 22, vsc: 12.5 }],
  ["catalunya", { green: 22, vsc: 12.5 }],
  ["montreal", { green: 18.5, vsc: 9.5 }],
  ["spielberg", { green: 20.5, vsc: 8.5 }],
  ["red bull ring", { green: 20.5, vsc: 8.5 }],
  ["silverstone", { green: 20, vsc: 9 }],
  ["hungaroring", { green: 19.7, vsc: 14 }],
  ["spa", { green: 18.5, vsc: 11 }],
  ["zandvoort", { green: 18, vsc: 12 }],
  ["monza", { green: 24, vsc: 17 }],
  ["singapore", { green: 28.5, vsc: 15 }],
  ["suzuka", { green: 22.5, vsc: 10 }],
  ["losail", { green: 26.5, vsc: 15.5 }],
  ["lusail", { green: 26.5, vsc: 15.5 }],
  ["austin", { green: 20, vsc: 14 }],
  ["americas", { green: 20, vsc: 14 }],
  ["mexico", { green: 22, vsc: 15 }],
  ["interlagos", { green: 21, vsc: 11 }],
  ["sao paulo", { green: 21, vsc: 11 }],
  ["yas marina", { green: 22, vsc: 15 }],
  ["abu dhabi", { green: 22, vsc: 15 }],
];

export function pitLossFor(circuitShortName: string | null | undefined): PitLoss {
  const name = circuitShortName?.toLowerCase() ?? "";
  const hit = TABLE.find(([needle]) => name.includes(needle));
  return hit ? hit[1] : DEFAULT_PIT_LOSS;
}
