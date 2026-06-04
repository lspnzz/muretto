export type UpcomingRaceSession = {
  name: string;
  iso: string;
};

export type UpcomingRace = {
  season: string;
  round: string;
  raceName: string;
  raceUrl?: string;
  circuitId: string;
  circuitKey?: number;
  circuitName: string;
  locality: string;
  country: string;
  latitude?: number;
  longitude?: number;
  raceIso: string;
  sessions: UpcomingRaceSession[];
};
