/**
 * App-level navigation: a bottom tab bar outside #app, driven by the URL hash
 * (#/run, #/challenges, #/history, #/account, #/settings) so screens are deep-linkable and the
 * Android WebView back button works. Hidden while a run is live.
 */
export const TABS = [
  { id: 'run', label: 'Run', icon: '▶' },
  { id: 'challenges', label: 'Challenges', icon: '🏁' },
  { id: 'history', label: 'History', icon: '📈' },
  { id: 'account', label: 'You', icon: '👤' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];
export const DEFAULT_TAB = 'run';
/** Routable pages without a tab of their own (none is highlighted). */
export const PAGES = ['privacy', 'terms'];

/** '#/history/abc' -> { tab: 'history', params: ['abc'] } */
export function parseRoute(hash = '') {
  const [tab, ...params] = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return TABS.some((t) => t.id === tab) || PAGES.includes(tab) ? { tab, params } : { tab: DEFAULT_TAB, params: [] };
}

export function routeHref(tab, ...params) {
  return `#/${[tab, ...params].map(encodeURIComponent).join('/')}`;
}

export function navMarkup(active) {
  return TABS.map(
    (t) =>
      `<a href="${routeHref(t.id)}" data-tab="${t.id}" class="${t.id === active ? 'active' : ''}"${
        t.id === active ? ' aria-current="page"' : ''
      }><span aria-hidden="true">${t.icon}</span>${t.label}</a>`,
  ).join('');
}

export function renderNav(nav, { active, hidden = false }) {
  if (!nav) return;
  nav.hidden = hidden;
  nav.innerHTML = navMarkup(active);
}
