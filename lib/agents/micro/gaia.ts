// ============================================================================
// GAIA — Environment Micro Sub-Agent
//
// Polls Open-Meteo (weather), OpenAQ-compatible AQI, and USGS earthquake API.
// All free, no API key required.
// CC0 Public Domain
// ============================================================================

import {
  type AgentPollResult,
  type MicroSignal,
  type MicroAgentConfig,
  classifySeverity,
  normalizeInverse,
  normalizeDirect,
  safeFetch,
} from './core';

export const GAIA_CONFIG: MicroAgentConfig = {
  name: 'GAIA',
  description: 'Ecological integrity — weather extremes, air quality, seismic activity',
  pollIntervalMs: 5 * 60 * 1000, // 5 minutes
  sources: ['Open-Meteo', 'USGS Earthquake'],
};

// ── Open-Meteo: current weather for NYC (Merrick, LI area) ────────────────
// Extreme heat/cold, high wind = reduced ecological signal
type OpenMeteoResponse = {
  current?: {
    temperature_2m?: number;
    wind_speed_10m?: number;
    weather_code?: number;
  };
};

async function pollWeather(): Promise<MicroSignal | null> {
  const url =
    'https://api.open-meteo.com/v1/forecast?latitude=40.66&longitude=-73.55&current=temperature_2m,wind_speed_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph';

  const data = await safeFetch<OpenMeteoResponse>(url);
  if (!data?.current) return null;

  const temp = data.current.temperature_2m ?? 65;
  const wind = data.current.wind_speed_10m ?? 5;
  const code = data.current.weather_code ?? 0;

  // Temperature comfort: 55–80°F = 1.0, extremes degrade
  const tempScore = temp >= 55 && temp <= 80
    ? 1.0
    : temp < 55
      ? normalizeDirect(temp, 0, 55)
      : normalizeInverse(temp, 80, 115);

  // Wind: calm (<15mph) = 1.0, hurricane (>75) = 0.0
  const windScore = normalizeInverse(wind, 0, 75);

  // Weather code: clear(0)=1.0, thunderstorm(95+)=0.2
  const codeScore = code < 50 ? 1.0 : code < 80 ? 0.7 : code < 95 ? 0.4 : 0.2;

  const value = Number((0.4 * tempScore + 0.3 * windScore + 0.3 * codeScore).toFixed(3));

  return {
    agentName: 'GAIA',
    source: 'Open-Meteo',
    timestamp: new Date().toISOString(),
    value,
    label: `Weather: ${Math.round(temp)}°F, ${Math.round(wind)}mph wind, code ${code}`,
    severity: classifySeverity(value),
    raw: data.current,
  };
}

// ── USGS Earthquake API: significant earthquakes in last day ──────────────
type USGSFeature = {
  properties: { mag: number; place: string; time: number };
};
type USGSResponse = {
  features?: USGSFeature[];
  metadata?: { count: number };
};

async function pollEarthquakes(): Promise<MicroSignal | null> {
  const url =
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';

  const data = await safeFetch<USGSResponse>(url);
  if (!data?.features) return null;

  const quakes = data.features;
  const count = quakes.length;
  const maxMag = quakes.reduce((max, q) => Math.max(max, q.properties.mag), 0);

  // Few small quakes = good, many large = bad
  // 0 quakes M2.5+ in a day = 1.0, 50+ or M7+ = near 0
  const countScore = normalizeInverse(count, 0, 50);
  const magScore = normalizeInverse(maxMag, 0, 8);
  const value = Number((0.5 * countScore + 0.5 * magScore).toFixed(3));

  const strongest = quakes[0]?.properties;

  return {
    agentName: 'GAIA',
    source: 'USGS Earthquake',
    timestamp: new Date().toISOString(),
    value,
    label: `Seismic: ${count} quakes M2.5+ today, max M${maxMag.toFixed(1)}${strongest ? ` near ${strongest.place}` : ''}`,
    severity: classifySeverity(value, { watch: 0.5, elevated: 0.3, critical: 0.1 }),
    raw: { count, maxMag },
  };
}

// ── Poll all GAIA sources ─────────────────────────────────────────────────
export async function pollGaia(): Promise<AgentPollResult> {
  const errors: string[] = [];
  const signals: MicroSignal[] = [];

  const weather = await pollWeather();
  if (weather) signals.push(weather);
  else errors.push('Open-Meteo weather fetch failed');

  const quakes = await pollEarthquakes();
  if (quakes) signals.push(quakes);
  else errors.push('USGS earthquake fetch failed');

  return {
    agentName: 'GAIA',
    signals,
    polledAt: new Date().toISOString(),
    errors,
    healthy: signals.length > 0,
  };
}
