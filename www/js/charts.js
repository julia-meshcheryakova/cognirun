import { CONDITIONS } from './questions.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function element(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function clear(svg) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}

export function drawConditionCurve(svg, points = []) {
  if (!svg) return;
  clear(svg);
  const width = 680;
  const height = 250;
  const left = 46;
  const right = 22;
  const top = 25;
  const bottom = 50;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const y = (value) => top + ((130 - value) / 60) * (height - top - bottom);
  const x = (index) => left + (index / Math.max(1, points.length - 1)) * (width - left - right);

  for (const value of [80, 100, 120]) {
    const line = element('line', { x1: left, x2: width - right, y1: y(value), y2: y(value), class: value === 100 ? 'chart-baseline' : 'chart-grid' });
    svg.appendChild(line);
    const label = element('text', { x: left - 10, y: y(value) + 4, class: 'chart-axis', 'text-anchor': 'end' });
    label.textContent = value;
    svg.appendChild(label);
  }

  if (!points.length) {
    const label = element('text', { x: width / 2, y: height / 2, class: 'chart-empty', 'text-anchor': 'middle' });
    label.textContent = 'Complete a scan to build this curve';
    svg.appendChild(label);
    return;
  }

  const pathData = points.map((point, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(point.index)}`).join(' ');
  const glow = element('path', { d: pathData, class: 'curve-glow' });
  const path = element('path', { d: pathData, class: 'curve-line' });
  svg.append(glow, path);

  points.forEach((point, index) => {
    const colour = CONDITIONS[point.condition]?.colour || '#d9ff63';
    const dot = element('circle', { cx: x(index), cy: y(point.index), r: 7, fill: colour, class: 'curve-dot' });
    const value = element('text', { x: x(index), y: y(point.index) - 15, class: 'curve-value', 'text-anchor': 'middle' });
    value.textContent = point.index;
    const label = element('text', { x: x(index), y: height - 18, class: 'chart-label', 'text-anchor': 'middle' });
    label.textContent = CONDITIONS[point.condition]?.short || point.condition;
    svg.append(dot, value, label);
  });
}

export function drawTelemetrySparkline(svg, samples = [], participant) {
  if (!svg) return;
  clear(svg);
  const width = 420;
  const height = 80;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const recent = samples.slice(-90);
  const hrMin = Math.max(40, participant.restingHr - 10);
  const hrMax = participant.maxHr + 5;
  const y = (hr) => height - 6 - ((hr - hrMin) / (hrMax - hrMin)) * (height - 12);
  const x = (index) => (index / Math.max(1, recent.length - 1)) * width;

  const target = recent.at(-1)?.targetHr;
  if (target) {
    const top = y(target[1]);
    const bottom = y(target[0]);
    svg.appendChild(element('rect', { x: 0, y: top, width, height: Math.max(2, bottom - top), class: 'spark-target' }));
  }
  if (recent.length < 2) return;
  const points = recent.map((sample, index) => `${x(index)},${y(sample.hrBpm)}`).join(' ');
  svg.appendChild(element('polyline', { points, class: 'spark-line' }));
}

export function drawCohortBars(svg, profiles = []) {
  if (!svg) return;
  clear(svg);
  const width = 680;
  const rowHeight = 44;
  const height = Math.max(180, profiles.length * rowHeight + 20);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const max = Math.max(...profiles.map((profile) => profile.creativity), 120);
  profiles.forEach((profile, index) => {
    const y = 10 + (index * rowHeight);
    const label = element('text', { x: 0, y: y + 18, class: 'cohort-label' });
    label.textContent = profile.type;
    const track = element('rect', { x: 176, y: y + 4, width: 420, height: 18, rx: 9, class: 'cohort-track' });
    const barWidth = Math.max(12, (profile.creativity / max) * 420);
    const bar = element('rect', { x: 176, y: y + 4, width: barWidth, height: 18, rx: 9, class: 'cohort-bar' });
    const value = element('text', { x: 610, y: y + 18, class: 'cohort-value' });
    value.textContent = profile.creativity;
    svg.append(label, track, bar, value);
  });
}
