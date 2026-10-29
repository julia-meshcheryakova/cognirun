import './style.css';
import { COURSES, questionCountOf } from './config.js';
import { loadLibrary, selectRunQuestions } from './questions.js';
import { createRun } from './run.js';
import { renderLive } from './ui/live.js';
import { renderResults } from './ui/results.js';
import { renderSetup } from './ui/setup.js';
import { askQuestion } from './ui/question.js';
import { renderNav, parseRoute, routeHref } from './ui/nav.js';
import { renderHistory } from './ui/history.js';
import { renderChallenges } from './ui/challenges.js';
import { primeAudio } from './beep.js';
import { setVoiceEnabled } from './tts.js';
import { createDevices } from './sensors/devices.js';
import { toRunRecord } from './history/runRecord.js';
import { createLocalRunStore } from './history/store.js';

const root = document.querySelector('#app');
const nav = document.querySelector('#tabs');
const settings = { demo: false, multiplier: 1, voice: true, course: '3k' };
const store = createLocalRunStore();
let starting = false;
let running = false;
let setup = null;

// The watch and GPS live for the whole session: they are connected on the setup
// screen and a run only reads them, so nothing is asked for once it starts.
const devices = createDevices({
  onChange(state) {
    setup?.updateDevices(state);
  },
});

function showRoute() {
  if (running) return; // a live run owns the screen until it ends
  const { tab, params } = parseRoute(location.hash);
  setup = null;
  renderNav(nav, { active: tab });
  if (tab === 'history') return renderHistory(root, { store, params });
  if (tab === 'challenges') return renderChallenges(root, { store, params, startRun });
  return showSetup();
}

function showSetup() {
  document.querySelector('#download-apk')?.removeAttribute('hidden');
  setup = renderSetup(root, {
    settings,
    devices: devices.state(),
    onChange(patch) {
      Object.assign(settings, patch);
      showSetup();
    },
    onConnectWatch() {
      devices.connectHeartRate();
    },
    onConnectGps() {
      devices.connectGps();
    },
    onStart: () => startRun(),
  });
}

/**
 * Start a run. Solo runs use the setup screen's course; a challenge passes its
 * own `course`, `challengeId` and the fixed `questionIds` everyone answers.
 */
async function startRun({ course = settings.course, challengeId = null, questionIds = null } = {}) {
  if (starting || running) return;
  starting = true;
  running = true;

  setup = null;
  renderNav(nav, { active: 'run', hidden: true });
  document.querySelector('#download-apk')?.setAttribute('hidden', '');
  primeAudio(); // still inside the click gesture that started the run
  setVoiceEnabled(settings.voice);

  const runSettings = { ...settings, course: COURSES[course] ? course : settings.course };
  // Questions come from the question server when it is up and from the bundled
  // library otherwise.
  const libraryLoad = loadLibrary();
  let runQuestions = [];

  const answers = [];
  const pendingKilometers = [];
  let questionOpen = false;
  let latest = null;

  const live = renderLive(root, {
    settings: runSettings,
    onMultiplier(value) {
      settings.multiplier = value;
      run.setMultiplier(value);
    },
    onScrub(meters) {
      run.scrubTo(meters);
    },
    onExit() {
      run.stop();
      running = false;
      starting = false;
      showRoute();
    },
  });

  const run = createRun({
    demo: runSettings.demo,
    multiplier: runSettings.multiplier,
    course: runSettings.course,
    devices,
    onUpdate(snapshot) {
      latest = snapshot;
      live.update(snapshot, {
        points: answers.reduce((sum, a) => sum + a.points, 0),
        answered: answers.length,
      });
    },
    onKilometer(km) {
      pendingKilometers.push(km);
      askNext();
    },
    onFinish(snapshot) {
      running = false;
      const record = toRunRecord({ snapshot, answers, settings: runSettings, challengeId });
      store.save(record).catch((err) => console.warn('could not save the run', err));
      showResults(snapshot, answers);
    },
    // Real runs only: connection state of the BLE heart rate device. Never fatal —
    // the run keeps going with whatever the last reading was.
    onHeartRateStatus(status) {
      live.setHeartRateStatus(status);
    },
    // Real runs only: GPS is what makes distance move, so its state is always visible.
    onGpsStatus(status) {
      live.setGpsStatus(status);
    },
  });

  function askNext() {
    if (questionOpen || pendingKilometers.length === 0) return;
    const km = pendingKilometers.shift();
    questionOpen = true;
    run.setAnswering(true);
    askQuestion(live.questionSlot, {
      question: runQuestions[km - 1],
      kilometer: km,
      now: run.answerNow,
      onAnswered(answer) {
        answers.push(answer);
        if (latest) {
          live.update(latest, {
            points: answers.reduce((sum, a) => sum + a.points, 0),
            answered: answers.length,
          });
        }
      },
      onClosed() {
        questionOpen = false;
        // The run stays frozen until the answer has been read, so reading time
        // cannot add simulated distance at high multipliers.
        run.setAnswering(false);
        run.noteAnswered();
        askNext();
      },
    });
  }

  const { library } = await libraryLoad;
  runQuestions = questionIds
    ? questionIds.map((id) => library.questions.find((q) => q.id === id)).filter(Boolean)
    : selectRunQuestions(library, questionCountOf(runSettings.course));
  if (runQuestions.length < questionCountOf(runSettings.course)) {
    console.warn('challenge questions missing from the library; filling with defaults');
    const fill = selectRunQuestions(library, questionCountOf(runSettings.course));
    runQuestions = fill.map((q, i) => runQuestions[i] ?? q);
  }
  starting = false;
  live.enableScrub();
  run.start();
}

function showResults(snapshot, answers) {
  starting = false;
  renderNav(nav, { active: 'run' });
  renderResults(root, {
    snapshot,
    answers,
    onRestart: showRoute,
    historyHref: routeHref('history'),
  });
}

window.addEventListener('hashchange', showRoute);
showRoute();