const BASE_PACE_SEC_PER_KM = 360; // 6:00 / km
const BASE_SPEED = 1000 / BASE_PACE_SEC_PER_KM; // m/s
const SLOWDOWN_SECONDS = 45; // thinking about the question, then recovering
const START = { lat: 52.3702, lng: 4.8952 };

const METERS_PER_DEG_LAT = 111_320;

/**
 * Simulated GPS + heart rate. `step` advances the simulation by one simulated
 * second; the clock decides how often that happens.
 */
export function createDemoSensors({ onPosition, onHeartRate }) {
  let t = 0; // simulated seconds
  let distance = 0;
  let lat = START.lat;
  let lng = START.lng;
  let bearing = 45;
  let hr = 110;
  let kmDone = 0;
  let slowdownStart = -Infinity;

  function paceFactor() {
    const wobble =
      1 + 0.05 * Math.sin(t / 24) + 0.025 * Math.sin(t / 7.3) + (Math.random() - 0.5) * 0.02;
    const sinceKm = t - slowdownStart;
    if (sinceKm >= 0 && sinceKm < SLOWDOWN_SECONDS) {
      const recovery = sinceKm / SLOWDOWN_SECONDS; // 0 -> 1
      return wobble * (0.72 + 0.28 * recovery);
    }
    return wobble;
  }

  return {
    step(simMs) {
      t += 1;
      const speed = BASE_SPEED * paceFactor();
      distance += speed;

      bearing += Math.sin(t / 30) * 3;
      const rad = (bearing * Math.PI) / 180;
      lat += (speed * Math.cos(rad)) / METERS_PER_DEG_LAT;
      lng +=
        (speed * Math.sin(rad)) / (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));

      const km = Math.floor(distance / 1000);
      if (km > kmDone) {
        kmDone = km;
        slowdownStart = t;
      }

      const targetHr = 118 + Math.min(30, t / 18) + (speed / BASE_SPEED - 1) * 40;
      hr += (targetHr - hr) * 0.2 + (Math.random() - 0.5);

      onPosition({ lat, lng, t: simMs });
      onHeartRate(Math.round(hr));
    },
  };
}
