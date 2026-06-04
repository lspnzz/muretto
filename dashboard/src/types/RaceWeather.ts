export type RaceWeather = {
  source: "forecast" | "current";
  time: string;
  airTemp: number | null;
  humidity: number | null;
  pressure: number | null;
  rain: number | null;
  precipitation: number | null;
  precipitationProbability: number | null;
  windDirection: number | null;
  windSpeed: number | null;
  weatherCode: number | null;
};
