const SAVE_KEY = 'echoFallGameplayDirectorV1';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const NUMBER_PATTERNS = {
  correct: /correct|typed|character|char|streak|combo/i,
  error: /error|mistake|wrong|miss|fault/i,
  progress: /index|cursor|typed|character|char|progress/i,
  threat: /threat|danger|charge|attackProgress/i
};

const SHIELD_KEYS = ['shield', 'armor'];
const SHIELD_MAX_KEYS = ['maxShield', 'shieldMax', 'maxArmor'];
const HEALTH_KEYS = ['health', 'hp', 'life'];
const HEALTH_MAX_KEYS = ['maxHealth', 'healthMax', 'maxHp'];
const THREAT_KEYS = ['threat', 'danger', 'attackProgress', 'charge'];

function snapshotNumbers(source) {
  const result = {};
  if (!source || typeof source !== 'object') return result;
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'number' && Number.isFinite(value)) result[key] = value;
  }
  return result;
}

function positiveDelta(before, after, pattern) {
  for (const [key, value] of Object.entries(after)) {
    if (!pattern.test(key)) continue;
    if (value > (before[key] ?? value) + 0.0001) return true;
  }
  return false;
}

function findNumericKey(source, candidates) {
  if (!source) return null;
  return candidates.find((key) => typeof source[key] === 'number') || null;
}

function findNumberByPattern(numbers, pattern) {
  for (const [key, value] of Object.entries(numbers)) {
    if (pattern.test(key)) return { key, value };
  }
  return null;
}

function readPrompt(enemy) {
  if (!enemy) return null;
  const textKeys = ['text', 'prompt', 'phrase', 'targetText', 'currentText', 'sequence', 'word'];
  const indexKeys = ['typedIndex', 'charIndex', 'textIndex', 'cursor', 'index', 'progress'];
  const textKey = textKeys.find((key) => typeof enemy[key] === 'string');
  const indexKey = indexKeys.find((key) => Number.isInteger(enemy[key]));
  if (!textKey) return null;
  return {
    text: enemy[textKey],
    index: indexKey ? enemy[indexKey] : 0,
    indexKey
  };
}

function normalizeKey(key) {
  if (key === 'Spacebar') return ' ';
  if (key === 'Enter') return '\n';
  return key;
}

function loadStats() {
  const defaults = {
    version: 1,
    missions: 0,
    encounters: 0,
    enemiesDefeated: 0,
    correctCharacters: 0,
    errors: 0,
    perfectWords: 0,
    bestStreak: 0,
    overdrives: 0,
    movementChains: 0,
    phaseDodges: 0,
    lastStands: 0
  };
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? { ...defaults, ...parsed, version: 1 } : defaults;
  } catch {
    return defaults;
  }
}

export class GameplayDirector {
  constructor() {
    this.game = null;
    this.stats = loadStats();
    this.flow = 0;
    this.pressure = 0.24;
    this.streak = 0;
    this.wordErrors = 0;
    this.overdrive = 0;
    this.lastDamageAt = -Infinity;
    this.lastStandReadyAt = 0;
    this.missionStartedAt = 0;
    this.encounterStartedAt = 0;
    this.lastFrameAt = 0;
    this.lastSaveAt = 0;
    this.movementEvents = [];
    this.knownEnemies = new Set();
    this.countedEnemies = new WeakSet();
    this.enemyStates = new WeakMap();
    this.accuracyWindow = [];
    this.mutator = 'balanced';
    this.attached = false;
  }

  attach(game) {
    if (this.attached) return;
    this.attached = true;
    this.game = game;

    this.wrapAfter('startMission', (args) => this.onMissionStart(args[0], args[1]));
    this.wrapAround('handleTyping', (args) => this.beforeTyping(args[0]), (context) => this.afterTyping(context));
    this.wrapAfter('enterFocus', (args) => this.onEncounterStart(args[0]));
    this.wrapAfter('leaveFocus', () => this.onEncounterEnd());
    this.wrapAfter('phaseDash', () => this.onPhaseDodge());
    this.wrapAfter('startDash', () => this.recordMovement('dash'));
    this.wrapAfter('completeMission', () => this.onMissionComplete());

    for (const name of ['damagePlayer', 'takeDamage', 'hurtPlayer', 'applyDamage']) {
      this.wrapAround(name, () => this.captureVitals(), (context) => this.afterDamage(context));
    }

    for (const name of ['defeatEnemy', 'killEnemy', 'destroyEnemy']) {
      this.wrapAfter(name, (args) => this.onEnemyDefeated(args[0]));
    }

    this.keyHandler = (event) => this.onKeyDown(event);
    this.saveHandler = () => this.save();
    window.addEventListener('keydown', this.keyHandler);
    window.addEventListener('beforeunload', this.saveHandler);

    this.lastFrameAt = performance.now();
    const loop = (time) => {
      const dt = clamp((time - this.lastFrameAt) / 1000, 0, 0.05);
      this.lastFrameAt = time;
      this.tick(dt, time);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  wrapAfter(name, after) {
    const original = this.game?.[name];
    if (typeof original !== 'function' || original.__directorWrapped) return;
    const director = this;
    function wrapped(...args) {
      const result = original.apply(this, args);
      after.call(director, args, result);
      return result;
    }
    wrapped.__directorWrapped = true;
    this.game[name] = wrapped;
  }

  wrapAround(name, before, after) {
    const original = this.game?.[name];
    if (typeof original !== 'function' || original.__directorWrapped) return;
    const director = this;
    function wrapped(...args) {
      const context = before.call(director, args);
      const result = original.apply(this, args);
      after.call(director, context, args, result);
      return result;
    }
    wrapped.__directorWrapped = true;
    this.game[name] = wrapped;
  }

  onMissionStart(mission) {
    this.flow = 0;
    this.pressure = 0.2;
    this.streak = 0;
    this.wordErrors = 0;
    this.overdrive = 0;
    this.missionStartedAt = performance.now();
    this.lastDamageAt = -Infinity;
    this.lastStandReadyAt = 0;
    this.movementEvents.length = 0;
    this.knownEnemies.clear();
    this.countedEnemies = new WeakSet();
    this.enemyStates = new WeakMap();
    this.accuracyWindow.length = 0;

    const number = mission?.number ?? 1;
    const mutators = ['balanced', 'momentum', 'precision', 'surge', 'resilience'];
    this.mutator = mutators[(number - 1) % mutators.length];
    this.stats.missions += 1;
  }

  onMissionComplete() {
    this.stats.bestStreak = Math.max(this.stats.bestStreak, this.streak);
    this.save();
  }

  onEncounterStart(enemy) {
    this.encounterStartedAt = performance.now();
    this.wordErrors = 0;
    this.stats.encounters += 1;
    if (enemy) this.prepareEnemy(enemy);
  }

  onEncounterEnd() {
    this.wordErrors = 0;
    this.pressure = clamp(this.pressure - 0.06, 0.08, 1);
  }

  beforeTyping(event) {
    const enemy = this.game?.state?.focusedEnemy || null;
    return {
      key: normalizeKey(event?.key || ''),
      enemy,
      stateBefore: snapshotNumbers(this.game?.state),
      enemyBefore: snapshotNumbers(enemy),
      promptBefore: readPrompt(enemy)
    };
  }

  afterTyping(context) {
    if (!context || !context.key || context.key === 'Backspace' || context.key === 'Escape') return;
    const enemyAfter = this.game?.state?.focusedEnemy || context.enemy;
    const stateAfter = snapshotNumbers(this.game?.state);
    const enemyAfterNumbers = snapshotNumbers(enemyAfter);
    const promptAfter = readPrompt(enemyAfter);
    const enemyChanged = Boolean(context.enemy && this.game?.state?.focusedEnemy !== context.enemy);

    const errorIncreased = positiveDelta(context.stateBefore, stateAfter, NUMBER_PATTERNS.error);
    const correctIncreased = positiveDelta(context.stateBefore, stateAfter, NUMBER_PATTERNS.correct);
    const enemyProgressBefore = findNumberByPattern(context.enemyBefore, NUMBER_PATTERNS.progress);
    const enemyProgressAfter = findNumberByPattern(enemyAfterNumbers, NUMBER_PATTERNS.progress);
    const threatBefore = findNumberByPattern(context.enemyBefore, NUMBER_PATTERNS.threat);
    const threatAfter = findNumberByPattern(enemyAfterNumbers, NUMBER_PATTERNS.threat);
    const progressAdvanced = Boolean(
      enemyProgressBefore
      && enemyProgressAfter
      && enemyProgressAfter.value > enemyProgressBefore.value
    );
    const threatJumped = Boolean(
      threatBefore
      && threatAfter
      && threatAfter.value > threatBefore.value + this.threatUnit(context.enemy) * 0.015
    );
    const expected = context.promptBefore?.text?.[context.promptBefore.index];
    const promptMatches = expected !== undefined && context.key === expected;

    if (errorIncreased || (!correctIncreased && !progressAdvanced && threatJumped)) {
      this.onTypingError(context);
      return;
    }

    if (correctIncreased || progressAdvanced || promptMatches || enemyChanged) {
      this.onCorrectCharacter(context);
      const progressReset = Boolean(
        context.promptBefore
        && promptAfter
        && context.promptBefore.index > 0
        && promptAfter.index <= context.promptBefore.index
      );
      if (progressReset || enemyChanged) this.onWordComplete();
    }
  }

  onCorrectCharacter() {
    this.stats.correctCharacters += 1;
    this.streak += 1;
    this.stats.bestStreak = Math.max(this.stats.bestStreak, this.streak);
    this.accuracyWindow.push(1);
    if (this.accuracyWindow.length > 80) this.accuracyWindow.shift();

    const flowGain = this.mutator === 'surge' ? 5.2 : this.mutator === 'precision' ? 4.6 : 4;
    this.flow = clamp(this.flow + flowGain, 0, 100);
    this.pressure = clamp(this.pressure - 0.006, 0.08, 1);

    if (this.streak % 12 === 0) this.restoreShield(2);
    if (this.streak % 24 === 0) {
      const player = this.game?.player;
      if (player && typeof player.dashCooldown === 'number') player.dashCooldown *= 0.25;
      if (player && 'airDash' in player) player.airDash = true;
    }
    if (this.flow >= 100 && this.overdrive <= 0) this.beginOverdrive();
  }

  onTypingError(context) {
    this.stats.errors += 1;
    this.wordErrors += 1;
    this.accuracyWindow.push(0);
    if (this.accuracyWindow.length > 80) this.accuracyWindow.shift();

    const protectedStreak = this.streak >= 15;
    if (protectedStreak && context?.enemy) {
      const key = findNumericKey(context.enemy, THREAT_KEYS);
      if (key && typeof context.enemyBefore[key] === 'number') {
        const current = context.enemy[key];
        const prior = context.enemyBefore[key];
        context.enemy[key] = prior + (current - prior) * 0.35;
      }
    }

    this.streak = 0;
    this.flow = clamp(this.flow - (protectedStreak ? 8 : 18), 0, 100);
    this.pressure = clamp(this.pressure + 0.055, 0.08, 1);
  }

  onWordComplete() {
    if (this.wordErrors === 0) {
      this.stats.perfectWords += 1;
      this.flow = clamp(this.flow + 12, 0, 100);
      this.restoreShield(this.mutator === 'precision' ? 4 : 2);
    }
    this.wordErrors = 0;
  }

  beginOverdrive() {
    this.flow = 65;
    this.overdrive = this.mutator === 'surge' ? 8 : 6;
    this.stats.overdrives += 1;
    this.restoreShield(6);
    const player = this.game?.player;
    if (player && typeof player.dashCooldown === 'number') player.dashCooldown = 0;
    if (player && 'airDash' in player) player.airDash = true;
  }

  onPhaseDodge() {
    this.stats.phaseDodges += 1;
    this.flow = clamp(this.flow + 8, 0, 100);
    this.pressure = clamp(this.pressure - 0.05, 0.08, 1);
  }

  onKeyDown(event) {
    if (event.repeat || this.game?.state?.mode !== 'playing') return;
    if (event.code === 'Space') this.recordMovement('jump');
    if (event.code === 'KeyQ') this.recordMovement('dash');
    if (event.code === 'ControlLeft' || event.code === 'ControlRight') this.recordMovement('slide');
  }

  recordMovement(type) {
    const time = performance.now();
    this.movementEvents.push({ type, time });
    this.movementEvents = this.movementEvents.filter((event) => time - event.time <= 2200);
    const types = new Set(this.movementEvents.map((event) => event.type));
    if (!types.has('jump') || !types.has('dash') || !types.has('slide')) return;

    this.movementEvents.length = 0;
    this.stats.movementChains += 1;
    this.flow = clamp(this.flow + (this.mutator === 'momentum' ? 18 : 10), 0, 100);
    this.pressure = clamp(this.pressure - 0.04, 0.08, 1);
    this.restoreShield(this.mutator === 'momentum' ? 3 : 1);
    const player = this.game?.player;
    if (player && typeof player.dashCooldown === 'number') player.dashCooldown *= 0.2;
    if (player && 'airDash' in player) player.airDash = true;
    if (player && typeof player.extraJump === 'number') player.extraJump = Math.max(1, player.extraJump);
  }

  captureVitals() {
    return {
      player: snapshotNumbers(this.game?.player),
      state: snapshotNumbers(this.game?.state),
      time: performance.now()
    };
  }

  afterDamage(before) {
    this.lastDamageAt = performance.now();
    this.pressure = clamp(this.pressure + 0.08, 0.08, 1);
    this.flow = clamp(this.flow - 10, 0, 100);

    const health = this.findVital(HEALTH_KEYS);
    if (!health || health.value > 0 || performance.now() < this.lastStandReadyAt) return;

    health.source[health.key] = 1;
    this.restoreShield(16);
    this.clearFocusedThreat();
    this.lastStandReadyAt = performance.now() + 90000;
    this.stats.lastStands += 1;
  }

  findVital(keys) {
    for (const source of [this.game?.player, this.game?.state]) {
      const key = findNumericKey(source, keys);
      if (key) return { source, key, value: source[key] };
    }
    return null;
  }

  restoreShield(amount) {
    for (const source of [this.game?.player, this.game?.state]) {
      const key = findNumericKey(source, SHIELD_KEYS);
      if (!key) continue;
      const maxKey = findNumericKey(source, SHIELD_MAX_KEYS);
      const maximum = maxKey ? source[maxKey] : 100;
      source[key] = clamp(source[key] + amount, 0, maximum);
      return true;
    }
    return false;
  }

  clearFocusedThreat() {
    const enemy = this.game?.state?.focusedEnemy;
    const key = findNumericKey(enemy, THREAT_KEYS);
    if (key) enemy[key] = 0;
  }

  threatUnit(enemy) {
    const key = findNumericKey(enemy, THREAT_KEYS);
    if (!key) return 1;
    const value = Math.abs(enemy[key]);
    return value <= 1.5 ? 1 : 100;
  }

  prepareEnemy(enemy) {
    if (!enemy || this.enemyStates.has(enemy)) return;
    const seed = Math.abs(
      Math.floor((enemy.position?.x || enemy.group?.position?.x || 0) * 17)
      + Math.floor((enemy.position?.z || enemy.group?.position?.z || 0) * 31)
      + (this.game?.state?.mission?.number || 1) * 13
    );
    const hintedType = String(enemy.type || enemy.kind || '').toLowerCase();
    let role = ['hunter', 'sentinel', 'suppressor'][seed % 3];
    if (/sniper|scharf/.test(hintedType)) role = 'sentinel';
    if (/scout|spaeher|späher/.test(hintedType)) role = 'hunter';
    if (/tank|panzer|boss/.test(hintedType)) role = 'suppressor';
    this.enemyStates.set(enemy, {
      role,
      phase: (seed % 100) / 100 * Math.PI * 2,
      bornAt: performance.now()
    });
  }

  onEnemyDefeated(enemy) {
    if (!enemy || (typeof enemy === 'object' && this.countedEnemies.has(enemy))) return;
    if (typeof enemy === 'object') this.countedEnemies.add(enemy);
    this.stats.enemiesDefeated += 1;
    this.flow = clamp(this.flow + 16, 0, 100);
    this.pressure = clamp(this.pressure - 0.12, 0.08, 1);
    this.restoreShield(4);
  }

  trackEnemies() {
    const enemies = Array.isArray(this.game?.enemies) ? this.game.enemies : [];
    const current = new Set(enemies);
    for (const enemy of enemies) {
      this.prepareEnemy(enemy);
      this.knownEnemies.add(enemy);
    }
    for (const enemy of this.knownEnemies) {
      if (!current.has(enemy)) {
        this.onEnemyDefeated(enemy);
        this.knownEnemies.delete(enemy);
      }
    }
  }

  currentAccuracy() {
    if (!this.accuracyWindow.length) return 1;
    return this.accuracyWindow.reduce((sum, value) => sum + value, 0) / this.accuracyWindow.length;
  }

  tuneFocusedEnemy(dt, time) {
    const enemy = this.game?.state?.focusedEnemy;
    if (!enemy) return;
    this.prepareEnemy(enemy);
    const threatKey = findNumericKey(enemy, THREAT_KEYS);
    if (!threatKey) return;

    const maximum = this.threatUnit(enemy);
    const state = this.enemyStates.get(enemy);
    const accuracy = this.currentAccuracy();
    const encounterAge = Math.max(0, (time - this.encounterStartedAt) / 1000);
    let modifier = 0;

    if (state.role === 'hunter') {
      modifier = 0.0025 + Math.sin(encounterAge * 2.8 + state.phase) * 0.0015;
    } else if (state.role === 'sentinel') {
      const cycle = encounterAge % 5;
      modifier = cycle > 3.8 ? 0.007 : -0.001;
    } else {
      modifier = 0.0015 + Math.sin(encounterAge * 1.2 + state.phase) * 0.0007;
    }

    modifier += (this.pressure - 0.45) * 0.004;
    if (accuracy < 0.82) modifier -= 0.0045;
    if (accuracy > 0.97 && this.streak > 20) modifier += 0.0025;
    if (this.overdrive > 0) modifier -= 0.012;
    if (this.mutator === 'surge') modifier += 0.0015;
    if (this.mutator === 'resilience' && accuracy < 0.9) modifier -= 0.0015;

    enemy[threatKey] = clamp(enemy[threatKey] + modifier * maximum * dt, 0, maximum);
  }

  regenerate(dt, time) {
    const delay = this.mutator === 'resilience' ? 3200 : this.overdrive > 0 ? 2800 : 5000;
    if (time - this.lastDamageAt < delay) return;
    const rate = this.overdrive > 0 ? 5 : this.mutator === 'resilience' ? 3 : 1.5;
    this.restoreShield(rate * dt);
  }

  tick(dt, time) {
    if (!this.game) return;
    const mode = this.game.state?.mode;
    if (mode !== 'playing' && mode !== 'focus') return;

    this.trackEnemies();
    if (this.overdrive > 0) this.overdrive = Math.max(0, this.overdrive - dt);
    if (mode !== 'focus') this.flow = Math.max(0, this.flow - dt * 0.55);

    const health = this.findVital(HEALTH_KEYS);
    const healthMax = this.findVital(HEALTH_MAX_KEYS);
    const healthRatio = health && healthMax && healthMax.value > 0
      ? health.value / healthMax.value
      : 1;
    const desiredPressure = clamp(
      0.24
      + this.currentAccuracy() * 0.28
      + Math.min(0.22, (time - this.missionStartedAt) / 240000)
      - (1 - healthRatio) * 0.28,
      0.08,
      0.86
    );
    this.pressure += (desiredPressure - this.pressure) * dt * 0.35;

    this.tuneFocusedEnemy(dt, time);
    this.regenerate(dt, time);

    if (time - this.lastSaveAt > 30000) {
      this.lastSaveAt = time;
      this.save();
    }
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.stats));
    } catch {
      // Persistence is optional; gameplay remains functional in restricted contexts.
    }
  }
}
