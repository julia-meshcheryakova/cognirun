export function escapeHtml(text) {
  return text.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
}

export function formatKm(meters) {
  return (meters / 1000).toFixed(2);
}

export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Speed in km/h from a speed in m/s. */
export function formatSpeed(speed) {
  return `${((speed || 0) * 3.6).toFixed(1)} km/h`;
}

/** Pace in min:sec per kilometer from a speed in m/s. */
export function formatPace(speed) {
  if (!speed || speed < 0.3) return '--:--';
  return `${formatClock(1000 / speed)} /km`;
}
