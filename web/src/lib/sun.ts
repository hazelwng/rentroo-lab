/** Client-side solar position for shadow rendering only. */

const DECLINATION = -23.44; // degrees
const EQUATION_OF_TIME = 2.0; // minutes
const TZ_MERIDIAN = 135.0; // JST

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Altitude and azimuth in degrees at `minutes` past local midnight. */
export function sunPosition(lat: number, lon: number, minutes: number) {
  const solarMinutes = minutes + 4.0 * (lon - TZ_MERIDIAN) + EQUATION_OF_TIME;
  const hourAngle = rad(solarMinutes / 4.0 - 180.0);

  const phi = rad(lat);
  const delta = rad(DECLINATION);

  const sinAlt =
    Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(hourAngle);
  const altitude = deg(Math.asin(sinAlt));

  const azimuth =
    (deg(
      Math.atan2(
        Math.sin(hourAngle),
        Math.cos(hourAngle) * Math.sin(phi) - Math.tan(delta) * Math.cos(phi),
      ),
    ) +
      180.0) %
    360.0;

  return { altitude, azimuth };
}

// Matches the API sample window.
export const DAY_START = 6 * 60;
export const DAY_END = 18 * 60;

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
