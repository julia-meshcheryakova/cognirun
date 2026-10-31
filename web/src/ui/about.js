import { CONTACT_EMAIL } from '../legal.js';
import { legalLinksMarkup } from './legal.js';

/** What CogniRun is, how scoring works, and how to reach us. Linked from Settings. */
export function aboutMarkup({ version = '' } = {}) {
  const mail = `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`;
  return `
    <main class="screen legal" data-screen="about">
      <a class="back-link" href="#/settings" id="about-back">← Back</a>
      <h1>About CogniRun</h1>
      <p class="hint">Version ${version || 'dev'}</p>

      <section class="card legal-section">
        <h2>Run, then think</h2>
        <p>CogniRun asks you a question at every kilometre of your run: trivia, logic or mental maths. Answer out loud or by typing while you keep moving. It's a quiz run for one, from the people behind Quizrun.</p>
      </section>

      <section class="card legal-section">
        <h2>Scoring</h2>
        <ul>
          <li>A correct answer earns up to 100 points. The quicker you answer, the more you get, down to 50 points after a minute.</li>
          <li>After 60 seconds, or with a wrong answer, you get nothing for that question.</li>
          <li>Your history tracks points, pace and accuracy per category, with personal bests and a weekly streak.</li>
        </ul>
      </section>

      <section class="card legal-section">
        <h2>Weekly challenges</h2>
        <p>Every week there is a 3K, 5K and 10K challenge. Everyone gets the same questions, and your best run of the week is your entry. To count, a run has to cover the whole distance at a believable pace. Sign in to appear on the leaderboard.</p>
      </section>

      <section class="card legal-section">
        <h2>Questions</h2>
        <dl>
          <dt>Do I need an account?</dt>
          <dd>No. Without one, everything stays on this device. An account syncs your runs between devices and puts you on challenge leaderboards.</dd>
          <dt>Does it work offline?</dt>
          <dd>The questions are built in, so a run works without a connection. Reading questions aloud, voice answers and checking free-text answers need one.</dd>
          <dt>My GPS lost signal. What now?</dt>
          <dd>Distance only moves with GPS fixes, so check the GPS status before you start. Tall buildings and tree cover weaken the signal, which can make a run count short.</dd>
          <dt>Is it safe to use while running?</dt>
          <dd>Only answer when it's safe to. Stay aware of traffic and the ground. See the <a href="#/terms">Terms</a> for more.</dd>
        </dl>
      </section>

      <section class="card legal-section">
        <h2>Contact</h2>
        <p>Found a bug, have a question idea, or want your data? Email ${mail}.</p>
      </section>
      ${legalLinksMarkup()}
    </main>`;
}

export function renderAbout(root, { version = '' } = {}) {
  root.innerHTML = aboutMarkup({ version });
  window.scrollTo?.(0, 0);
  root.querySelector('#about-back')?.addEventListener('click', (event) => {
    if (window.history.length > 1) {
      event.preventDefault();
      window.history.back();
    }
  });
}
