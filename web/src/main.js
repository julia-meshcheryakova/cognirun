import './style.css';
import { QUESTIONS } from './questions.js';
import { createRun } from './run.js';
import { renderLive } from './ui/live.js';
import { renderResults } from './ui/results.js';
import { renderSetup } from './ui/setup.js';
import { askQuestion } from './ui/question.js';

const root = document.querySelector('#app');
const settings = { demo: true, multiplier: 1 };

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

function startRun() {
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
      question: QUESTIONS[km - 1],
      kilometer: km,
      now: run.answerNow,
      onAnswered(answer) {
        answers.push(answer);
        run.setAnswering(false);
        if (latest) {
          live.update(latest, {
            points: answers.reduce((sum, a) => sum + a.points, 0),
            answered: answers.length,
          });
        }
      },
      onClosed() {
        questionOpen = false;
        run.noteAnswered();
        askNext();
      },
    });
  }

  if (!settings.demo) {
    run.sensors.connectHeartRate().catch((err) => {
      console.warn('heart rate unavailable', err);
    });
  }
  run.start();
}

function showResults(snapshot, answers) {
  renderResults(root, { snapshot, answers, onRestart: showSetup });
}

showSetup();
