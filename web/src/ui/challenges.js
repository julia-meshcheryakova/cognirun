import { courseOf } from '../config.js';
import { escapeHtml } from '../format.js';
import { buildChallengeQuestionSet, difficultyCurve } from '../questions.js';
import {
  challengeById,
  isOpen,
  isoWeek,
  timeLeft,
  weekKey,
  weeklyChallenges,
} from '../challenges/schedule.js';
import { challengeSummary, pastChallengeIds } from '../challenges/entries.js';
import { routeHref } from './nav.js';
import { formatDate, formatDuration } from './runFormat.js';

function curveText(count) {
  const curve = difficultyCurve(count);
  return `${curve[0]} → ${curve.at(-1)}`;
}

function bestText(summary) {
  if (!summary.best) return 'Not entered yet';
  return `Your best: <b class="challenge-best-points">${summary.best.points}</b> pts · ${formatDuration(summary.best.durationS)}`;
}

function attemptsText(summary) {
  const parts = [];
  if (summary.attempts) parts.push(`${summary.attempts} attempt${summary.attempts === 1 ? '' : 's'}`);
  if (summary.demoAttempts) {
    parts.push(
      `${summary.demoAttempts} demo attempt${summary.demoAttempts === 1 ? '' : 's'} (not counted)`,
    );
  }
  return parts.join(' · ');
}

function startButton(challenge, demo, extraClass = '') {
  return `<button class="primary ${extraClass}" data-start-challenge="${escapeHtml(challenge.id)}">${
    demo ? 'Try in demo' : `Run ${escapeHtml(courseOf(challenge.course).label)}`
  }</button>`;
}

export function leaderboardMarkup(rows) {
  if (!rows) {
    return '<p class="hint">Sign in to compare with other runners. Your own attempts are below.</p>';
  }
  if (!rows.length) return '<p class="hint">No entries yet — be the first.</p>';
  return `
    <ol class="challenge-leaderboard">
      ${rows
        .map(
          (row) =>
            `<li${row.isMe ? ' class="me"' : ''}><span>${escapeHtml(row.displayName || 'Runner')}</span><span><b>${Number(
              row.points,
            )}</b> pts · ${formatDuration(row.durationS)}</span></li>`,
        )
        .join('')}
    </ol>`;
}

function challengeCard(summary, { now, demo }) {
  const { challenge } = summary;
  const count = buildChallengeQuestionSet({ challengeId: challenge.id, course: challenge.course }).length;
  const attempts = attemptsText(summary);
  return `
    <section class="card challenge-card" data-challenge-id="${escapeHtml(challenge.id)}">
      <div class="row">
        <h2>${escapeHtml(challenge.title)}</h2>
        <span class="hint">${count} questions · ${curveText(count)}</span>
      </div>
      <p class="challenge-best">${bestText(summary)}</p>
      ${attempts ? `<p class="hint challenge-attempts">${attempts}</p>` : ''}
      <div class="row">
        <a class="hint" href="${routeHref('challenges', challenge.id)}">Leaderboard &amp; attempts</a>
        ${isOpen(challenge, now) ? startButton(challenge, demo, 'compact') : '<span class="hint">Closed</span>'}
      </div>
    </section>`;
}

export function challengesMarkup({ runs = [], now = new Date(), demo = false } = {}) {
  const current = weeklyChallenges(now);
  const past = pastChallengeIds(
    runs,
    current.map((c) => c.id),
  )
    .map(challengeById)
    .filter(Boolean)
    .map((c) => challengeSummary(c, runs));
  return `
    <main class="screen" id="challenges-screen">
      <h1>Challenges</h1>
      <p class="lede">This week · ${weekKey(isoWeek(now))} · ends in ${timeLeft(current[0], now)}.
        Everyone gets the same questions; your best full run is your entry.</p>
      ${demo ? '<p class="hint demo-note">Demo mode is on: attempts are saved but don\'t count.</p>' : ''}
      ${current.map((c) => challengeCard(challengeSummary(c, runs), { now, demo })).join('')}
      ${
        past.length
          ? `<section class="card">
        <h2>Past challenges</h2>
        <ul class="run-list">
          ${past
            .map(
              (s) =>
                `<li class="past-challenge"><a href="${routeHref('challenges', s.challenge.id)}">${escapeHtml(
                  s.challenge.week,
                )} · ${escapeHtml(s.challenge.title)}</a> <span class="hint">${bestText(s)}</span></li>`,
            )
            .join('')}
        </ul>
      </section>`
          : ''
      }
    </main>`;
}

export function challengeDetailMarkup({
  challenge,
  runs = [],
  now = new Date(),
  demo = false,
  leaderboard = null,
}) {
  const summary = challengeSummary(challenge, runs);
  const open = isOpen(challenge, now);
  const lastDay = new Date(Date.parse(challenge.endsAt) - 1).toISOString();
  const attempts = attemptsText(summary);
  return `
    <main class="screen" id="challenge-detail" data-challenge-id="${escapeHtml(challenge.id)}">
      <a class="hint" href="${routeHref('challenges')}">← Challenges</a>
      <h1>${escapeHtml(challenge.title)}</h1>
      <p class="lede">${escapeHtml(challenge.week)} · ${formatDate(challenge.startsAt, { withTime: false })} – ${formatDate(
        lastDay,
        { withTime: false },
      )} · ${open ? `ends in ${timeLeft(challenge, now)}` : 'closed'}</p>
      <section class="card">
        <h2>Leaderboard</h2>
        ${leaderboardMarkup(leaderboard)}
      </section>
      <section class="card">
        <h2>Your attempts</h2>
        <p class="challenge-best">${bestText(summary)}</p>
        ${
          summary.entries.length
            ? `<ol class="challenge-entries">
          ${summary.entries
            .map(
              (r) =>
                `<li><a href="${routeHref('history', r.id)}">${formatDate(r.finishedAt)}</a> · <b>${r.points}</b> pts · ${formatDuration(r.durationS)} · ${r.correct}/${r.total} correct</li>`,
            )
            .join('')}
        </ol>`
            : ''
        }
        ${attempts ? `<p class="hint challenge-attempts">${attempts}</p>` : ''}
      </section>
      ${open ? startButton(challenge, demo) : ''}
    </main>`;
}

/**
 * Challenges tab. `#/challenges` lists this week's 3K/5K/10K challenges;
 * `#/challenges/<id>` shows one with its leaderboard and your attempts.
 * `loadLeaderboard(challengeId)` resolves to rows, or null when there is no
 * account to compare against (signed out / local-only).
 *
 * @param {Element} root
 * @param {object} options
 * @param {import('../history/store.js').RunStore} options.store
 * @param {string[]} [options.params]
 * @param {{demo?: boolean}} [options.settings]
 * @param {(run: {course: string, challengeId: string, questionIds: string[]}) => void} options.startRun
 * @param {(challengeId: string) => ReturnType<typeof import('../challenges/leaderboard.js').loadChallengeLeaderboard>} [options.loadLeaderboard]
 * @param {Date} [options.now]
 */
export async function renderChallenges(
  root,
  {
    store,
    params = [],
    settings = {},
    startRun,
    loadLeaderboard = async () => null,
    now = new Date(),
  },
) {
  const runs = await store.list();
  const challenge = params[0] ? challengeById(params[0]) : null;
  if (challenge) {
    const leaderboard = await loadLeaderboard(challenge.id).catch(() => null);
    root.innerHTML = challengeDetailMarkup({ challenge, runs, now, demo: settings.demo, leaderboard });
  } else {
    root.innerHTML = challengesMarkup({ runs, now, demo: settings.demo });
  }

  /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('[data-start-challenge]')).forEach((btn) =>
    btn.addEventListener('click', () => {
      const picked = challengeById(btn.dataset.startChallenge);
      startRun({
        course: picked.course,
        challengeId: picked.id,
        questionIds: buildChallengeQuestionSet({ challengeId: picked.id, course: picked.course }),
      });
    }),
  );
}
