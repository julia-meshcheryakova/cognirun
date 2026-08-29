import './style.css';
import { loadLibrary, selectRunQuestions } from './questions.js';
import { createRun } from './run.js';
import { renderLive } from './ui/live.js';
import { renderResults } from './ui/results.js';
import { renderSetup } from './ui/setup.js';
import { askQuestion } from './ui/question.js';
import { primeAudio } from './beep.js';
import { setVoiceEnabled } from './tts.js';

const root = document.querySelector('#app');
const settings = { demo: true, multiplier: 1, voice: true };
let starting = false;

function showSetup() {
  renderSetup(root, {
    settings,
    onChange(patch) {
      Object.assign(settings, patch);
      showSetup();
    },
    onStart: startRun,
  });
}

async function startRun() {
  if (starting) return;
  starting = true;

  primeAudio(); // still inside the click gesture that started the run
  setVoiceEnabled(settings.voice);

  // One question per category (km1 trivia, km2 logic, km3 maths), from the question
  // server when it is up and from the bundled library otherwise. Started, not
  // awaited, so pairing below still runs inside the Start click.
  const libraryLoad = loadLibrary();
  let runQuestions = [];

  const answers = [];
  const pendingKilometers = [];
  let questionOpen = false;
  let latest = null;

  const live = renderLive(root, {
    settings,
    onMultiplier(value) {
      settings.multiplier = value;
      run.setMultiplier(value);
    },
    onScrub(meters) {
      run.scrubTo(meters);
    },
  });

  const run = createRun({
    demo: settings.demo,
    multiplier: settings.multiplier,
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
      showResults(snapshot, answers);
    },
    onError(message) {
      alert(message);
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

  // Web Bluetooth needs the Start click's user activation, so pair before awaiting.
  if (!settings.demo) {
    run.sensors.connectHeartRate().catch((err) => {
      console.warn('heart rate unavailable', err);
    });
  }

  const { library } = await libraryLoad;
  runQuestions = selectRunQuestions(library);
  starting = false;
  live.enableScrub();
  run.start();
}

function showResults(snapshot, answers) {
  renderResults(root, { snapshot, answers, onRestart: showSetup });
}

showSetup();
