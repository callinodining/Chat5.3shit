import * as THREE from 'three';
import {
  BIOMES,
  ENEMY_TYPES,
  FINGER_MAP,
  FINGER_NAMES,
  promptForMission
} from './data.js';

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

const ISLAND_STYLES = {
  vault: {
    sky: 0x72cdf5, fog: 0xc9efff, ground: 0x65b96f, rock: 0x719278,
    metal: 0xf2f4eb, path: 0xf8f8ef, accent: 0x29dfff, danger: 0xff3854,
    foliage: 0x34a95f, flower: 0x4f88ff
  },
  foundry: {
    sky: 0x79d2f4, fog: 0xd6f3ff, ground: 0x79b766, rock: 0x9f7659,
    metal: 0xfff0d7, path: 0xfff7e9, accent: 0xffa33e, danger: 0xff3f4f,
    foliage: 0x66aa57, flower: 0xff7c4f
  },
  canyon: {
    sky: 0x76d0f7, fog: 0xd7f3ff, ground: 0x79bd71, rock: 0xc88766,
    metal: 0xf7f4e9, path: 0xfffbef, accent: 0x35d9ff, danger: 0xff3c56,
    foliage: 0x44a96b, flower: 0xff67a5
  },
  city: {
    sky: 0x8ad6fa, fog: 0xe3f6ff, ground: 0x72bd82, rock: 0x879b9c,
    metal: 0xf7f5f1, path: 0xffffff, accent: 0x56c8ff, danger: 0xff385b,
    foliage: 0x45b878, flower: 0xb267ff
  },
  roots: {
    sky: 0x86d8f7, fog: 0xdaf6f1, ground: 0x57ae70, rock: 0x557969,
    metal: 0xeef6e8, path: 0xf6f8e7, accent: 0x46e5c1, danger: 0xff3d54,
    foliage: 0x238f61, flower: 0x9a65ff
  },
  spire: {
    sky: 0x93dcff, fog: 0xe8f8ff, ground: 0x7dbb78, rock: 0x91a099,
    metal: 0xfffaed, path: 0xffffff, accent: 0x52cfff, danger: 0xff344f,
    foliage: 0x47a96a, flower: 0xffb33f
  }
};

const ROUTE_X = [0, -1.5, -5.5, -10, -12.5, -9, -3, 4, 10, 12, 8, 1, -6, -9, -4];
const ROUTE_HEIGHT = [0, 0.12, 0.32, 0.88, 1.42, 1.08, 1.65, 2.28, 2.06, 1.55, 2.12, 2.78, 3.24, 3.72, 4.08];

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function distanceXZ(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

import { GameplayDirector } from './gameplay-director.js';

export class EchoGame {
  constructor(canvas, ui, callbacks = {}) {
    this.canvas = canvas;
    this.ui = ui;
    this.callbacks = callbacks;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.94;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 420);
    this.camera.rotation.order = 'YXZ';
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.cameraRig = new THREE.Group();
    this.cameraRig.add(this.camera);
    this.scene.add(this.cameraRig);

    this.state = {
      mode: 'menu',
      mission: null,
      training: false,
      elapsed: 0,
      correct: 0,
      typed: 0,
      errors: 0,
      streak: 0,
      bestStreak: 0,
      dodges: 0,
      progress: 0,
      announcementTimer: 0,
      checkpointIndex: 0,
      target: null,
      prompt: '',
      promptIndex: 0,
      wrong: '',
      wordErrors: 0,
      promptSequence: 0,
      threat: 0,
      focusStrafe: 1,
      shake: 0,
      recoil: 0,
      timeScale: 1,
      grace: 0,
      handTap: 0,
      handError: 0,
      handTapSide: 1
    };

    this.player = {
      position: new THREE.Vector3(0, 0.05, 7),
      velocity: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      radius: 0.48,
      height: 1.72,
      health: 100,
      shield: 100,
      shieldDelay: 0,
      grounded: true,
      coyote: 0,
      jumpBuffer: 0,
      extraJump: 1,
      airDash: true,
      dashCooldown: 0,
      dashTimer: 0,
      slideTimer: 0,
      invulnerable: 0,
      respawn: new THREE.Vector3(0, 0.05, 7)
    };

    this.keys = Object.create(null);
    this.platforms = [];
    this.solids = [];
    this.checkpoints = [];
    this.enemies = [];
    this.projectiles = [];
    this.effects = [];
    this.weather = null;
    this.goal = null;
    this.goalPosition = new THREE.Vector3();
    this.routeStart = new THREE.Vector3();
    this.weapon = null;
    this.handRig = null;
    this.hands = [];
    this.handFingers = [];
    this.keyboard = null;
    this.muzzleLight = null;
    this.audio = null;
    this.settings = callbacks.getSettings?.() || {};
    this.gameplayDirector = new GameplayDirector();
    this.horizonTextures = Array.from({ length: 8 }, (_, index) => {
      const texture = new THREE.TextureLoader().load(
        `assets/horizon/island-horizon-${String(index + 1).padStart(2, '0')}.jpg`
      );
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      texture.repeat.x = 768 / 784;
      texture.offset.x = 8 / 784;
      return texture;
    });

    this.installLighting();
    this.createWeapon();
    this.createHandOverlay();
    this.bindEvents();
    this.gameplayDirector.attach(this);
    this.resize();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  installLighting() {
    this.ambient = new THREE.HemisphereLight(0xe2f8ff, 0x628b60, 1.42);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xfff1cc, 2.55);
    this.sun.position.set(-32, 48, 22);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -70;
    this.sun.shadow.camera.right = 70;
    this.sun.shadow.camera.top = 75;
    this.sun.shadow.camera.bottom = -75;
    this.sun.shadow.bias = -0.00035;
    this.scene.add(this.sun);
    this.fillLight = new THREE.DirectionalLight(0x8be9ff, 0.8);
    this.fillLight.position.set(28, 18, -35);
    this.scene.add(this.fillLight);
  }

  createWeapon() {
    const rig = new THREE.Group();
    const glove = new THREE.MeshPhysicalMaterial({
      color: 0xf2f5f1,
      roughness: 0.46,
      metalness: 0.08,
      clearcoat: 0.35
    });
    const joint = new THREE.MeshStandardMaterial({
      color: 0x253c4b,
      roughness: 0.35,
      metalness: 0.62
    });
    const glow = new THREE.MeshStandardMaterial({
      color: 0x56e9ff,
      emissive: 0x20cfff,
      emissiveIntensity: 2.7,
      roughness: 0.2
    });

    const makeHand = (side) => {
      const hand = new THREE.Group();
      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 12), glove);
      palm.scale.set(1, 0.34, 1.18);
      palm.rotation.x = -0.18;
      const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.145, 0.36, 16), glove);
      wrist.rotation.x = Math.PI / 2;
      wrist.position.z = 0.26;
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.027, 8, 24), joint);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.z = 0.08;
      const signal = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 8, 24), glow);
      signal.position.set(side * 0.035, -0.09, 0.15);
      signal.rotation.x = -0.34;
      hand.add(palm, wrist, cuff, signal);

      const fingerLengths = [0.2, 0.27, 0.3, 0.275, 0.2];
      for (let index = 0; index < 5; index += 1) {
        const finger = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.038, fingerLengths[index], 5, 10),
          index === 0 ? joint : glove
        );
        finger.position.set((index - 2) * 0.078, 0.105, -0.2 - Math.abs(index - 2) * 0.008);
        finger.rotation.x = -Math.PI / 2 + 0.12;
        finger.rotation.z = side * (index - 2) * 0.035;
        finger.scale.set(0.68, 1, 0.68);
        finger.userData.baseRotation = finger.rotation.x;
        finger.userData.handSide = side;
        hand.add(finger);
        this.handFingers.push(finger);
      }
      rig.add(hand);
      hand.scale.setScalar(0.74);
      this.hands.push(hand);
      return hand;
    };

    const left = makeHand(-1);
    const right = makeHand(1);
    left.position.set(-0.5, -0.41, -1.08);
    right.position.set(0.5, -0.41, -1.08);
    left.rotation.set(-0.12, 0.24, -0.12);
    right.rotation.set(-0.12, -0.24, 0.12);

    const keyboard = new THREE.Group();
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.93, 0.055, 0.36),
      new THREE.MeshPhysicalMaterial({
        color: 0xeefaff,
        roughness: 0.24,
        metalness: 0.18,
        transparent: true,
        opacity: 0.9
      })
    );
    board.position.y = -0.035;
    keyboard.add(board);
    const keyMaterial = new THREE.MeshStandardMaterial({
      color: 0x102f43,
      emissive: 0x0b5671,
      emissiveIntensity: 0.45,
      roughness: 0.38
    });
    const activeKey = glow.clone();
    for (let row = 0; row < 3; row += 1) {
      const count = row === 0 ? 10 : row === 1 ? 9 : 7;
      for (let index = 0; index < count; index += 1) {
        const key = new THREE.Mesh(
          new THREE.BoxGeometry(0.066, 0.025, 0.064),
          (row === 1 && (index === 3 || index === 6)) ? activeKey : keyMaterial
        );
        key.position.set((index - (count - 1) / 2) * 0.078, 0.01, (row - 1) * 0.083);
        keyboard.add(key);
      }
    }
    keyboard.position.set(0, -0.35, -0.98);
    keyboard.rotation.x = -0.35;
    keyboard.visible = false;
    rig.add(keyboard);
    this.keyboard = keyboard;

    this.camera.add(rig);
    this.handRig = rig;
    this.weapon = rig;
    this.muzzleLight = new THREE.PointLight(0x72fff7, 0, 4);
    this.muzzleLight.position.set(0, -0.08, -1.1);
    rig.add(this.muzzleLight);
  }

  createHandOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'handOverlay';
    overlay.setAttribute('aria-hidden', 'true');

    const openHands = document.createElement('img');
    openHands.className = 'player-hands player-hands-open';
    openHands.src = 'assets/player-hands-open.png';
    openHands.alt = '';
    openHands.draggable = false;

    const typingHands = document.createElement('img');
    typingHands.className = 'player-hands player-hands-typing';
    typingHands.src = 'assets/player-hands-typing.png';
    typingHands.alt = '';
    typingHands.draggable = false;

    overlay.append(openHands, typingHands);
    document.body.appendChild(overlay);
    this.handOverlay = overlay;

    // High-detail illustrated hands replace the former low-poly placeholder rig.
    this.handRig.visible = false;

    const syncHands = () => {
      const hud = document.getElementById('hud');
      const hudStyle = hud ? getComputedStyle(hud) : null;
      const hudVisible = Boolean(
        hud
        && hudStyle.display !== 'none'
        && hudStyle.visibility !== 'hidden'
        && Number.parseFloat(hudStyle.opacity || '1') > 0.05
      );
      const typing = Boolean(this.state?.focusedEnemy);

      overlay.classList.toggle('active', hudVisible);
      overlay.classList.toggle('typing', typing);
      overlay.classList.toggle('tap', typing && this.state?.handTap > 0.025);
      overlay.classList.toggle('error', typing && this.state?.handError > 0.025);
      this.handOverlayFrame = requestAnimationFrame(syncHands);
    };

    syncHands();
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('blur', () => {
      if (this.state.mode === 'playing' || this.state.mode === 'focus') this.pause();
    });
    window.addEventListener('keydown', (event) => this.onKeyDown(event));
    window.addEventListener('keyup', (event) => {
      this.keys[event.code] = false;
    });
    window.addEventListener('mousemove', (event) => {
      if (document.pointerLockElement !== this.canvas) return;
      if (this.state.mode === 'focus') {
        if (Math.abs(event.movementX) > 1) this.state.focusStrafe = Math.sign(event.movementX);
        return;
      }
      if (this.state.mode !== 'playing') return;
      const sensitivity = this.settings.sensitivity ?? 0.002;
      this.player.yaw -= event.movementX * sensitivity;
      this.player.pitch = clamp(this.player.pitch - event.movementY * sensitivity, -1.38, 1.38);
    });
    window.addEventListener('mousedown', (event) => {
      if (event.button === 0 && this.state.mode === 'playing') this.tryFocus();
      if (event.button === 2 && this.state.mode === 'focus') this.phaseDash();
    });
    window.addEventListener('contextmenu', (event) => event.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && (this.state.mode === 'playing' || this.state.mode === 'focus')) {
        this.pause();
      }
    });
  }

  onKeyDown(event) {
    if (this.state.mode === 'focus') {
      if (event.code === 'Escape') {
        event.preventDefault();
        this.leaveFocus();
        return;
      }
      this.handleTyping(event);
      return;
    }
    if (event.code === 'Escape' && this.state.mode === 'playing') {
      this.pause();
      return;
    }
    if (this.state.mode !== 'playing') return;
    this.keys[event.code] = true;
    if (event.code === 'Space') {
      event.preventDefault();
      this.player.jumpBuffer = 0.12;
    }
    if (event.code === 'KeyQ') this.startDash();
    if ((event.code === 'ControlLeft' || event.code === 'ControlRight') && this.isSprinting()) {
      this.player.slideTimer = 0.72;
      this.tone(130, 0.12, 'sawtooth', 0.04, -50);
    }
  }

  startMission(mission, { training = false } = {}) {
    this.settings = this.callbacks.getSettings?.() || this.settings;
    this.state.mode = 'playing';
    this.state.mission = mission;
    this.state.training = training;
    this.state.elapsed = 0;
    this.state.correct = 0;
    this.state.typed = 0;
    this.state.errors = 0;
    this.state.streak = 0;
    this.state.bestStreak = 0;
    this.state.dodges = 0;
    this.state.checkpointIndex = 0;
    this.state.target = null;
    this.state.threat = 0;
    this.state.promptSequence = 0;
    this.state.grace = 9;
    this.state.handTap = 0;
    this.state.handError = 0;
    this.player.position.set(0, 0.05, 7);
    this.player.respawn.copy(this.player.position);
    this.player.velocity.set(0, 0, 0);
    this.player.yaw = 0;
    this.player.pitch = 0;
    this.player.health = 100;
    this.player.shield = 100;
    this.player.shieldDelay = 0;
    this.player.extraJump = 1;
    this.player.airDash = true;
    this.player.dashCooldown = 0;
    this.player.slideTimer = 0;
    this.clearWorld();
    this.buildWorld(mission);
    this.ui.hud.classList.remove('hidden');
    this.ui.typing.classList.add('hidden');
    this.ui.crosshair.classList.remove('hidden');
    this.ui.missionName.textContent = `${mission.number.toString().padStart(2, '0')} · ${mission.title}`;
    this.ui.objective.textContent = training ? 'TRAININGSPFAD ABSCHLIESSEN' : mission.task.toUpperCase();
    this.callbacks.onMissionStart?.(mission);
    this.canvas.requestPointerLock?.();
    this.announce(training ? 'FREIES TRAINING GESTARTET' : `${mission.biomeName.toUpperCase()} · LAST ECHO AKTIV`);
    this.clock.getDelta();
  }

  clearWorld() {
    while (this.world.children.length) {
      const child = this.world.children.pop();
      child.traverse?.((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
        else object.material?.dispose?.();
      });
    }
    this.platforms.length = 0;
    this.solids.length = 0;
    this.checkpoints.length = 0;
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.effects.length = 0;
    this.goal = null;
    this.weather = null;
  }

  buildWorld(mission) {
    const biome = { ...BIOMES[mission.biome], ...(ISLAND_STYLES[mission.biome] || ISLAND_STYLES.vault) };
    const random = seeded(mission.seed);
    this.scene.background = new THREE.Color(biome.sky);
    this.scene.fog = new THREE.Fog(biome.fog, 72, 245);
    this.ambient.color.setHex(0xe6f9ff);
    this.ambient.groundColor.setHex(biome.ground);
    this.sun.color.setHex(mission.biome === 'foundry' ? 0xffdfab : 0xfff1cf);
    this.renderer.toneMappingExposure = 0.96;

    this.materials = {
      ground: new THREE.MeshStandardMaterial({ color: biome.ground, roughness: 0.84, metalness: 0.02 }),
      path: new THREE.MeshStandardMaterial({ color: biome.path, roughness: 0.6, metalness: 0.04 }),
      edge: new THREE.MeshPhysicalMaterial({
        color: biome.metal,
        roughness: 0.42,
        metalness: 0.08,
        clearcoat: 0.32
      }),
      rock: new THREE.MeshStandardMaterial({ color: biome.rock, roughness: 0.95, metalness: 0.02 }),
      foliage: new THREE.MeshStandardMaterial({ color: biome.foliage, roughness: 0.92, metalness: 0 }),
      flower: new THREE.MeshStandardMaterial({
        color: biome.flower,
        emissive: biome.flower,
        emissiveIntensity: 0.38,
        roughness: 0.72
      }),
      glass: new THREE.MeshPhysicalMaterial({
        color: 0x78e9ff,
        transparent: true,
        opacity: 0.28,
        roughness: 0.12,
        metalness: 0.08,
        transmission: 0.38
      }),
      accent: new THREE.MeshStandardMaterial({
        color: biome.accent,
        emissive: biome.accent,
        emissiveIntensity: 2.15,
        roughness: 0.25
      }),
      danger: new THREE.MeshStandardMaterial({
        color: biome.danger,
        emissive: biome.danger,
        emissiveIntensity: 2.2
      })
    };

    this.addOcean(biome, random);
    let z = 3;
    let previous = null;
    const platformCount = ROUTE_X.length;
    const jumpEntries = new Set([3, 7, 11, 13]);
    for (let index = 0; index < platformCount; index += 1) {
      const difficulty = mission.routeDifficulty;
      const isJumpEntry = jumpEntries.has(index);
      if (index > 0) z -= isJumpEntry ? 10.35 + Math.min(1.6, difficulty * 0.28) : 8.9;
      const x = ROUTE_X[index] + (index > 1 ? (random() - 0.5) * 1.1 : 0);
      const top = ROUTE_HEIGHT[index] * (0.9 + Math.min(0.16, difficulty * 0.018));
      const width = 10.6 + random() * 1.8;
      const depth = isJumpEntry ? 7.7 : 8.7 + random() * 0.8;
      const platform = this.addPlatform(x, top, z, width, depth);
      if (!previous) this.routeStart.set(x, top, z);
      else this.addRouteConnector(previous, platform, isJumpEntry, biome);
      previous = platform;

      if (index > 0) {
        this.addArch(x, top, z, biome, index);
      }
      this.addScenery(platform, biome, random, index);

      if ([4, 8, 12].includes(index)) {
        this.checkpoints.push(new THREE.Vector3(x, top + 0.05, z + depth * 0.25));
      }
    }

    const finalPlatform = this.platforms[this.platforms.length - 1];
    this.createGoal(finalPlatform.centerX, finalPlatform.top, finalPlatform.centerZ, biome, mission.boss);
    this.createWeather(biome, random);

    const enemySlots = [2, 5, 8, 11, 13];
    enemySlots.forEach((slot, slotIndex) => {
      const platform = this.platforms[slot];
      let type = 'scout';
      if (slotIndex >= 1) type = 'soldier';
      if (mission.number >= 8 && slotIndex === 2) type = 'sniper';
      if (mission.number >= 14 && slotIndex === 3) type = 'disruptor';
      if (mission.number >= 16 && slotIndex === 1) type = 'tank';
      if (mission.boss && slotIndex === enemySlots.length - 1) type = 'boss';
      this.createEnemy(
        new THREE.Vector3(platform.centerX + (slotIndex % 2 ? 2.2 : -2.2), platform.top + 2.5, platform.centerZ),
        type
      );
    });
  }

  addPlatform(x, top, z, width, depth) {
    const island = new THREE.Group();
    island.position.set(x, top, z);
    const underside = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 1, 4.2, 14, 2),
      this.materials.rock
    );
    underside.scale.set(width * 0.48, 1, depth * 0.48);
    underside.position.y = -2.2;
    underside.receiveShadow = true;
    underside.castShadow = true;
    const grass = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.42, 20), this.materials.ground);
    grass.scale.set(width * 0.5, 1, depth * 0.5);
    grass.position.y = -0.18;
    grass.receiveShadow = true;
    grass.castShadow = true;
    const path = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.16, 24), this.materials.path);
    path.scale.set(width * 0.33, 1, depth * 0.48);
    path.position.y = 0.06;
    path.receiveShadow = true;
    path.castShadow = true;
    island.add(underside, grass, path);
    this.world.add(island);
    const platform = {
      centerX: x,
      centerZ: z,
      width,
      depth,
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
      top,
      bottom: top - 4.3
    };
    this.platforms.push(platform);
    return platform;
  }

  addRouteConnector(from, to, isJump, biome) {
    const start = new THREE.Vector3(from.centerX, from.top + 0.16, from.centerZ);
    const end = new THREE.Vector3(to.centerX, to.top + 0.16, to.centerZ);
    const midpoint = start.clone().lerp(end, 0.5);
    midpoint.y += isJump ? 1.55 : 0.22;
    const curve = new THREE.CatmullRomCurve3([start, midpoint, end]);
    const ribbon = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 24, isJump ? 0.055 : 0.075, 6, false),
      this.materials.accent
    );
    this.world.add(ribbon);
    if (!isJump) return;
    for (const t of [0.3, 0.52, 0.74]) {
      const point = curve.getPoint(t);
      const next = curve.getPoint(Math.min(1, t + 0.03));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.055, 8, 28), this.materials.accent);
      ring.position.copy(point);
      ring.lookAt(next);
      this.world.add(ring);
    }
  }

  addSolid(x, y, z, width, height, depth, material = this.materials.edge) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y + height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.world.add(mesh);
    this.solids.push({
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
      bottom: y,
      top: y + height
    });
    return mesh;
  }

  addArch(x, top, z, biome, index) {
    if (index % 3 !== 2) return;
    const height = 3.9 + (index % 2) * 0.35;
    this.addSolid(x - 3.65, top, z, 0.5, height, 0.66, this.materials.edge);
    this.addSolid(x + 3.65, top, z, 0.5, height, 0.66, this.materials.edge);
    const portal = new THREE.Mesh(
      new THREE.TorusGeometry(3.05, 0.24, 12, 42, Math.PI),
      this.materials.edge
    );
    portal.position.set(x, top + 0.58, z);
    portal.scale.x = 1.2;
    portal.castShadow = true;
    this.world.add(portal);
    const signal = new THREE.Mesh(
      new THREE.TorusGeometry(2.73, 0.04, 8, 48, Math.PI),
      this.materials.accent
    );
    signal.position.set(x, top + 0.58, z - 0.03);
    signal.scale.x = 1.2;
    this.world.add(signal);
  }

  addScenery(platform, biome, random, index) {
    if (index % 3 === 0) {
      for (const side of [-1, 1]) {
        const distance = 16 + random() * 10;
        const radius = 2.2 + random() * 2.5;
        const island = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 1), this.materials.rock);
        island.position.set(
          platform.centerX + side * distance,
          -1.2 + random() * 1.7,
          platform.centerZ + (random() - 0.5) * 10
        );
        island.scale.set(1.05, 1.25 + random() * 0.45, 0.88 + random() * 0.35);
        island.rotation.y = random() * Math.PI;
        island.castShadow = true;
        island.receiveShadow = true;
        this.world.add(island);
        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(radius * 0.72, radius * 0.88, 0.34, 16),
          this.materials.ground
        );
        cap.position.set(island.position.x, island.position.y + radius * island.scale.y * 0.72, island.position.z);
        cap.rotation.y = island.rotation.y;
        cap.castShadow = true;
        this.world.add(cap);
        if ((index / 3 + Math.max(0, side)) % 2 === 0) {
          this.addTower(island.position.x, cap.position.y + 0.1, island.position.z, 4 + random() * 5);
        }
      }
    }
    for (let plantIndex = 0; plantIndex < 12; plantIndex += 1) {
      const side = plantIndex % 2 ? -1 : 1;
      const px = platform.centerX + side * (platform.width * (0.32 + random() * 0.1));
      const pz = platform.centerZ + (random() - 0.5) * platform.depth * 0.72;
      this.addPlant(px, platform.top + 0.12, pz, random);
    }
  }

  addTower(x, y, z, height) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 1.08, height, 12), this.materials.edge);
    shaft.position.y = height / 2;
    shaft.castShadow = true;
    const balcony = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.22, 20), this.materials.path);
    balcony.position.y = height * 0.62;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.5, height * 0.46, 10), this.materials.edge);
    crown.position.y = height + height * 0.2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.055, 8, 28), this.materials.accent);
    ring.position.y = height * 0.75;
    ring.rotation.x = Math.PI / 2;
    group.add(shaft, balcony, crown, ring);
    this.world.add(group);
  }

  addPlant(x, y, z, random) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.48, 6), this.materials.foliage);
    stem.position.y = 0.22;
    group.add(stem);
    const leafCount = 3 + Math.floor(random() * 3);
    for (let index = 0; index < leafCount; index += 1) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.14 + random() * 0.08, 8, 5), this.materials.foliage);
      const angle = (index / leafCount) * Math.PI * 2;
      leaf.position.set(Math.cos(angle) * 0.15, 0.24 + random() * 0.2, Math.sin(angle) * 0.15);
      leaf.scale.set(1.9, 0.42, 0.72);
      leaf.rotation.y = -angle;
      group.add(leaf);
    }
    const bloom = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 + random() * 0.08, 0), this.materials.flower);
    bloom.position.y = 0.55;
    group.add(bloom);
    group.rotation.y = random() * Math.PI;
    group.scale.setScalar(0.95 + random() * 0.95);
    this.world.add(group);
  }

  addOcean(biome, random) {
    const horizon = new THREE.Group();
    const segmentCount = this.horizonTextures.length;
    const segmentAngle = (Math.PI * 2) / segmentCount;
    for (let index = 0; index < segmentCount; index += 1) {
      const segment = new THREE.Mesh(
        new THREE.CylinderGeometry(
          205,
          205,
          420,
          9,
          1,
          true,
          index * segmentAngle,
          segmentAngle + 0.0008
        ),
        new THREE.MeshBasicMaterial({
          map: this.horizonTextures[index],
          side: THREE.BackSide,
          fog: false,
          depthWrite: false
        })
      );
      segment.frustumCulled = false;
      segment.renderOrder = -20 + index;
      horizon.add(segment);
    }
    horizon.position.set(0, 0, 0);
    horizon.rotation.y = Math.PI;
    this.world.add(horizon);
    this.horizon = horizon;

    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(520, 520, 1, 1),
      new THREE.MeshPhysicalMaterial({
        color: 0x23bfe4,
        roughness: 0.22,
        metalness: 0.06,
        transparent: true,
        opacity: 0.84,
        clearcoat: 0.85,
        clearcoatRoughness: 0.15
      })
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(0, -4.1, -70);
    ocean.receiveShadow = true;
    this.world.add(ocean);

  }

  createGoal(x, top, z, biome, locked) {
    const group = new THREE.Group();
    group.position.set(x, top, z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.24, 12, 48), this.materials.accent);
    ring.position.y = 3.3;
    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(2.7, 48),
      new THREE.MeshBasicMaterial({
        color: biome.accent,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      })
    );
    inner.position.y = 3.3;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 1.8, 10, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: biome.accent,
        transparent: true,
        opacity: 0.11,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      })
    );
    beam.position.y = 5;
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.62, 5.5, 12), this.materials.edge);
      pillar.position.set(side * 2.5, 2.75, 0.8);
      pillar.castShadow = true;
      group.add(pillar);
    }
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.32, 8.5, 12), this.materials.edge);
    antenna.position.y = 6.7;
    const crown = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.12, 10, 36), this.materials.accent);
    crown.position.y = 9.8;
    crown.rotation.x = Math.PI / 2;
    group.add(ring, inner, beam, antenna, crown);
    this.world.add(group);
    this.goalPosition.set(x, top, z);
    this.goal = { group, ring, inner, crown, locked };
  }

  createWeather(biome, random) {
    const count = this.settings.quality === 'low' ? 260 : 620;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = (random() - 0.5) * 70;
      positions[index * 3 + 1] = 2 + random() * 25;
      positions[index * 3 + 2] = 12 - random() * 145;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: biome.accent,
      size: 0.075 + (this.settings.quality === 'low' ? 0 : 0.025),
      transparent: true,
      opacity: 0.34,
      depthWrite: false
    });
    this.weather = new THREE.Points(geometry, material);
    this.weather.userData.kind = 'motes';
    this.world.add(this.weather);
  }

  createEnemy(position, typeName) {
    const type = ENEMY_TYPES[typeName];
    const group = new THREE.Group();
    group.position.copy(position);
    const shell = new THREE.MeshStandardMaterial({
      color: typeName === 'boss' ? 0x151019 : 0x10151d,
      roughness: 0.24,
      metalness: 0.94
    });
    const armor = new THREE.MeshStandardMaterial({
      color: 0x4d1420,
      roughness: 0.3,
      metalness: 0.82
    });
    const hostileColor = typeName === 'boss' ? 0xffa426 : typeName === 'disruptor' ? 0xff2a8d : 0xff304d;
    const glow = new THREE.MeshStandardMaterial({
      color: hostileColor,
      emissive: hostileColor,
      emissiveIntensity: 4.4,
      roughness: 0.2
    });
    const scale = typeName === 'boss' ? 1.65 : typeName === 'tank' ? 1.2 : 0.82;
    const body = new THREE.Mesh(
      new THREE.IcosahedronGeometry(scale, typeName === 'boss' ? 1 : 0),
      shell
    );
    body.scale.set(0.78, 1.22, 0.72);
    body.castShadow = true;
    const facePlate = new THREE.Mesh(new THREE.ConeGeometry(scale * 0.62, scale * 0.9, 4), armor);
    facePlate.rotation.x = Math.PI / 2;
    facePlate.rotation.z = Math.PI / 4;
    facePlate.position.z = scale * 0.58;
    const eye = new THREE.Mesh(
      new THREE.BoxGeometry(typeName === 'boss' ? 0.9 : 0.48, 0.095, 0.08),
      glow
    );
    eye.position.set(0, scale * 0.13, scale * 0.83);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(typeName === 'boss' ? 2.35 : 1.18, 0.075, 6, 36), armor);
    halo.rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(
        new THREE.ConeGeometry(typeName === 'boss' ? 0.5 : 0.28, typeName === 'boss' ? 3.4 : 2.05, 3),
        shell
      );
      wing.position.set(side * (typeName === 'boss' ? 2.2 : 1.24), 0.08, -0.08);
      wing.rotation.z = side * (Math.PI / 2 - 0.18);
      wing.rotation.y = side * 0.28;
      group.add(wing);
      const claw = new THREE.Mesh(new THREE.TetrahedronGeometry(typeName === 'boss' ? 0.34 : 0.2, 0), glow);
      claw.position.set(side * (typeName === 'boss' ? 3.75 : 2.2), -0.12, 0.15);
      group.add(claw);
      const lowerBlade = new THREE.Mesh(
        new THREE.ConeGeometry(0.18, typeName === 'boss' ? 1.8 : 1.15, 3),
        armor
      );
      lowerBlade.position.set(side * scale * 0.54, -scale * 1.12, -0.08);
      lowerBlade.rotation.z = side * 0.18;
      group.add(lowerBlade);
    }
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, scale * 0.88, 4), armor);
      horn.position.set(side * scale * 0.36, scale * 1.04, 0);
      horn.rotation.z = side * -0.22;
      group.add(horn);
    }
    group.add(body, facePlate, eye, halo);
    this.world.add(group);
    const enemy = {
      group,
      body,
      eye,
      halo,
      typeName,
      type,
      health: type.health,
      maxHealth: type.health,
      dead: false,
      cooldown: 1.2 + Math.random() * 1.8,
      phase: Math.random() * Math.PI * 2,
      baseY: position.y
    };
    group.traverse((object) => {
      object.userData.enemy = enemy;
    });
    this.enemies.push(enemy);
    return enemy;
  }

  onKeyTypingMatch(event) {
    if (event.key === 'Dead') return '';
    return event.key;
  }

  handleTyping(event) {
    if (event.code === 'Backspace') {
      event.preventDefault();
      this.state.wrong = '';
      this.renderTyping();
      return;
    }
    const typed = this.onKeyTypingMatch(event);
    if (typed.length !== 1) return;
    event.preventDefault();
    const expected = this.state.prompt[this.state.promptIndex];
    if (!expected) return;
    this.state.typed += 1;
    const correct = typed === expected;
    this.callbacks.onKey?.(expected, correct);
    if (!correct) {
      this.state.errors += 1;
      this.state.wordErrors += 1;
      this.state.streak = 0;
      this.state.wrong = typed;
      this.state.threat = clamp(this.state.threat + 0.09, 0, 1.15);
      this.state.shake = Math.max(this.state.shake, 0.07);
      this.state.handError = 0.18;
      this.tone(92, 0.08, 'square', 0.05, -25);
      this.renderTyping();
      return;
    }

    this.state.wrong = '';
    this.state.correct += 1;
    this.state.streak += 1;
    this.state.bestStreak = Math.max(this.state.bestStreak, this.state.streak);
    this.state.threat = Math.max(0, this.state.threat - 0.028);
    this.state.promptIndex += 1;
    const finger = FINGER_MAP[expected.toLowerCase()] || '';
    this.state.handTapSide = finger.startsWith('L') ? -1 : 1;
    this.state.handTap = 0.14;
    this.flashCharacterShot();

    const next = this.state.prompt[this.state.promptIndex];
    const wordCompleted = next === ' ' || this.state.promptIndex >= this.state.prompt.length;
    if (wordCompleted) this.fireWord(this.state.wordErrors === 0);
    if (expected === ' ') this.state.wordErrors = 0;

    if (this.state.promptIndex >= this.state.prompt.length && this.state.target && !this.state.target.dead) {
      this.state.promptSequence += 1;
      this.state.prompt = promptForMission(
        this.state.mission,
        this.state.target.typeName,
        this.state.promptSequence
      );
      this.state.promptIndex = 0;
      this.state.wordErrors = 0;
    }
    this.renderTyping();
  }

  tryFocus() {
    if (!this.state.mission) return;
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hit = this.raycaster.intersectObjects(
      this.enemies.filter((enemy) => !enemy.dead).map((enemy) => enemy.group),
      true
    )[0];
    let enemy = hit?.object?.userData?.enemy;
    if (!enemy) {
      const direction = new THREE.Vector3();
      this.camera.getWorldDirection(direction);
      let bestAngle = 0.32;
      for (const candidate of this.enemies) {
        if (candidate.dead) continue;
        const toEnemy = candidate.group.position.clone().sub(this.camera.position);
        const distance = toEnemy.length();
        if (distance > 38) continue;
        const angle = direction.angleTo(toEnemy.normalize());
        if (angle < bestAngle) {
          bestAngle = angle;
          enemy = candidate;
        }
      }
    }
    if (enemy) this.enterFocus(enemy);
    else this.announce('KEIN ZIEL IM FOKUS');
  }

  enterFocus(enemy) {
    this.state.mode = 'focus';
    this.state.target = enemy;
    this.state.threat = 0.18;
    this.state.promptSequence = 0;
    this.state.prompt = promptForMission(this.state.mission, enemy.typeName, 0);
    this.state.promptIndex = 0;
    this.state.wrong = '';
    this.state.wordErrors = 0;
    this.state.timeScale = 0.4;
    this.keyboard.visible = true;
    this.ui.typing.classList.remove('hidden');
    this.ui.crosshair.classList.add('hidden');
    this.ui.enemyName.textContent = enemy.type.label;
    this.renderTyping();
    this.tone(280, 0.12, 'sine', 0.04, 190);
  }

  leaveFocus() {
    this.state.mode = 'playing';
    this.state.target = null;
    this.state.timeScale = 1;
    this.keyboard.visible = false;
    this.ui.typing.classList.add('hidden');
    this.ui.crosshair.classList.remove('hidden');
  }

  renderTyping() {
    const prompt = this.state.prompt;
    this.ui.prompt.replaceChildren();
    [...prompt].forEach((char, index) => {
      const span = document.createElement('span');
      span.textContent = char === ' ' ? '·' : char;
      if (index < this.state.promptIndex) span.className = 'typed';
      else if (index === this.state.promptIndex) span.className = this.state.wrong ? 'current wrong' : 'current';
      this.ui.prompt.append(span);
    });
    this.ui.typedWrong.textContent = this.state.wrong ? `FALSCH: ${this.state.wrong}` : '';
    const next = prompt[this.state.promptIndex] || '';
    const lookup = next.toLowerCase();
    const finger = FINGER_MAP[lookup] || (next !== next.toLowerCase() ? 'Shift + Gegenhand' : '');
    this.ui.fingerHint.textContent = next
      ? `${next === ' ' ? 'LEERTASTE' : next} · ${FINGER_NAMES[finger] || finger || 'Zeichen'}`
      : '';
    this.callbacks.onTypingHint?.(lookup);
  }

  fireWord(perfect) {
    const enemy = this.state.target;
    if (!enemy || enemy.dead) return;
    const damage = perfect ? 36 : 27;
    enemy.health -= damage;
    this.state.threat = Math.max(0, this.state.threat - (perfect ? 0.17 : 0.1));
    if (perfect) {
      this.player.shield = Math.min(100, this.player.shield + 2);
      enemy.cooldown += 0.45;
      this.ui.perfect.classList.remove('hidden');
      clearTimeout(this.perfectTimer);
      this.perfectTimer = setTimeout(() => this.ui.perfect.classList.add('hidden'), 420);
    }
    this.createTracer(this.camera.position, enemy.eye.getWorldPosition(new THREE.Vector3()), perfect);
    this.burst(enemy.eye.getWorldPosition(new THREE.Vector3()), perfect ? 0x7dfff4 : 0x5acbc6, perfect ? 11 : 6);
    this.state.recoil -= perfect ? 0.035 : 0.024;
    this.state.shake = Math.max(this.state.shake, perfect ? 0.08 : 0.04);
    this.tone(perfect ? 510 : 390, 0.09, 'sawtooth', 0.055, perfect ? 260 : 120);
    if (enemy.health <= 0) this.killEnemy(enemy);
  }

  flashCharacterShot() {
    this.muzzleLight.intensity = 3.8;
    this.state.handTap = Math.max(this.state.handTap, 0.11);
    this.tone(620, 0.025, 'square', 0.012, 80);
  }

  killEnemy(enemy) {
    enemy.dead = true;
    this.burst(enemy.group.position, enemy.type.color, enemy.typeName === 'boss' ? 34 : 18);
    this.tone(130, 0.35, 'sawtooth', 0.08, -90);
    if (enemy.typeName === 'boss' && this.goal) {
      this.goal.locked = false;
      this.announce('WEG ZUR ÜBERTRAGUNG FREI');
    } else {
      this.announce('SIGNATUR GELÖSCHT');
    }
    setTimeout(() => {
      if (enemy.group.parent) this.world.remove(enemy.group);
    }, 80);
    this.leaveFocus();
  }

  phaseDash() {
    if (this.player.dashCooldown > 0) return;
    const side = new THREE.Vector3(Math.cos(this.player.yaw), 0, -Math.sin(this.player.yaw));
    const candidate = this.player.position.clone().addScaledVector(side, this.state.focusStrafe * 3.2);
    if (this.supportAt(candidate.x, candidate.z) !== null) {
      this.player.position.copy(candidate);
    } else {
      this.state.focusStrafe *= -1;
      const reverse = this.player.position.clone().addScaledVector(side, this.state.focusStrafe * 2.4);
      if (this.supportAt(reverse.x, reverse.z) !== null) this.player.position.copy(reverse);
    }
    this.player.invulnerable = 0.4;
    this.player.dashCooldown = 2.5;
    this.state.dodges += 1;
    this.state.shake = 0.1;
    this.ui.dashFlash.classList.add('active');
    setTimeout(() => this.ui.dashFlash.classList.remove('active'), 130);
    this.tone(150, 0.14, 'sawtooth', 0.06, 310);
  }

  startDash() {
    if (this.player.dashCooldown > 0 || (!this.player.grounded && !this.player.airDash)) return;
    const input = this.moveInput();
    const direction = input.lengthSq() > 0.01
      ? input.normalize()
      : new THREE.Vector3(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));
    this.player.velocity.x = direction.x * 18;
    this.player.velocity.z = direction.z * 18;
    this.player.dashTimer = 0.2;
    this.player.dashCooldown = 1.2;
    this.player.invulnerable = 0.22;
    if (!this.player.grounded) this.player.airDash = false;
    this.state.shake = 0.08;
    this.tone(125, 0.14, 'sawtooth', 0.06, 260);
  }

  moveInput() {
    const forwardInput = (this.keys.KeyW ? 1 : 0) - (this.keys.KeyS ? 1 : 0);
    const rightInput = (this.keys.KeyD ? 1 : 0) - (this.keys.KeyA ? 1 : 0);
    const forward = new THREE.Vector3(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));
    const right = new THREE.Vector3(Math.cos(this.player.yaw), 0, -Math.sin(this.player.yaw));
    const direction = forward.multiplyScalar(forwardInput).add(right.multiplyScalar(rightInput));
    if (direction.lengthSq() > 1) direction.normalize();
    return direction;
  }

  isSprinting() {
    return Boolean(this.keys.ShiftLeft || this.keys.ShiftRight) && Boolean(this.keys.KeyW);
  }

  updatePlayer(realDt, worldDt) {
    const player = this.player;
    player.jumpBuffer = Math.max(0, player.jumpBuffer - realDt);
    player.coyote = player.grounded ? 0.12 : Math.max(0, player.coyote - realDt);
    player.dashCooldown = Math.max(0, player.dashCooldown - realDt);
    player.dashTimer = Math.max(0, player.dashTimer - realDt);
    player.slideTimer = Math.max(0, player.slideTimer - realDt);
    player.invulnerable = Math.max(0, player.invulnerable - realDt);
    player.shieldDelay = Math.max(0, player.shieldDelay - realDt);
    this.state.grace = Math.max(0, this.state.grace - realDt);
    if (player.shieldDelay === 0) player.shield = Math.min(100, player.shield + realDt * 10);

    if (this.state.mode === 'focus') {
      const target = this.state.target;
      if (target && !target.dead) {
        const desiredYaw = Math.atan2(
          -(target.group.position.x - player.position.x),
          -(target.group.position.z - player.position.z)
        );
        player.yaw = lerp(player.yaw, desiredYaw, 1 - Math.exp(-realDt * 8));
        const side = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
        player.velocity.x = lerp(player.velocity.x, side.x * this.state.focusStrafe * 1.8, 0.08);
        player.velocity.z = lerp(player.velocity.z, side.z * this.state.focusStrafe * 1.8, 0.08);
      }
    } else if (player.dashTimer <= 0) {
      const direction = this.moveInput();
      const sprinting = this.isSprinting();
      const speed = player.slideTimer > 0 ? 11.5 : sprinting ? 9 : 5.8;
      const desired = direction.multiplyScalar(speed);
      const smoothing = 1 - Math.exp(-realDt * (direction.lengthSq() ? 13 : 9));
      player.velocity.x = lerp(player.velocity.x, desired.x, smoothing);
      player.velocity.z = lerp(player.velocity.z, desired.z, smoothing);
    }

    if (player.jumpBuffer > 0) {
      if (player.grounded || player.coyote > 0) {
        player.velocity.y = 7.4;
        player.grounded = false;
        player.coyote = 0;
        player.jumpBuffer = 0;
        this.tone(170, 0.09, 'sine', 0.035, 160);
      } else if (player.extraJump > 0) {
        player.velocity.y = 7.1;
        player.extraJump -= 1;
        player.jumpBuffer = 0;
        this.burst(player.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 0x6ffdf2, 7);
        this.tone(230, 0.1, 'sine', 0.04, 220);
      }
    }

    const previousY = player.position.y;
    if (!player.grounded) player.velocity.y -= 21.5 * worldDt;
    const next = player.position.clone();
    next.x += player.velocity.x * worldDt;
    next.z += player.velocity.z * worldDt;
    this.resolveHorizontal(next);
    if (this.state.mode === 'focus' && this.supportAt(next.x, next.z) === null) {
      this.state.focusStrafe *= -1;
      next.x = player.position.x;
      next.z = player.position.z;
      player.velocity.x = 0;
      player.velocity.z = 0;
    }
    next.y += player.velocity.y * worldDt;

    const support = this.supportAt(next.x, next.z);
    player.grounded = false;
    if (
      support !== null &&
      player.velocity.y <= 0 &&
      next.y <= support + 0.12 &&
      previousY >= support - 0.35
    ) {
      next.y = support + 0.02;
      player.velocity.y = 0;
      player.grounded = true;
      player.extraJump = 1;
      player.airDash = true;
    }
    player.position.copy(next);
    if (this.horizon) {
      this.horizon.position.x = player.position.x;
      this.horizon.position.z = player.position.z;
    }

    if (player.position.y < -12) this.respawn();
    this.updateCheckpoint();

    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    const bob = this.settings.reducedMotion ? 0 : Math.sin(this.state.elapsed * (speed > 8 ? 12 : 8)) * Math.min(0.045, speed * 0.005);
    const slideOffset = player.slideTimer > 0 ? -0.55 : 0;
    const shakeX = (Math.random() - 0.5) * this.state.shake;
    const shakeY = (Math.random() - 0.5) * this.state.shake;
    this.cameraRig.position.set(
      player.position.x + shakeX,
      player.position.y + player.height + bob + slideOffset + shakeY,
      player.position.z
    );
    this.camera.rotation.y = player.yaw;
    this.camera.rotation.x = player.pitch + this.state.recoil;
    this.state.recoil = lerp(this.state.recoil, 0, 1 - Math.exp(-realDt * 14));
    this.state.shake = Math.max(0, this.state.shake - realDt * 1.8);
    this.updateHands(realDt, bob, speed);
    this.muzzleLight.intensity = lerp(this.muzzleLight.intensity, 0, 0.28);
  }

  updateHands(realDt, bob, speed) {
    this.state.handTap = Math.max(0, this.state.handTap - realDt);
    this.state.handError = Math.max(0, this.state.handError - realDt);
    const focused = this.state.mode === 'focus';
    const movementSway = this.settings.reducedMotion ? 0 : Math.sin(this.state.elapsed * 5.5) * Math.min(0.02, speed * 0.0025);
    const errorJolt = this.state.handError > 0 ? Math.sin(this.state.handError * 95) * 0.035 : 0;
    this.handRig.position.y = lerp(this.handRig.position.y, bob * -0.28 + movementSway, 0.12);
    this.handRig.position.x = errorJolt;

    const targets = focused
      ? [
          { x: -0.27, y: -0.39, z: -1.02, ry: 0.04, rz: -0.025 },
          { x: 0.27, y: -0.39, z: -1.02, ry: -0.04, rz: 0.025 }
        ]
      : [
          { x: -0.5, y: -0.41, z: -1.08, ry: 0.24, rz: -0.12 },
          { x: 0.5, y: -0.41, z: -1.08, ry: -0.24, rz: 0.12 }
        ];
    this.hands.forEach((hand, index) => {
      const target = targets[index];
      hand.position.x = lerp(hand.position.x, target.x, 0.14);
      hand.position.y = lerp(hand.position.y, target.y, 0.14);
      hand.position.z = lerp(hand.position.z, target.z, 0.14);
      hand.rotation.y = lerp(hand.rotation.y, target.ry, 0.14);
      hand.rotation.z = lerp(hand.rotation.z, target.rz, 0.14);
    });

    const tapStrength = this.state.handTap > 0
      ? Math.sin((this.state.handTap / 0.14) * Math.PI) * 0.38
      : 0;
    for (const finger of this.handFingers) {
      const active = finger.userData.handSide === this.state.handTapSide;
      finger.rotation.x = lerp(
        finger.rotation.x,
        finger.userData.baseRotation + (focused && active ? tapStrength : 0),
        0.42
      );
    }
    this.keyboard.visible = focused;
    this.keyboard.rotation.z = errorJolt * 1.8;
  }

  resolveHorizontal(next) {
    const player = this.player;
    for (const solid of this.solids) {
      if (player.position.y + player.height < solid.bottom || player.position.y > solid.top) continue;
      const overlapsX = next.x + player.radius > solid.minX && next.x - player.radius < solid.maxX;
      const overlapsZ = next.z + player.radius > solid.minZ && next.z - player.radius < solid.maxZ;
      if (!overlapsX || !overlapsZ) continue;
      const mantleHeight = solid.top - player.position.y;
      if (mantleHeight > 0.08 && mantleHeight <= 1.3 && player.velocity.y <= 1) {
        player.position.y = solid.top + 0.02;
        player.velocity.y = 0;
        continue;
      }
      const pushLeft = Math.abs((solid.minX - player.radius) - next.x);
      const pushRight = Math.abs((solid.maxX + player.radius) - next.x);
      const pushFront = Math.abs((solid.minZ - player.radius) - next.z);
      const pushBack = Math.abs((solid.maxZ + player.radius) - next.z);
      const minimum = Math.min(pushLeft, pushRight, pushFront, pushBack);
      if (minimum === pushLeft) next.x = solid.minX - player.radius;
      else if (minimum === pushRight) next.x = solid.maxX + player.radius;
      else if (minimum === pushFront) next.z = solid.minZ - player.radius;
      else next.z = solid.maxZ + player.radius;
    }
  }

  supportAt(x, z) {
    let support = null;
    for (const platform of this.platforms) {
      if (
        x > platform.minX + 0.12 &&
        x < platform.maxX - 0.12 &&
        z > platform.minZ + 0.12 &&
        z < platform.maxZ - 0.12
      ) {
        support = support === null ? platform.top : Math.max(support, platform.top);
      }
    }
    return support;
  }

  updateCheckpoint() {
    const nextCheckpoint = this.checkpoints[this.state.checkpointIndex];
    if (nextCheckpoint && this.player.position.z < nextCheckpoint.z + 2) {
      this.player.respawn.copy(nextCheckpoint);
      this.state.checkpointIndex += 1;
    }
  }

  respawn() {
    this.player.position.copy(this.player.respawn);
    this.player.velocity.set(0, 0, 0);
    this.player.health = 100;
    this.player.shield = 100;
    this.state.grace = 4;
    this.leaveFocus();
    this.announce('ECHO REKONSTRUIERT');
    this.ui.damageFlash.classList.add('heavy');
    setTimeout(() => this.ui.damageFlash.classList.remove('heavy'), 260);
  }

  updateEnemies(realDt, worldDt) {
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      enemy.phase += worldDt;
      enemy.group.position.y = enemy.baseY + Math.sin(enemy.phase * 2.2) * 0.18;
      enemy.halo.rotation.z += worldDt * (enemy.typeName === 'boss' ? 1.5 : 0.8);
      enemy.group.lookAt(this.player.position.x, enemy.group.position.y, this.player.position.z);
      enemy.cooldown -= worldDt;
      const distance = distanceXZ(enemy.group.position, this.player.position);
      if (this.state.mode === 'playing' && distance < 31 && enemy.cooldown <= 0) {
        enemy.cooldown = enemy.typeName === 'sniper' ? 3.2 : 2 + Math.random() * 1.5;
        this.enemyAttack(enemy);
      }
    }

    if (this.state.mode === 'focus' && this.state.target && !this.state.target.dead) {
      const saveWpm = this.callbacks.getRollingWpm?.() || 12;
      const adaptive = this.settings.adaptive !== false;
      const effectiveWpm = adaptive ? Math.max(8, saveWpm * 1.1) : this.state.mission.targetWpm;
      const remaining = Math.max(3, this.state.prompt.length - this.state.promptIndex);
      const expectedSeconds = clamp((remaining / 5 / effectiveWpm) * 60 * 1.3, 2.4, 11);
      this.state.threat += realDt / expectedSeconds + this.state.target.type.threat * realDt * 0.09;
      if (this.state.threat >= 1) {
        this.state.threat = 0.22;
        this.enemyAttack(this.state.target);
      }
    }
  }

  enemyAttack(enemy) {
    const start = enemy.eye.getWorldPosition(new THREE.Vector3());
    const target = this.cameraRig.position.clone();
    const velocity = target.sub(start).normalize().multiplyScalar(enemy.typeName === 'sniper' ? 17 : 11);
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), this.materials.danger);
    mesh.position.copy(start);
    this.world.add(mesh);
    this.projectiles.push({
      mesh,
      velocity,
      life: 6,
      damage: enemy.type.damage,
      nearMiss: false
    });
    this.createTracer(start, start.clone().add(velocity.clone().normalize().multiplyScalar(1.4)), false, enemy.type.color);
    this.tone(enemy.typeName === 'sniper' ? 90 : 145, 0.12, 'sawtooth', 0.045, -40);
  }

  updateProjectiles(worldDt) {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const shot = this.projectiles[index];
      shot.life -= worldDt;
      shot.mesh.position.addScaledVector(shot.velocity, worldDt);
      shot.mesh.rotation.x += worldDt * 7;
      shot.mesh.rotation.y += worldDt * 9;
      const distance = shot.mesh.position.distanceTo(this.cameraRig.position);
      if (!shot.nearMiss && distance < 1.5 && this.player.invulnerable > 0) {
        shot.nearMiss = true;
        this.state.dodges += 1;
        this.announce('PHASE DODGE');
        this.tone(680, 0.1, 'sine', 0.04, 230);
      }
      if (distance < 0.68) {
        if (this.player.invulnerable <= 0) this.damagePlayer(shot.damage);
        this.world.remove(shot.mesh);
        this.projectiles.splice(index, 1);
      } else if (shot.life <= 0 || Math.abs(shot.mesh.position.x) > 65 || shot.mesh.position.y < -10) {
        this.world.remove(shot.mesh);
        this.projectiles.splice(index, 1);
      }
    }
  }

  damagePlayer(amount) {
    if (this.state.grace > 0) return;
    this.player.shieldDelay = 5;
    let remaining = amount;
    if (this.player.shield > 0) {
      const absorbed = Math.min(this.player.shield, remaining);
      this.player.shield -= absorbed;
      remaining -= absorbed;
    }
    this.player.health -= remaining;
    this.state.shake = Math.max(this.state.shake, 0.18);
    this.ui.damageFlash.classList.add('active');
    setTimeout(() => this.ui.damageFlash.classList.remove('active'), 140);
    this.tone(78, 0.22, 'sawtooth', 0.08, -30);
    if (this.player.health <= 0) this.respawn();
  }

  createTracer(start, end, perfect = false, forcedColor = null) {
    const direction = end.clone().sub(start);
    const length = direction.length();
    const color = forcedColor || (perfect ? 0xb8fff8 : 0x63e8df);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(perfect ? 0.025 : 0.014, 0.006, length, 6),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending
      })
    );
    mesh.position.copy(start).addScaledVector(direction, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    this.world.add(mesh);
    this.effects.push({ mesh, life: perfect ? 0.14 : 0.09, maxLife: perfect ? 0.14 : 0.09, type: 'tracer' });
  }

  burst(position, color, count = 8) {
    for (let index = 0; index < count; index += 1) {
      const mesh = new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.04 + Math.random() * 0.06),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          blending: THREE.AdditiveBlending
        })
      );
      mesh.position.copy(position);
      this.world.add(mesh);
      this.effects.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.2) * 4,
          (Math.random() - 0.5) * 5
        ),
        life: 0.35 + Math.random() * 0.25,
        maxLife: 0.6,
        type: 'particle'
      });
    }
  }

  updateEffects(worldDt) {
    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index];
      effect.life -= worldDt;
      if (effect.type === 'particle') {
        effect.mesh.position.addScaledVector(effect.velocity, worldDt);
        effect.velocity.y -= worldDt * 4;
        effect.mesh.rotation.x += worldDt * 8;
      }
      effect.mesh.material.opacity = clamp(effect.life / effect.maxLife, 0, 1);
      if (effect.life <= 0) {
        this.world.remove(effect.mesh);
        this.effects.splice(index, 1);
      }
    }
  }

  updateWeather(worldDt) {
    if (!this.weather) return;
    const positions = this.weather.geometry.attributes.position.array;
    const fallSpeed = 0.48;
    for (let index = 1; index < positions.length; index += 3) {
      positions[index] -= worldDt * fallSpeed;
      if (positions[index] < -2) positions[index] = 28;
    }
    this.weather.geometry.attributes.position.needsUpdate = true;
  }

  updateGoal(realDt) {
    if (!this.goal) return;
    this.goal.ring.rotation.z += realDt * 0.35;
    this.goal.crown.rotation.z -= realDt * 0.5;
    this.goal.inner.material.opacity = 0.06 + Math.sin(this.state.elapsed * 2.4) * 0.025;
    if (distanceXZ(this.player.position, this.goalPosition) < 4.1) {
      if (this.goal.locked && this.enemies.some((enemy) => enemy.typeName === 'boss' && !enemy.dead)) {
        const away = this.player.position.clone().sub(this.goalPosition).setY(0).normalize();
        this.player.position.addScaledVector(away, 1.2);
        this.announce('ARCHIV-WÄCHTER BLOCKIERT DIE ÜBERTRAGUNG');
      } else {
        this.completeMission();
      }
    }
  }

  updateHud() {
    const elapsedMinutes = Math.max(this.state.elapsed / 60, 1 / 60);
    const wpm = Math.round((this.state.correct / 5) / elapsedMinutes);
    const accuracy = this.state.typed ? Math.round((this.state.correct / this.state.typed) * 100) : 100;
    const routeLength = Math.max(1, this.routeStart.z - this.goalPosition.z);
    const routeProgress = clamp((this.routeStart.z - this.player.position.z) / routeLength, 0, 1);
    this.state.progress = routeProgress;
    this.ui.healthValue.textContent = Math.max(0, Math.round(this.player.health));
    this.ui.healthBar.style.width = `${clamp(this.player.health, 0, 100)}%`;
    this.ui.shieldBar.style.width = `${clamp(this.player.shield, 0, 100)}%`;
    this.ui.dashBar.style.width = `${(1 - clamp(this.player.dashCooldown / (this.state.mode === 'focus' ? 2.5 : 1.2), 0, 1)) * 100}%`;
    this.ui.routeBar.style.width = `${routeProgress * 100}%`;
    this.ui.wpm.textContent = `${wpm} WPM`;
    this.ui.accuracy.textContent = `${accuracy}%`;
    this.ui.combo.textContent = `×${this.state.streak}`;
    this.ui.threatBar.style.width = `${clamp(this.state.threat, 0, 1) * 100}%`;
    this.ui.enemyHealth.style.width = this.state.target
      ? `${clamp(this.state.target.health / this.state.target.maxHealth, 0, 1) * 100}%`
      : '0%';
    const remaining = Math.max(0, Math.round(distanceXZ(this.player.position, this.goalPosition)));
    this.ui.distance.textContent = `${remaining} M`;
  }

  completeMission() {
    if (this.state.mode === 'complete') return;
    this.state.mode = 'complete';
    document.exitPointerLock?.();
    const minutes = Math.max(this.state.elapsed / 60, 1 / 60);
    const wpm = Math.round((this.state.correct / 5) / minutes);
    const accuracy = this.state.typed ? this.state.correct / this.state.typed : 1;
    let rank = 'D';
    if (accuracy >= 0.98 && wpm >= this.state.mission.targetWpm) rank = 'S';
    else if (accuracy >= 0.95 && wpm >= this.state.mission.targetWpm * 0.8) rank = 'A';
    else if (accuracy >= 0.9) rank = 'B';
    else if (accuracy >= 0.8) rank = 'C';
    const result = {
      mission: this.state.mission,
      training: this.state.training,
      time: this.state.elapsed,
      wpm,
      accuracy,
      errors: this.state.errors,
      streak: this.state.bestStreak,
      dodges: this.state.dodges,
      rank
    };
    this.ui.hud.classList.add('hidden');
    this.ui.typing.classList.add('hidden');
    this.tone(340, 0.5, 'sine', 0.08, 480);
    this.callbacks.onComplete?.(result);
  }

  pause() {
    if (this.state.mode !== 'playing' && this.state.mode !== 'focus') return;
    this.state.modeBeforePause = this.state.mode;
    this.state.mode = 'paused';
    document.exitPointerLock?.();
    this.callbacks.onPause?.();
  }

  resume() {
    if (this.state.mode !== 'paused') return;
    this.state.mode = this.state.modeBeforePause || 'playing';
    this.canvas.requestPointerLock?.();
    this.clock.getDelta();
  }

  stop() {
    this.state.mode = 'menu';
    this.state.target = null;
    document.exitPointerLock?.();
    this.ui.hud.classList.add('hidden');
    this.ui.typing.classList.add('hidden');
  }

  announce(text) {
    this.ui.announcement.textContent = text;
    this.ui.announcement.classList.remove('hidden');
    clearTimeout(this.announcementTimeout);
    this.announcementTimeout = setTimeout(() => this.ui.announcement.classList.add('hidden'), 1900);
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.settings.quality === 'low' ? 1 : 1.5));
  }

  tone(frequency, duration, type = 'sine', volume = 0.05, slide = 0) {
    if ((this.settings.volume ?? 0.7) <= 0) return;
    try {
      if (!this.audio) this.audio = new AudioContext();
      const oscillator = this.audio.createOscillator();
      const gain = this.audio.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, this.audio.currentTime);
      oscillator.frequency.linearRampToValueAtTime(Math.max(20, frequency + slide), this.audio.currentTime + duration);
      gain.gain.setValueAtTime(volume * (this.settings.volume ?? 0.7), this.audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.audio.currentTime + duration);
      oscillator.connect(gain).connect(this.audio.destination);
      oscillator.start();
      oscillator.stop(this.audio.currentTime + duration);
    } catch {
      // Audio is optional.
    }
  }

  animate() {
    requestAnimationFrame(this.animate);
    const realDt = Math.min(this.clock.getDelta(), 0.05);
    const active = this.state.mode === 'playing' || this.state.mode === 'focus';
    if (active) {
      this.state.elapsed += realDt;
      const worldDt = realDt * (this.state.mode === 'focus' ? 0.4 : 1);
      this.updatePlayer(realDt, worldDt);
      this.updateEnemies(realDt, worldDt);
      this.updateProjectiles(worldDt);
      this.updateEffects(worldDt);
      this.updateWeather(worldDt);
      this.updateGoal(realDt);
      this.updateHud();
    }
    this.renderer.render(this.scene, this.camera);
  }
}
