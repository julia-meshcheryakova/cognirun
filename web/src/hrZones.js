export const MAX_HR = 190;

const ZONES = [
  { zone: 1, name: 'Recovery', upper: 0.6 },
  { zone: 2, name: 'Easy', upper: 0.7 },
  { zone: 3, name: 'Aerobic', upper: 0.8 },
  { zone: 4, name: 'Threshold', upper: 0.9 },
  { zone: 5, name: 'Max', upper: Infinity },
];

export function hrZone(bpm) {
  const ratio = bpm / MAX_HR;
  return ZONES.find((z) => ratio < z.upper);
}
