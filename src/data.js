export const KEYBOARD_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p', 'ü'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ö', 'ä'],
  ['y', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '-']
];

export const FINGER_MAP = {
  q: 'L5', a: 'L5', y: 'L5',
  w: 'L4', s: 'L4', x: 'L4',
  e: 'L3', d: 'L3', c: 'L3',
  r: 'L2', f: 'L2', v: 'L2', t: 'L2', g: 'L2', b: 'L2',
  z: 'R2', h: 'R2', n: 'R2', u: 'R2', j: 'R2', m: 'R2',
  i: 'R3', k: 'R3', ',': 'R3',
  o: 'R4', l: 'R4', '.': 'R4',
  p: 'R5', ö: 'R5', ä: 'R5', ü: 'R5', ß: 'R5', '-': 'R5',
  ' ': 'TH'
};

export const FINGER_NAMES = {
  L5: 'Linker kleiner Finger',
  L4: 'Linker Ringfinger',
  L3: 'Linker Mittelfinger',
  L2: 'Linker Zeigefinger',
  R2: 'Rechter Zeigefinger',
  R3: 'Rechter Mittelfinger',
  R4: 'Rechter Ringfinger',
  R5: 'Rechter kleiner Finger',
  TH: 'Daumen'
};

export const BIOMES = {
  vault: {
    name: 'Signalgewölbe',
    sky: 0x07141b,
    fog: 0x07141b,
    ground: 0x14252c,
    rock: 0x1c3239,
    metal: 0x263b43,
    accent: 0x70fff1,
    danger: 0xff6b58,
    weather: 'dust'
  },
  foundry: {
    name: 'Rostgießerei',
    sky: 0x1b0d09,
    fog: 0x2a110b,
    ground: 0x38241d,
    rock: 0x492b20,
    metal: 0x302722,
    accent: 0xffb45b,
    danger: 0xff5147,
    weather: 'embers'
  },
  canyon: {
    name: 'Regenschlucht',
    sky: 0x06141b,
    fog: 0x0b2830,
    ground: 0x18333a,
    rock: 0x10252c,
    metal: 0x263c42,
    accent: 0x55eaff,
    danger: 0xff5a64,
    weather: 'rain'
  },
  city: {
    name: 'Hängende Stadt',
    sky: 0x101022,
    fog: 0x17172e,
    ground: 0x27263a,
    rock: 0x1b1b2c,
    metal: 0x33344d,
    accent: 0xb7a2ff,
    danger: 0xff657f,
    weather: 'mist'
  },
  roots: {
    name: 'Wurzelwerk',
    sky: 0x081714,
    fog: 0x102920,
    ground: 0x24372d,
    rock: 0x15251f,
    metal: 0x293c34,
    accent: 0x8cff9b,
    danger: 0xff7358,
    weather: 'spores'
  },
  spire: {
    name: 'Sendeturm',
    sky: 0x090d16,
    fog: 0x151d2a,
    ground: 0x26303c,
    rock: 0x171e28,
    metal: 0x34404c,
    accent: 0xffd36b,
    danger: 0xff4f61,
    weather: 'snow'
  }
};

const LESSONS = [
  {
    title: 'Erster Impuls',
    biome: 'vault',
    newKeys: ['f', 'j', ' '],
    task: 'Finde die Grundstellung und verlasse die Initialkammer.',
    prompts: ['fj', 'jf', 'ff jj', 'fj jf', 'fff jjj']
  },
  {
    title: 'Getrennte Signale',
    biome: 'vault',
    newKeys: ['d', 'k'],
    task: 'Überquere die ersten Plattformen und synchronisiere beide Hände.',
    prompts: ['dk', 'kd', 'fd jk', 'df kj', 'fdk jkd']
  },
  {
    title: 'Rhythmusbruch',
    biome: 'vault',
    newKeys: ['s', 'l'],
    task: 'Durchbrich die Patrouillenlinie im Takt.',
    prompts: ['sl', 'ls', 'sdf jkl', 'fd sl', 'fl', 'fjs lkd']
  },
  {
    title: 'Äußere Ringe',
    biome: 'foundry',
    newKeys: ['a', 'ö'],
    task: 'Durchquere die glühende Förderanlage.',
    prompts: ['das', 'als', 'fall', 'saal', 'öl', 'das öl']
  },
  {
    title: 'Jagdlicht',
    biome: 'foundry',
    newKeys: ['g', 'h', 'ä'],
    task: 'Jage den Wächter durch die Gießhalle.',
    prompts: ['jagd', 'glas', 'hall', 'das glas', 'häll', 'sag das']
  },
  {
    title: 'Wächterkern',
    biome: 'foundry',
    newKeys: [],
    task: 'Besiege den Gießerei-Wächter mit der gesamten Grundreihe.',
    prompts: ['das glas', 'jagd hall', 'sag das', 'falls das glas', 'jag das']
  },
  {
    title: 'Sprung nach oben',
    biome: 'canyon',
    newKeys: ['r', 'u'],
    task: 'Nutze den Dash, um die Regenschlucht zu überwinden.',
    prompts: ['uhr', 'grau', 'raus', 'jahr', 'frau', 'ruf das']
  },
  {
    title: 'Leise Frequenz',
    biome: 'canyon',
    newKeys: ['e', 'i'],
    task: 'Steige durch die überfluteten Ruinen.',
    prompts: ['reise', 'hier', 'feuer', 'leise', 'erde', 'freie reise']
  },
  {
    title: 'Wort im Sturm',
    biome: 'canyon',
    newKeys: ['w', 'o'],
    task: 'Entkomme der Jagd durch das Gewitter.',
    prompts: ['wolle', 'welle', 'radio', 'wolke', 'wieder', 'das radio hall']
  },
  {
    title: 'Kleine Finger',
    biome: 'city',
    newKeys: ['q', 'p'],
    task: 'Erreiche die schwebenden Transitstege.',
    prompts: ['puls', 'pool', 'quer', 'pose', 'gruppe', 'puls hier']
  },
  {
    title: 'Präzisionsfenster',
    biome: 'city',
    newKeys: ['t', 'z', 'ü'],
    task: 'Weiche den Präzisionsschützen der Stadt aus.',
    prompts: ['zeit', 'tür', 'türe', 'ziel', 'präzise', 'tür zu ziel']
  },
  {
    title: 'Scharfschütze',
    biome: 'city',
    newKeys: [],
    task: 'Stürme die höchste Brücke und unterbrich den Schuss.',
    prompts: ['der puls wird stärker', 'tür der stadt', 'folge der route', 'präzise ruhig']
  },
  {
    title: 'Unterstrom',
    biome: 'roots',
    newKeys: ['v', 'b', 'n', 'm'],
    task: 'Rutsche durch die versunkenen Versorgungsschächte.',
    prompts: ['nebel', 'munition', 'bewegung', 'verbunden', 'nummer', 'immer voran']
  },
  {
    title: 'Störmatrix',
    biome: 'roots',
    newKeys: ['c', 'x'],
    task: 'Zerstöre die Störsender im Wurzelwerk.',
    prompts: ['matrix', 'code', 'echo', 'wechsel', 'technik', 'echo im code']
  },
  {
    title: 'Syntaxpfad',
    biome: 'roots',
    newKeys: ['y', ',', '.'],
    task: 'Entschlüssle die erste vollständige Übertragung.',
    prompts: ['system', 'syntax', 'tempo, ziel.', 'code, wort, echo.', 'das system lebt.']
  },
  {
    title: 'Vollständiges Signal',
    biome: 'spire',
    newKeys: [],
    task: 'Erreiche den Fuß des Sendeturms.',
    prompts: ['der weg führt zum turm.', 'jede taste wird zur waffe.', 'weiche aus und bleib im takt.']
  },
  {
    title: 'Große Worte',
    biome: 'spire',
    newKeys: ['Shift', 'ß', '?', '!'],
    task: 'Öffne das letzte Sicherheitstor.',
    prompts: ['Das Signal wächst!', 'Bist du bereit?', 'Grüße aus der Tiefe.', 'Schließe den Kreis!']
  },
  {
    title: 'Last Echo',
    biome: 'spire',
    newKeys: [],
    task: 'Übertrage die letzte Nachricht an der Gipfelantenne.',
    prompts: [
      'Jeder Anschlag trägt die Nachricht weiter.',
      'Geschwindigkeit ist Feuerkraft, Genauigkeit ist Rüstung.',
      'Das letzte Echo darf niemals verstummen!',
      'Wir schreiben unsere Zukunft selbst.'
    ]
  }
];

let cumulative = '';
const normalizedAdditions = [
  'fj ',
  'dk',
  'sl',
  'aö',
  'ghä',
  '',
  'ru',
  'ei',
  'wo',
  'qp',
  'tzü',
  '',
  'vbnm',
  'cx',
  'y,.',
  '',
  'ß?!ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ''
];

export const MISSION_DEFS = LESSONS.map((lesson, index) => {
  cumulative += normalizedAdditions[index];
  const missionNumber = index + 1;
  return {
    id: `mission-${String(missionNumber).padStart(2, '0')}`,
    number: missionNumber,
    title: lesson.title,
    biome: lesson.biome,
    biomeName: BIOMES[lesson.biome].name,
    newKeys: lesson.newKeys,
    task: lesson.task,
    prompts: lesson.prompts,
    allowed: cumulative,
    targetWpm: Math.min(42, 8 + index * 2),
    seed: 19 + index * 37,
    boss: missionNumber % 6 === 0 || missionNumber === 18,
    routeDifficulty: Math.floor(index / 3),
    recommended: true
  };
});

export const LANGUAGES = [
  { id: 'de-DE', name: 'Deutsch', layout: 'QWERTZ', available: true },
  { id: 'en-US', name: 'English', layout: 'QWERTY', available: false },
  { id: 'fr-FR', name: 'Français', layout: 'AZERTY', available: false },
  { id: 'es-ES', name: 'Español', layout: 'QWERTY', available: false }
];

export const ENEMY_TYPES = {
  scout: { label: 'SPÄHER', health: 28, damage: 12, threat: 0.13, color: 0xff685d },
  soldier: { label: 'JÄGER', health: 68, damage: 18, threat: 0.16, color: 0xff8f55 },
  sniper: { label: 'PRÄZISIONSKERN', health: 82, damage: 27, threat: 0.11, color: 0xff4e72 },
  disruptor: { label: 'STÖRMATRIX', health: 95, damage: 18, threat: 0.18, color: 0xc96bff },
  tank: { label: 'PANZERKERN', health: 145, damage: 24, threat: 0.2, color: 0xffb24f },
  boss: { label: 'ARCHIV-WÄCHTER', health: 340, damage: 25, threat: 0.2, color: 0xffd66e }
};

export function promptForMission(mission, enemyType, sequence = 0) {
  const pool = mission.prompts;
  if (enemyType === 'scout') {
    const compact = pool.filter((entry) => entry.length <= 8);
    return (compact.length ? compact : pool)[sequence % (compact.length || pool.length)];
  }
  if (enemyType === 'boss') {
    return pool[(sequence * 3 + 1) % pool.length];
  }
  return pool[(sequence * 2 + mission.number) % pool.length];
}

export function validateCurriculum() {
  const issues = [];
  for (const mission of MISSION_DEFS) {
    const allowed = new Set([...mission.allowed, ...mission.allowed.toUpperCase()]);
    for (const prompt of mission.prompts) {
      for (const char of prompt) {
        if (!allowed.has(char)) {
          issues.push(`${mission.id}: "${char}" in "${prompt}" ist nicht freigeschaltet`);
        }
      }
    }
  }
  return issues;
}
