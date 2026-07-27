import { EchoGame } from './game.js';
import {
  FINGER_MAP,
  KEYBOARD_ROWS,
  LANGUAGES,
  MISSION_DEFS,
  validateCurriculum
} from './data.js';
import {
  completeMission,
  loadSave,
  persistSave,
  recordKey,
  resetSave
} from './save.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let save = loadSave();
let selectedMission = MISSION_DEFS[clampMission(save.selectedMission) - 1];
let currentScreen = 'menu';

const ui = {
  hud: $('#hud'),
  typing: $('#typingDuel'),
  crosshair: $('#crosshair'),
  missionName: $('#missionName'),
  objective: $('#objectiveText'),
  distance: $('#distance'),
  routeBar: $('#routeBar'),
  healthValue: $('#healthValue'),
  healthBar: $('#healthBar'),
  shieldBar: $('#shieldBar'),
  dashBar: $('#dashBar'),
  wpm: $('#wpmValue'),
  accuracy: $('#accuracyValue'),
  combo: $('#comboValue'),
  threatBar: $('#threatBar'),
  enemyHealth: $('#enemyHealth'),
  enemyName: $('#enemyName'),
  prompt: $('#typingPrompt'),
  typedWrong: $('#typedWrong'),
  fingerHint: $('#fingerHint'),
  perfect: $('#perfectWord'),
  announcement: $('#announcement'),
  damageFlash: $('#damageFlash'),
  dashFlash: $('#dashFlash')
};

const game = new EchoGame($('#gameCanvas'), ui, {
  getSettings: () => save.settings,
  getRollingWpm: () => save.rollingWpm,
  onKey: (expected, correct) => {
    recordKey(save, expected, correct);
  },
  onTypingHint: (key) => highlightKeyboardKey(key),
  onMissionStart: (mission) => {
    save.selectedMission = mission.number;
    selectedMission = mission;
    persistSave(save);
    configureKeyboard(mission);
    hideAllScreens();
  },
  onPause: () => showScreen('pause'),
  onComplete: (result) => showResults(result)
});

function clampMission(number) {
  return Math.min(18, Math.max(1, Number(number) || 1));
}

function displayKeys(keys) {
  return keys.map((key) => {
    if (key === ' ') return 'LEERTASTE';
    if (key === 'ß') return 'ß';
    return key.toUpperCase();
  }).join(' · ');
}

function hideAllScreens() {
  $$('.screen').forEach((screen) => screen.classList.add('hidden'));
  currentScreen = 'game';
}

function showScreen(name) {
  $$('.screen').forEach((screen) => screen.classList.add('hidden'));
  const target = $(`#screen-${name}`);
  target?.classList.remove('hidden');
  currentScreen = name;
  if (name !== 'pause' && name !== 'result') {
    game.stop();
  }
  if (name === 'missions') renderMissions();
  if (name === 'stats') renderStats();
}

function renderMissions() {
  const grid = $('#missionGrid');
  grid.replaceChildren();
  for (const mission of MISSION_DEFS) {
    const result = save.missions[mission.number];
    const button = document.createElement('button');
    button.className = `mission-card biome-${mission.biome}${mission.number === selectedMission.number ? ' selected' : ''}`;
    button.innerHTML = `
      <span class="mission-index">${String(mission.number).padStart(2, '0')}</span>
      <span class="mission-biome">${mission.biomeName}</span>
      <strong>${mission.title}</strong>
      <small>${mission.newKeys.length ? `NEU: ${displayKeys(mission.newKeys)}` : 'WIEDERHOLUNG'}</small>
      <span class="mission-record">${result ? `${result.bestRank} · ${Math.round(result.bestWpm)} WPM · ${Math.round(result.bestAccuracy * 100)}%` : 'NOCH NICHT GESPIELT'}</span>
    `;
    button.addEventListener('click', () => {
      selectedMission = mission;
      save.selectedMission = mission.number;
      persistSave(save);
      renderMissions();
      updateMissionPreview();
    });
    grid.append(button);
  }
  updateMissionPreview();
}

function updateMissionPreview() {
  $('#selectedMissionTitle').textContent = `${String(selectedMission.number).padStart(2, '0')} · ${selectedMission.title}`;
  $('#selectedMissionTask').textContent = selectedMission.task;
  $('#selectedMissionKeys').textContent = selectedMission.newKeys.length
    ? displayKeys(selectedMission.newKeys)
    : 'ALLE BISHERIGEN TASTEN';
}

function renderLanguages() {
  const list = $('#languageList');
  list.replaceChildren();
  for (const language of LANGUAGES) {
    const item = document.createElement('button');
    item.className = `language-card${language.available ? ' active' : ' disabled'}`;
    item.disabled = !language.available;
    item.innerHTML = `
      <span>${language.layout}</span>
      <strong>${language.name}</strong>
      <small>${language.available ? 'AKTIV' : 'KOMMT SPÄTER'}</small>
    `;
    list.append(item);
  }
}

function renderKeyboard() {
  const keyboard = $('#keyboard');
  keyboard.replaceChildren();
  KEYBOARD_ROWS.forEach((row, rowIndex) => {
    const rowElement = document.createElement('div');
    rowElement.className = `keyboard-row row-${rowIndex}`;
    for (const key of row) {
      const keyElement = document.createElement('span');
      keyElement.className = `key finger-${FINGER_MAP[key] || 'unknown'}`;
      keyElement.dataset.key = key;
      keyElement.textContent = key.toUpperCase();
      rowElement.append(keyElement);
    }
    keyboard.append(rowElement);
  });
  const space = document.createElement('span');
  space.className = 'key space-key finger-TH';
  space.dataset.key = ' ';
  space.textContent = 'LEERTASTE';
  keyboard.append(space);
}

function configureKeyboard(mission) {
  const allowed = new Set(mission.allowed.toLowerCase());
  const newKeys = new Set(mission.newKeys.map((key) => key.toLowerCase()));
  $$('#keyboard .key').forEach((key) => {
    const value = key.dataset.key;
    key.classList.toggle('learned', allowed.has(value));
    key.classList.toggle('new-key', newKeys.has(value));
    key.classList.remove('next-key');
  });
  $('#keyboardHelp').classList.toggle('hidden', save.settings.fingerHelp === false);
}

function highlightKeyboardKey(key) {
  $$('#keyboard .key').forEach((element) => {
    element.classList.toggle('next-key', element.dataset.key === key);
  });
}

function renderStats() {
  const completed = Object.values(save.missions).filter((mission) => mission.completed).length;
  const keyEntries = Object.entries(save.keyStats);
  const totalCorrect = keyEntries.reduce((sum, [, stats]) => sum + stats.correct, 0);
  const totalErrors = keyEntries.reduce((sum, [, stats]) => sum + stats.errors, 0);
  const accuracy = totalCorrect + totalErrors
    ? Math.round((totalCorrect / (totalCorrect + totalErrors)) * 100)
    : 100;
  $('#statMissions').textContent = `${completed} / 18`;
  $('#statWpm').textContent = `${Math.round(save.rollingWpm)}`;
  $('#statAccuracy').textContent = `${accuracy}%`;
  $('#statKeystrokes').textContent = `${totalCorrect + totalErrors}`;

  const problemList = $('#problemKeys');
  problemList.replaceChildren();
  const problems = keyEntries
    .filter(([, stats]) => stats.correct + stats.errors >= 3)
    .map(([key, stats]) => ({
      key,
      accuracy: stats.correct / (stats.correct + stats.errors),
      attempts: stats.correct + stats.errors
    }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 8);
  if (!problems.length) {
    problemList.innerHTML = '<p>Noch keine problematischen Tasten erkannt.</p>';
  } else {
    for (const problem of problems) {
      const row = document.createElement('div');
      row.innerHTML = `
        <strong>${problem.key === 'space' ? 'LEERTASTE' : problem.key.toUpperCase()}</strong>
        <span><i style="width:${Math.round(problem.accuracy * 100)}%"></i></span>
        <small>${Math.round(problem.accuracy * 100)}%</small>
      `;
      problemList.append(row);
    }
  }
}

function showResults(result) {
  if (!result.training) completeMission(save, result.mission.number, result);
  persistSave(save);
  $('#resultLabel').textContent = result.training ? 'TRAINING BEENDET' : 'MISSION ABGESCHLOSSEN';
  $('#resultTitle').textContent = result.mission.title;
  $('#resultRank').textContent = result.rank;
  $('#resultWpm').textContent = result.wpm;
  $('#resultAccuracy').textContent = `${Math.round(result.accuracy * 100)}%`;
  $('#resultErrors').textContent = result.errors;
  $('#resultStreak').textContent = result.streak;
  $('#resultDodges').textContent = result.dodges;
  $('#resultTime').textContent = formatTime(result.time);
  showScreen('result');
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function startSelected(training = false) {
  game.startMission(selectedMission, { training });
}

function bindButtons() {
  $$('[data-screen]').forEach((button) => {
    button.addEventListener('click', () => showScreen(button.dataset.screen));
  });
  $('#continueButton').addEventListener('click', () => startSelected(false));
  $('#missionStartButton').addEventListener('click', () => startSelected(false));
  $('#trainingButton').addEventListener('click', () => startSelected(true));
  $('#resumeButton').addEventListener('click', () => {
    hideAllScreens();
    game.resume();
  });
  $('#pauseRestartButton').addEventListener('click', () => startSelected(false));
  $('#pauseMenuButton').addEventListener('click', () => showScreen('menu'));
  $('#resultReplayButton').addEventListener('click', () => startSelected(false));
  $('#resultMissionsButton').addEventListener('click', () => showScreen('missions'));

  const controls = {
    sensitivity: $('#sensitivity'),
    volume: $('#volume'),
    adaptive: $('#adaptive'),
    reducedMotion: $('#reducedMotion'),
    fingerHelp: $('#fingerHelp'),
    subtitles: $('#subtitles'),
    quality: $('#quality')
  };
  controls.sensitivity.value = save.settings.sensitivity;
  controls.volume.value = save.settings.volume;
  controls.adaptive.checked = save.settings.adaptive;
  controls.reducedMotion.checked = save.settings.reducedMotion;
  controls.fingerHelp.checked = save.settings.fingerHelp;
  controls.subtitles.checked = save.settings.subtitles;
  controls.quality.value = save.settings.quality;

  Object.entries(controls).forEach(([name, element]) => {
    element.addEventListener('change', () => {
      let value = element.type === 'checkbox' ? element.checked : element.value;
      if (name === 'sensitivity' || name === 'volume') value = Number(value);
      save.settings[name] = value;
      persistSave(save);
      configureKeyboard(selectedMission);
    });
  });

  $('#resetProgress').addEventListener('click', () => {
    if (!confirm('Gesamten Lernfortschritt wirklich löschen?')) return;
    save = resetSave();
    selectedMission = MISSION_DEFS[0];
    renderStats();
    renderMissions();
  });
}

renderLanguages();
renderKeyboard();
configureKeyboard(selectedMission);
bindButtons();
updateMissionPreview();

const curriculumIssues = validateCurriculum();
if (curriculumIssues.length) {
  console.error('Ungültiges Curriculum', curriculumIssues);
  $('#bootError').classList.remove('hidden');
} else {
  $('#bootError').remove();
}

showScreen('menu');
