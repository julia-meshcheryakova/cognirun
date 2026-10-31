import { CONTACT_EMAIL, LEGAL_UPDATED, PRIVACY_VERSION, TERMS_VERSION } from '../legal.js';

/**
 * Privacy notice (#/privacy) and Terms of use (#/terms). Static pages outside
 * the tab bar, linked from Settings and from the sign-in consent.
 */

const mail = `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`;

const PRIVACY = [
  [
    'Who we are',
    `<p>CogniRun is run by the small independent team behind Quizrun, acting as individuals rather than a company. We decide how your data is used (we are the "controller"). Questions or requests: ${mail}.</p>`,
  ],
  [
    'The short version',
    `<ul>
      <li>Without an account, your runs stay on your device. We never see them.</li>
      <li>With an account, we store your email, display name and the runs you sync, so you can see them on any device and join challenges.</li>
      <li>A run can include your GPS route and, if you connect a watch, your heart rate. Heart rate is health data: we only store it with your explicit consent.</li>
      <li>Leaderboards show your display name and score, never your email or route.</li>
      <li>No ads, no analytics, no tracking cookies. We don't sell or share your data for marketing.</li>
      <li>You can export your runs and delete your account in the app at any time.</li>
    </ul>`,
  ],
  [
    'What we collect and why',
    `<dl>
      <dt>Account</dt>
      <dd>Email address, display name (from Google or your email, editable), and if you use Google sign-in, your basic Google profile. Our sign-in provider also logs IP address and browser for security. Used to run your account (contract).</dd>
      <dt>Runs</dt>
      <dd>Start and finish time, course, distance, duration, GPS route, pace, your answers, scores and which challenge it was for. Synced only when you're signed in. Used for your history, progress and leaderboards (contract).</dd>
      <dt>Heart rate</dt>
      <dd>Average, maximum and per-point heart rate from a watch you choose to connect. Stored with your account only with your explicit consent, given when you sign in (UK/EU GDPR Art. 9(2)(a)). Don't connect a watch if you don't want it recorded.</dd>
      <dt>Voice answers</dt>
      <dd>When you answer by voice, the recording is sent through our server to ElevenLabs to turn it into text. We don't store the audio. Questions are read aloud by ElevenLabs text-to-speech; only the question text is sent.</dd>
      <dt>Answer checking</dt>
      <dd>To mark a free-text answer, the question and your answer text (no account details) may be sent to Groq's AI service.</dd>
      <dt>Technical logs</dt>
      <dd>Our hosting providers log IP addresses and request details for a short time to keep the service secure (legitimate interests).</dd>
    </dl>`,
  ],
  [
    'On your device',
    `<p>The app keeps your runs, settings and, when signed in, a sign-in token in your browser's or phone's local storage. These are needed for the app to work, so we don't ask for cookie consent. Location and microphone are used only during a run, and only after you allow them.</p>`,
  ],
  [
    'Who processes it for us',
    `<ul>
      <li>Supabase: accounts and database.</li>
      <li>Vercel or Cloudflare: hosting the website and our small API.</li>
      <li>ElevenLabs: speech-to-text and text-to-speech.</li>
      <li>Groq: AI answer checking.</li>
      <li>Google: sign-in, if you choose it.</li>
      <li>Our email provider: sign-in links.</li>
    </ul>
    <p>Some of them process data outside the UK and EU (for example in the US). They do so under their data processing terms with standard contractual clauses or equivalent safeguards.</p>`,
  ],
  [
    'How long we keep it',
    `<p>Account data and synced runs are kept until you delete them or your account. Deleting your account removes your profile, runs and answers from our database straight away. Copies may remain in provider backups and logs for up to 30 days. Runs on your device stay until you delete them in Settings or remove the app.</p>`,
  ],
  [
    'Your rights',
    `<p>You can access, correct, export, restrict, object to the use of, or delete your data, and withdraw consent at any time (this doesn't affect what happened before). In the app: export in Settings → Your data; rename and delete your account on the You tab. For anything else, email ${mail}. You can also complain to the UK Information Commissioner's Office (ico.org.uk) or your local data protection authority.</p>`,
  ],
  [
    'Children',
    `<p>CogniRun is for people aged 16 and over. Don't create an account if you're younger. If you think a child has given us data, email us and we'll delete it.</p>`,
  ],
  [
    'Security',
    `<p>Data is encrypted in transit. Database rules let each person read and change only their own runs. No system is perfect: if a breach affects you, we'll tell you and the regulator as the law requires.</p>`,
  ],
  [
    'Changes',
    `<p>If we change this notice in a way that matters, we'll ask you to agree again in the app before your next sync.</p>`,
  ],
];

const TERMS = [
  [
    'About these terms',
    `<p>These terms apply when you use the CogniRun app or website. By using it you agree to them. CogniRun is run by the team behind Quizrun, acting as individuals (${mail}). How we handle your data is in the <a href="#/privacy">Privacy notice</a>.</p>`,
  ],
  [
    'Who can use CogniRun',
    `<p>You must be 16 or older to create an account. If you're under 18, get a parent or guardian's permission before running with the app.</p>`,
  ],
  [
    'Your health and safety come first',
    `<ul>
      <li>Running is physical exercise and carries a risk of injury. By using CogniRun you confirm you're fit to run, and that you'll check with a doctor first if you have a health condition, are pregnant, or are unsure.</li>
      <li>Stop if you feel pain, dizziness or shortness of breath.</li>
      <li>Stay aware of traffic, cyclists, other people and the ground. Obey local laws. Only look at or talk to your phone when it's safe. Answering is never more important than your safety.</li>
      <li>Heart rate, distance, pace and GPS readings can be wrong. CogniRun is not a medical device and gives no medical advice.</li>
    </ul>`,
  ],
  [
    'Your account',
    `<p>Keep access to your email or Google account secure; sign-in links are personal. Pick a display name that isn't offensive, misleading or someone else's; we may change or remove names that break this. You can delete your account at any time on the You tab.</p>`,
  ],
  [
    'Fair play',
    `<p>Leaderboards only work if everyone is honest. Run the distance yourself, don't share or look up answers mid-run, and don't fake, edit or automate runs. We may remove results, hide you from leaderboards or close accounts that cheat or abuse the service, including its voice and AI features.</p>`,
  ],
  [
    'The questions',
    `<p>Some questions are written or checked with AI help. We work to keep them right, but mistakes happen; tell us and we'll fix them. Answer marking, including AI marking of free-text answers, is automatic and may occasionally be wrong. Questions, design and code belong to us or our licensors.</p>`,
  ],
  [
    'The service',
    `<p>CogniRun is free and still evolving. Features, challenges and scoring may change, and the service may be unavailable at times. We may stop offering it; if we do, we'll give you reasonable notice to export your runs.</p>`,
  ],
  [
    'Our responsibility to you',
    `<p>You take part at your own risk. To the extent the law allows, we aren't responsible for injury, loss or damage from your runs, from inaccurate readings, or from the service being unavailable. Nothing in these terms limits liability for death or personal injury caused by our negligence, for fraud, or anything else the law doesn't let us limit, and your statutory consumer rights are not affected.</p>`,
  ],
  [
    'Changes and ending',
    `<p>We may update these terms. If a change matters, we'll ask you to accept the new version in the app. You can stop using CogniRun and delete your account whenever you like.</p>`,
  ],
  [
    'Law',
    `<p>These terms are governed by the law of England and Wales. If you live elsewhere in the UK or in the EU, you keep the protection of your local consumer laws and can bring claims in your local courts.</p>`,
  ],
];

const PAGES = {
  privacy: { title: 'Privacy notice', version: PRIVACY_VERSION, sections: PRIVACY },
  terms: { title: 'Terms of use', version: TERMS_VERSION, sections: TERMS },
};

export const LEGAL_PAGES = Object.keys(PAGES);

export function legalLinksMarkup() {
  return `<nav class="legal-links" aria-label="Legal"><a href="#/privacy">Privacy</a><a href="#/terms">Terms</a><a href="mailto:${CONTACT_EMAIL}">Contact</a></nav>`;
}

export function legalMarkup(page) {
  const { title, version, sections } = PAGES[page] ?? PAGES.privacy;
  return `
    <main class="screen legal" data-screen="${page in PAGES ? page : 'privacy'}">
      <a class="back-link" href="#/settings" id="legal-back">← Back</a>
      <h1>${title}</h1>
      <p class="hint">Last updated ${LEGAL_UPDATED} · version ${version}</p>
      ${sections.map(([heading, body]) => `<section class="card legal-section"><h2>${heading}</h2>${body}</section>`).join('')}
      ${legalLinksMarkup()}
    </main>`;
}

export function renderLegal(root, page) {
  root.innerHTML = legalMarkup(page);
  window.scrollTo?.(0, 0);
  root.querySelector('#legal-back')?.addEventListener('click', (event) => {
    // Go back to wherever the link was opened from (Settings or sign-in).
    if (window.history.length > 1) {
      event.preventDefault();
      window.history.back();
    }
  });
}
