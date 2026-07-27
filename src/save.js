const SAVE_KEY = 'echoFallSaveV2';

function defaults() {
  return {
    version: 2,
    language: 'de-DE',
    selectedMission: 1,
    missions: {},
    keyStats: {},
    rollingWpm: 12,
    rollingAccuracy: 1,
    totalPlayTime: 0,
    settings: {
      sensitivity: 0.002,
      adaptive: true,
      reducedMotion: false,
      fingerHelp: true,
      subtitles: true,
      volume: 0.7,
      quality: 'high'
    }
  };
}

export function loadSave() {
  const base = defaults();
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!parsed || parsed.version !== 2) return base;
    return {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings || {}) },
      missions: parsed.missions || {},
      keyStats: parsed.keyStats || {}
    };
  } catch {
    return base;
  }
}

export function persistSave(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // The game remains playable when storage is unavailable.
  }
}

export function resetSave() {
  const save = defaults();
  persistSave(save);
  return save;
}

export function recordKey(save, expected, correct) {
  const key = expected === ' ' ? 'space' : expected.toLowerCase();
  const entry = save.keyStats[key] || { correct: 0, errors: 0 };
  if (correct) entry.correct += 1;
  else entry.errors += 1;
  save.keyStats[key] = entry;
}

export function completeMission(save, missionNumber, result) {
  const previous = save.missions[missionNumber] || {};
  save.missions[missionNumber] = {
    completed: true,
    bestWpm: Math.max(previous.bestWpm || 0, result.wpm),
    bestAccuracy: Math.max(previous.bestAccuracy || 0, result.accuracy),
    bestRank: betterRank(previous.bestRank, result.rank),
    bestTime: previous.bestTime
      ? Math.min(previous.bestTime, result.time)
      : result.time
  };
  save.rollingWpm = save.rollingWpm * 0.75 + result.wpm * 0.25;
  save.rollingAccuracy = save.rollingAccuracy * 0.75 + result.accuracy * 0.25;
  persistSave(save);
}

function betterRank(a, b) {
  const value = { S: 5, A: 4, B: 3, C: 2, D: 1 };
  return (value[b] || 0) > (value[a] || 0) ? b : (a || b);
}
