function setupCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  return { ctx, width, height };
}

/** Draws the GPS path, scaled to fit the canvas. */
export function drawRoute(canvas, samples) {
  const { ctx, width, height } = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  if (samples.length < 2) return;

  const lats = samples.map((s) => s.lat);
  const lngs = samples.map((s) => s.lng);
  const padding = 16;
  const spanLat = Math.max(1e-6, Math.max(...lats) - Math.min(...lats));
  const spanLng = Math.max(1e-6, Math.max(...lngs) - Math.min(...lngs));
  const scale = Math.min((width - 2 * padding) / spanLng, (height - 2 * padding) / spanLat);
  const offsetX = (width - spanLng * scale) / 2;
  const offsetY = (height - spanLat * scale) / 2;
  const point = (s) => [
    offsetX + (s.lng - Math.min(...lngs)) * scale,
    height - offsetY - (s.lat - Math.min(...lats)) * scale,
  ];

  ctx.lineWidth = 3;
  ctx.strokeStyle = '#38bdf8';
  ctx.beginPath();
  samples.forEach((s, i) => {
    const [x, y] = point(s);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  [
    { sample: samples[0], color: '#22c55e' },
    { sample: samples[samples.length - 1], color: '#ef4444' },
  ].forEach(({ sample, color }) => {
    const [x, y] = point(sample);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Pace (min/km, lower is faster) over distance. */
export function drawSpeedProfile(canvas, samples) {
  const { ctx, width, height } = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  const points = samples
    .filter((s) => s.speed > 0.3)
    .map((s) => ({ x: s.distance, y: 1000 / s.speed / 60 }));
  if (points.length < 2) return;

  const padding = { left: 44, right: 12, top: 12, bottom: 26 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const maxX = points[points.length - 1].x;
  const minY = Math.min(...points.map((p) => p.y)) - 0.2;
  const maxY = Math.max(...points.map((p) => p.y)) + 0.2;
  const sx = (x) => padding.left + (x / maxX) * plotW;
  const sy = (y) => padding.top + ((maxY - y) / (maxY - minY)) * plotH;

  ctx.strokeStyle = '#334155';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px system-ui, sans-serif';
  for (let i = 0; i <= 3; i += 1) {
    const y = padding.top + (plotH / 3) * i;
    const value = maxY - ((maxY - minY) / 3) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    const mins = Math.floor(value);
    ctx.fillText(`${mins}:${String(Math.round((value - mins) * 60)).padStart(2, '0')}`, 4, y + 4);
  }
  for (let km = 0; km <= Math.floor(maxX / 1000); km += 1) {
    ctx.fillText(`${km}km`, sx(km * 1000) - 8, height - 8);
  }

  ctx.lineWidth = 2;
  ctx.strokeStyle = '#f97316';
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(sx(p.x), sy(p.y)) : ctx.lineTo(sx(p.x), sy(p.y))));
  ctx.stroke();
}
