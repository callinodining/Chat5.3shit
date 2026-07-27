(() => {
  'use strict';

  if (!window.THREE) {
    document.body.innerHTML = '<p style="color:white;padding:2rem">Three.js konnte nicht geladen werden.</p>';
    return;
  }

  const THREE = window.THREE;
  const $ = (id) => document.getElementById(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (min, max) => min + Math.random() * (max - min);
  const distance2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  const ui = {
    canvas: $('gameCanvas'),
    hud: $('hud'),
    menu: $('screenMenu'),
    how: $('screenHow'),
    pause: $('screenPause'),
    end: $('screenEnd'),
    start: $('startButton'),
    howOpen: $('howButton'),
    howBack: $('howBackButton'),
    resume: $('resumeButton'),
    restart: $('restartButton'),
    menuButton: $('menuButton'),
    endRestart: $('endRestartButton'),
    endMenu: $('endMenuButton'),
    health: $('healthValue'),
    healthRing: $('healthRing'),
    shield: $('shieldBar'),
    ammo: $('ammoValue'),
    dash: $('dashBar'),
    weaponStatus: $('weaponStatus'),
    mission: $('missionText'),
    relayCount: $('relayCount'),
    objective: $('objectiveMarker'),
    objectiveLabel: $('objectiveLabel'),
    objectiveDistance: $('objectiveDistance'),
    interaction: $('interaction'),
    interactionText: $('interactionText'),
    interactionBar: $('interactionBar'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    announcement: $('announcement'),
    damage: $('damageFlash'),
    dashFlash: $('dashFlash'),
    minimap: $('minimap'),
    endLabel: $('endLabel'),
    endTitle: $('endTitle'),
    endCopy: $('endCopy'),
    resultKills: $('resultKills'),
    resultTime: $('resultTime'),
    resultScore: $('resultScore')
  };

  const renderer = new THREE.WebGLRenderer({
    canvas: ui.canvas,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x071216);
  scene.fog = new THREE.FogExp2(0x0b2024, 0.018);

  const camera = new THREE.PerspectiveCamera(73, innerWidth / innerHeight, 0.08, 180);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  const clock = new THREE.Clock();
  const raycaster = new THREE.Raycaster();
  const center = new THREE.Vector2(0, 0);
  const colliders = [];
  const enemies = [];
  const projectiles = [];
  const effects = [];
  const pickups = [];
  const relays = [];
  const keys = Object.create(null);

  const state = {
    mode: 'menu',
    elapsed: 0,
    kills: 0,
    score: 0,
    currentRelay: 0,
    spawnTimer: 2,
    difficulty: 1,
    extractionProgress: 0,
    interactionProgress: 0,
    announcementTimer: 0,
    shake: 0,
    recoil: 0,
    bob: 0,
    lastFrame: performance.now()
  };

  const player = {
    position: new THREE.Vector3(0, 1.75, -30),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    radius: 0.52,
    height: 1.75,
    health: 100,
    shield: 100,
    ammo: 24,
    reserve: 120,
    fireCooldown: 0,
    reloadTimer: 0,
    dashCooldown: 0,
    shieldDelay: 0,
    isSprinting: false
  };

  let audio = null;
  let weapon = null;
  let muzzle = null;
  let extraction = null;
  let rain = null;

  const materials = {
    basalt: new THREE.MeshStandardMaterial({ color: 0x1b292a, roughness: 0.88, metalness: 0.06 }),
    basaltDark: new THREE.MeshStandardMaterial({ color: 0x0c1719, roughness: 0.92, metalness: 0.04 }),
    structure: new THREE.MeshStandardMaterial({ color: 0x26393a, roughness: 0.48, metalness: 0.64 }),
    structureDark: new THREE.MeshStandardMaterial({ color: 0x101c1e, roughness: 0.55, metalness: 0.72 }),
    cyan: new THREE.MeshStandardMaterial({ color: 0x2ddbd8, emissive: 0x087a79, emissiveIntensity: 2.2, roughness: 0.25, metalness: 0.4 }),
    amber: new THREE.MeshStandardMaterial({ color: 0xffb557, emissive: 0x9b4709, emissiveIntensity: 2.8, roughness: 0.25, metalness: 0.38 }),
    red: new THREE.MeshStandardMaterial({ color: 0xff5c4f, emissive: 0x8c0f08, emissiveIntensity: 2.5, roughness: 0.3 }),
    wet: new THREE.MeshStandardMaterial({ color: 0x102124, roughness: 0.28, metalness: 0.18 })
  };

  function makeAudio() {
    if (audio) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0.28;
    master.connect(ctx.destination);
    audio = { ctx, master };
  }

  function tone(frequency, duration, type = 'sine', volume = 0.08, slide = 0) {
    if (!audio) return;
    const now = audio.ctx.currentTime;
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, frequency + slide), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(now);
    osc.stop(now + duration);
  }

  function addBox(position, size, material = materials.basalt, collider = true, rotationY = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
    mesh.position.copy(position);
    mesh.rotation.y = rotationY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (collider) {
      colliders.push({
        minX: position.x - size.x / 2,
        maxX: position.x + size.x / 2,
        minZ: position.z - size.z / 2,
        maxZ: position.z + size.z / 2
      });
    }
    return mesh;
  }

  function addRock(x, z, scale, height = 4) {
    const geometry = new THREE.DodecahedronGeometry(1, 1);
    const rock = new THREE.Mesh(geometry, Math.random() > 0.45 ? materials.basalt : materials.basaltDark);
    rock.position.set(x, height * 0.42 - 0.2, z);
    rock.scale.set(scale, height, scale * rand(0.85, 1.25));
    rock.rotation.set(rand(-0.18, 0.18), rand(0, Math.PI), rand(-0.12, 0.12));
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
    colliders.push({ minX: x - scale * .72, maxX: x + scale * .72, minZ: z - scale * .72, maxZ: z + scale * .72 });
  }

  function buildWorld() {
    const hemi = new THREE.HemisphereLight(0x7cdfe5, 0x071011, 1.35);
    scene.add(hemi);

    const moon = new THREE.DirectionalLight(0x9be8e8, 3.2);
    moon.position.set(-28, 42, -20);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = -55;
    moon.shadow.camera.right = 55;
    moon.shadow.camera.top = 55;
    moon.shadow.camera.bottom = -55;
    scene.add(moon);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(92, 92, 1, 1), materials.wet);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(92, 46, 0x1c6766, 0x173839);
    grid.position.y = 0.012;
    grid.material.opacity = 0.18;
    grid.material.transparent = true;
    scene.add(grid);

    for (let i = -44; i <= 44; i += 6) {
      addRock(-46 + rand(-1, 1), i, rand(2.8, 5.6), rand(7, 14));
      addRock(46 + rand(-1, 1), i, rand(2.8, 5.6), rand(7, 14));
    }
    for (let i = -40; i <= 40; i += 8) {
      addRock(i, 46 + rand(-1, 1), rand(2.5, 5), rand(7, 12));
      addRock(i, -46 + rand(-1, 1), rand(2.5, 5), rand(7, 12));
    }

    const cover = [
      [-15,-22, 5,2.2,2], [14,-24, 6,2.6,2], [-27,-8, 4,3.5,3],
      [24,-3, 5,2.4,2], [-9,3, 7,2.2,2], [12,9, 5,3,2],
      [-27,18, 6,2.5,2], [26,22, 6,3,2], [0,19, 8,2.4,2],
      [-17,30, 4,3.2,3], [18,33, 5,2.6,2]
    ];
    cover.forEach(([x,z,sx,sy,sz], index) => {
      const base = addBox(new THREE.Vector3(x, sy / 2, z), new THREE.Vector3(sx, sy, sz), index % 3 ? materials.structureDark : materials.structure);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(sx * .72, .08, sz + .03), materials.cyan);
      strip.position.set(x, sy + .03, z);
      scene.add(strip);
      base.userData.cover = true;
    });

    addBox(new THREE.Vector3(0, .3, -6), new THREE.Vector3(12, .6, 5), materials.structure, true);
    addBox(new THREE.Vector3(0, .9, -2), new THREE.Vector3(8, 1.8, 3), materials.structureDark, true);

    createRelay(new THREE.Vector3(-25, 0, -14), 'RELAY 01');
    createRelay(new THREE.Vector3(25, 0, 2), 'RELAY 02');
    createRelay(new THREE.Vector3(0, 0, 31), 'RELAY 03');
    createExtraction();
    createRain();
    createWeapon();
  }

  function createRelay(position, label) {
    const group = new THREE.Group();
    group.position.copy(position);
    scene.add(group);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.7, .8, 10), materials.structureDark);
    base.position.y = .4;
    base.receiveShadow = true;
    base.castShadow = true;
    group.add(base);

    for (const side of [-1, 1]) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(.65, 5.8, 1.15), materials.structure);
      pylon.position.set(side * 2.15, 3.25, 0);
      pylon.rotation.z = side * -.14;
      pylon.castShadow = true;
      group.add(pylon);
    }

    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, .2, 12, 48), materials.amber.clone());
    ring.position.y = 3.8;
    group.add(ring);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(.75, 2), materials.amber.clone());
    core.position.y = 3.8;
    group.add(core);
    const light = new THREE.PointLight(0xffa942, 5, 18, 2);
    light.position.y = 4;
    group.add(light);

    colliders.push({ minX: position.x - 3.2, maxX: position.x + 3.2, minZ: position.z - 1.5, maxZ: position.z + 1.5 });
    relays.push({ group, ring, core, light, position: position.clone(), label, active: false });
  }

  function createExtraction() {
    extraction = new THREE.Group();
    extraction.position.set(0, 0, -35);
    extraction.visible = false;
    scene.add(extraction);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, .12, 12, 64), materials.cyan);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = .1;
    extraction.add(ring);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(.12, 1.7, 9, 24, 1, true), new THREE.MeshBasicMaterial({
      color: 0x59ffef, transparent: true, opacity: .16, side: THREE.DoubleSide
    }));
    pillar.position.y = 4.5;
    extraction.add(pillar);
    const light = new THREE.PointLight(0x51fff1, 6, 22, 2);
    light.position.y = 2;
    extraction.add(light);
  }

  function createRain() {
    const count = 1500;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = rand(-50, 50);
      positions[i * 3 + 1] = rand(1, 30);
      positions[i * 3 + 2] = rand(-50, 50);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    rain = new THREE.Points(geometry, new THREE.PointsMaterial({
      color: 0xa4e8e6, size: .035, transparent: true, opacity: .46, depthWrite: false
    }));
    scene.add(rain);
  }

  function createWeapon() {
    weapon = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(.34, .28, 1.18), materials.structureDark);
    body.position.z = -.45;
    weapon.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(.25, .16, .72), materials.structure);
    top.position.set(0, .18, -.35);
    weapon.add(top);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.055, .075, .7, 12), materials.structure);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, .02, -1.25);
    weapon.add(barrel);
    const energy = new THREE.Mesh(new THREE.BoxGeometry(.04, .1, .58), materials.cyan);
    energy.position.set(.175, .08, -.35);
    weapon.add(energy);
    muzzle = new THREE.PointLight(0x8ffff8, 0, 4);
    muzzle.position.set(0, .02, -1.65);
    weapon.add(muzzle);
    weapon.position.set(.46, -.4, -.76);
    weapon.rotation.set(-.02, -.08, 0);
    camera.add(weapon);
  }

  function createDrone(position, tier = 0) {
    const group = new THREE.Group();
    group.position.copy(position);
    scene.add(group);

    const dark = materials.structureDark.clone();
    dark.color.setHex(tier > 0 ? 0x301b1b : 0x172326);
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(tier ? .78 : .58, 1), dark);
    body.castShadow = true;
    group.add(body);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(tier ? .22 : .16, 12, 8), materials.red.clone());
    eye.position.z = .48;
    group.add(eye);

    for (let i = 0; i < 4; i += 1) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(.12, .1, tier ? 1.35 : 1.0), dark);
      arm.rotation.y = i * Math.PI / 2;
      arm.position.set(Math.sin(i * Math.PI / 2) * .56, 0, Math.cos(i * Math.PI / 2) * .56);
      group.add(arm);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(.1, 8, 6), materials.red);
      tip.position.set(Math.sin(i * Math.PI / 2) * 1.02, 0, Math.cos(i * Math.PI / 2) * 1.02);
      group.add(tip);
    }

    const enemy = {
      group,
      body,
      eye,
      health: tier ? 150 : 70,
      maxHealth: tier ? 150 : 70,
      speed: tier ? 3.4 : rand(4, 5.4),
      damage: tier ? 18 : 11,
      shootTimer: rand(.4, 1.5),
      radius: tier ? .85 : .65,
      phase: rand(0, Math.PI * 2),
      tier,
      dead: false
    };
    group.userData.enemy = enemy;
    body.userData.enemy = enemy;
    eye.userData.enemy = enemy;
    enemies.push(enemy);
  }

  function spawnEnemy() {
    const angle = rand(0, Math.PI * 2);
    const radius = rand(28, 41);
    const position = new THREE.Vector3(
      clamp(player.position.x + Math.sin(angle) * radius, -40, 40),
      rand(2.1, 4.5),
      clamp(player.position.z + Math.cos(angle) * radius, -40, 40)
    );
    const tier = state.currentRelay >= 2 && Math.random() < .18 ? 1 : 0;
    createDrone(position, tier);
  }

  function resolveMovement(next) {
    next.x = clamp(next.x, -42.5, 42.5);
    next.z = clamp(next.z, -42.5, 42.5);
    for (const box of colliders) {
      const closestX = clamp(next.x, box.minX, box.maxX);
      const closestZ = clamp(next.z, box.minZ, box.maxZ);
      const dx = next.x - closestX;
      const dz = next.z - closestZ;
      const distance = Math.hypot(dx, dz);
      if (distance < player.radius) {
        if (distance > .001) {
          const push = player.radius - distance;
          next.x += (dx / distance) * push;
          next.z += (dz / distance) * push;
        } else {
          const left = Math.abs(next.x - box.minX);
          const right = Math.abs(box.maxX - next.x);
          const top = Math.abs(next.z - box.minZ);
          const bottom = Math.abs(box.maxZ - next.z);
          const min = Math.min(left, right, top, bottom);
          if (min === left) next.x = box.minX - player.radius;
          else if (min === right) next.x = box.maxX + player.radius;
          else if (min === top) next.z = box.minZ - player.radius;
          else next.z = box.maxZ + player.radius;
        }
      }
    }
    return next;
  }

  function updatePlayer(dt) {
    const forwardInput = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    const rightInput = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const length = Math.hypot(forwardInput, rightInput) || 1;
    const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    const direction = forward.multiplyScalar(forwardInput / length).add(right.multiplyScalar(rightInput / length));
    player.isSprinting = Boolean(keys.ShiftLeft || keys.ShiftRight) && forwardInput > 0;
    const speed = player.isSprinting ? 9.2 : 6.2;
    const desired = direction.multiplyScalar(speed);
    const smoothing = 1 - Math.exp(-dt * (direction.lengthSq() ? 12 : 8));
    player.velocity.x = lerp(player.velocity.x, desired.x, smoothing);
    player.velocity.z = lerp(player.velocity.z, desired.z, smoothing);

    const next = player.position.clone();
    next.x += player.velocity.x * dt;
    next.z += player.velocity.z * dt;
    resolveMovement(next);
    player.position.copy(next);

    const moving = Math.hypot(player.velocity.x, player.velocity.z) > .4;
    state.bob += dt * (player.isSprinting ? 12 : 8) * (moving ? 1 : .15);
    const bobAmount = moving ? (player.isSprinting ? .055 : .035) : .008;
    const shakeX = (Math.random() - .5) * state.shake;
    const shakeY = (Math.random() - .5) * state.shake;
    camera.position.set(
      player.position.x + Math.sin(state.bob * .5) * bobAmount + shakeX,
      player.position.y + Math.abs(Math.sin(state.bob)) * bobAmount + shakeY,
      player.position.z
    );
    camera.rotation.y = player.yaw + shakeX * .05;
    camera.rotation.x = player.pitch + state.recoil + shakeY * .05;
    state.recoil = lerp(state.recoil, 0, 1 - Math.exp(-dt * 15));
    state.shake = Math.max(0, state.shake - dt * 2.3);

    weapon.position.x = lerp(weapon.position.x, .46 + (moving ? Math.sin(state.bob * .5) * .018 : 0), 1 - Math.exp(-dt * 10));
    weapon.position.y = lerp(weapon.position.y, -.4 + (moving ? Math.abs(Math.sin(state.bob)) * .018 : 0), 1 - Math.exp(-dt * 10));
    weapon.rotation.z = lerp(weapon.rotation.z, rightInput * -.025, 1 - Math.exp(-dt * 8));

    player.fireCooldown = Math.max(0, player.fireCooldown - dt);
    player.dashCooldown = Math.max(0, player.dashCooldown - dt);
    player.shieldDelay = Math.max(0, player.shieldDelay - dt);
    if (player.shieldDelay <= 0) player.shield = Math.min(100, player.shield + dt * 11);

    if (player.reloadTimer > 0) {
      player.reloadTimer -= dt;
      weapon.rotation.x = -.02 + Math.sin((1.35 - player.reloadTimer) * 5) * .16;
      if (player.reloadTimer <= 0) finishReload();
    } else {
      weapon.rotation.x = lerp(weapon.rotation.x, -.02, 1 - Math.exp(-dt * 9));
    }
  }

  function dash() {
    if (state.mode !== 'playing' || player.dashCooldown > 0) return;
    const forwardInput = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    const rightInput = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    const direction = forward.multiplyScalar(forwardInput).add(right.multiplyScalar(rightInput));
    if (direction.lengthSq() < .1) direction.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    direction.normalize();
    player.velocity.addScaledVector(direction, 19);
    player.dashCooldown = 3.2;
    ui.dashFlash.style.opacity = '1';
    setTimeout(() => { ui.dashFlash.style.opacity = '0'; }, 90);
    state.shake = .09;
    tone(130, .16, 'sawtooth', .1, 290);
  }

  function reload() {
    if (player.reloadTimer > 0 || player.ammo >= 24 || player.reserve <= 0) return;
    player.reloadTimer = 1.35;
    tone(230, .08, 'square', .035, -30);
    setTimeout(() => tone(420, .09, 'square', .03, 90), 720);
  }

  function finishReload() {
    const needed = 24 - player.ammo;
    const amount = Math.min(needed, player.reserve);
    player.ammo += amount;
    player.reserve -= amount;
    weapon.rotation.x = -.02;
    tone(510, .08, 'square', .04, 100);
  }

  function fire() {
    if (state.mode !== 'playing' || player.fireCooldown > 0 || player.reloadTimer > 0) return;
    if (player.ammo <= 0) {
      tone(90, .06, 'square', .04);
      reload();
      return;
    }
    player.ammo -= 1;
    player.fireCooldown = .115;
    state.recoil -= .018;
    state.shake = Math.max(state.shake, .035);
    muzzle.intensity = 7;
    setTimeout(() => { muzzle.intensity = 0; }, 35);
    ui.crosshair.classList.add('firing');
    setTimeout(() => ui.crosshair.classList.remove('firing'), 70);
    tone(115, .055, 'sawtooth', .12, -45);
    tone(650, .035, 'square', .025, -180);

    raycaster.setFromCamera(center, camera);
    raycaster.far = 80;
    const targets = enemies.filter((enemy) => !enemy.dead).flatMap((enemy) => [enemy.body, enemy.eye]);
    const hits = raycaster.intersectObjects(targets, false);
    let end = camera.position.clone().add(raycaster.ray.direction.clone().multiplyScalar(65));
    if (hits.length) {
      const hit = hits[0];
      end = hit.point.clone();
      const enemy = hit.object.userData.enemy;
      const critical = hit.object === enemy.eye;
      damageEnemy(enemy, critical ? 52 : 29, critical);
    }
    createTracer(camera.position.clone().add(raycaster.ray.direction.clone().multiplyScalar(1.2)), end, 0x80fff5);
    updateHud();
  }

  function createTracer(start, end, color) {
    const direction = end.clone().sub(start);
    const length = direction.length();
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(.018, .018, length, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .85 })
    );
    mesh.position.copy(start).add(end).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    scene.add(mesh);
    effects.push({ mesh, life: .065, maxLife: .065, type: 'fade' });
  }

  function burst(position, color, count = 8) {
    for (let i = 0; i < count; i += 1) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(rand(.025, .07), 5, 4),
        new THREE.MeshBasicMaterial({ color, transparent: true })
      );
      mesh.position.copy(position);
      scene.add(mesh);
      effects.push({
        mesh,
        velocity: new THREE.Vector3(rand(-3, 3), rand(-1, 3), rand(-3, 3)),
        life: rand(.2, .45),
        maxLife: .45,
        type: 'particle'
      });
    }
  }

  function damageEnemy(enemy, amount, critical) {
    if (!enemy || enemy.dead) return;
    enemy.health -= amount;
    enemy.eye.material.emissiveIntensity = 7;
    setTimeout(() => { if (!enemy.dead) enemy.eye.material.emissiveIntensity = 2.5; }, 55);
    ui.hitmarker.style.opacity = '1';
    ui.hitmarker.style.color = critical ? '#ffbf68' : '#ffffff';
    setTimeout(() => { ui.hitmarker.style.opacity = '0'; }, 80);
    burst(enemy.group.position, critical ? 0xffc06a : 0xff655a, critical ? 10 : 5);
    if (enemy.health <= 0) killEnemy(enemy);
  }

  function killEnemy(enemy) {
    enemy.dead = true;
    state.kills += 1;
    state.score += enemy.tier ? 350 : 100;
    burst(enemy.group.position, 0xff6b52, enemy.tier ? 22 : 14);
    scene.remove(enemy.group);
    if (Math.random() < .24) createPickup(enemy.group.position, Math.random() < .55 ? 'ammo' : 'shield');
    tone(75, .18, 'sawtooth', .06, -35);
  }

  function createPickup(position, type) {
    const mesh = new THREE.Mesh(
      type === 'ammo' ? new THREE.BoxGeometry(.55, .32, .75) : new THREE.OctahedronGeometry(.42),
      type === 'ammo' ? materials.amber.clone() : materials.cyan.clone()
    );
    mesh.position.copy(position);
    mesh.position.y = .65;
    scene.add(mesh);
    pickups.push({ mesh, type, phase: rand(0, 6) });
  }

  function updateEnemies(dt) {
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      enemy.phase += dt * 2.2;
      enemy.group.position.y += Math.sin(enemy.phase) * dt * .18;
      const toPlayer = player.position.clone().sub(enemy.group.position);
      const distance = toPlayer.length();
      const flat = toPlayer.clone();
      flat.y = 0;
      flat.normalize();
      if (distance > (enemy.tier ? 9 : 6.5)) {
        enemy.group.position.addScaledVector(flat, enemy.speed * dt);
      } else if (distance < 4) {
        enemy.group.position.addScaledVector(flat, -enemy.speed * .6 * dt);
      }
      enemy.group.lookAt(player.position.x, enemy.group.position.y, player.position.z);
      enemy.shootTimer -= dt;
      if (enemy.shootTimer <= 0 && distance < 26) {
        enemy.shootTimer = enemy.tier ? rand(.6, .95) : rand(1.1, 1.8);
        enemyShoot(enemy);
      }
    }
  }

  function enemyShoot(enemy) {
    const direction = player.position.clone().sub(enemy.group.position).normalize();
    direction.x += rand(-.045, .045);
    direction.y += rand(-.02, .02);
    direction.z += rand(-.045, .045);
    projectiles.push({
      mesh: new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 6), materials.red.clone()),
      velocity: direction.clone().normalize().multiplyScalar(enemy.tier ? 16 : 13),
      life: 4,
      damage: enemy.damage
    });
    const projectile = projectiles.at(-1);
    projectile.mesh.position.copy(enemy.group.position);
    projectile.mesh.position.y += .05;
    scene.add(projectile.mesh);
    createTracer(
      enemy.group.position,
      enemy.group.position.clone().add(direction.clone().normalize().multiplyScalar(1.5)),
      0xff5147
    );
    tone(180, .05, 'sawtooth', .018, -50);
  }

  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i -= 1) {
      const shot = projectiles[i];
      shot.life -= dt;
      shot.mesh.position.addScaledVector(shot.velocity, dt);
      if (distance2D(shot.mesh.position, player.position) < .62 && Math.abs(shot.mesh.position.y - player.position.y) < 1.1) {
        damagePlayer(shot.damage);
        scene.remove(shot.mesh);
        projectiles.splice(i, 1);
      } else if (shot.life <= 0) {
        scene.remove(shot.mesh);
        projectiles.splice(i, 1);
      }
    }
  }

  function damagePlayer(amount) {
    if (state.elapsed < 10) return;
    amount *= .65;
    player.shieldDelay = 4;
    let remaining = amount;
    if (player.shield > 0) {
      const absorbed = Math.min(player.shield, remaining);
      player.shield -= absorbed;
      remaining -= absorbed;
    }
    player.health -= remaining;
    state.shake = .18;
    ui.damage.style.opacity = remaining > 0 ? '.72' : '.35';
    setTimeout(() => { ui.damage.style.opacity = '0'; }, 110);
    tone(62, .2, 'sawtooth', .12, -25);
    if (player.health <= 0) endGame(false);
    updateHud();
  }

  function updatePickups(dt) {
    for (let i = pickups.length - 1; i >= 0; i -= 1) {
      const pickup = pickups[i];
      pickup.phase += dt * 2;
      pickup.mesh.rotation.y += dt * 1.8;
      pickup.mesh.position.y = .68 + Math.sin(pickup.phase) * .12;
      if (distance2D(pickup.mesh.position, player.position) < 1.2) {
        if (pickup.type === 'ammo') player.reserve = Math.min(180, player.reserve + 36);
        else player.shield = Math.min(100, player.shield + 45);
        tone(pickup.type === 'ammo' ? 480 : 680, .16, 'sine', .08, 260);
        scene.remove(pickup.mesh);
        pickups.splice(i, 1);
        updateHud();
      }
    }
  }

  function updateEffects(dt) {
    for (let i = effects.length - 1; i >= 0; i -= 1) {
      const effect = effects[i];
      effect.life -= dt;
      if (effect.type === 'particle') effect.mesh.position.addScaledVector(effect.velocity, dt);
      effect.mesh.material.opacity = clamp(effect.life / effect.maxLife, 0, 1);
      if (effect.life <= 0) {
        scene.remove(effect.mesh);
        effect.mesh.geometry.dispose();
        effect.mesh.material.dispose();
        effects.splice(i, 1);
      }
    }
  }

  function updateMission(dt) {
    const target = state.currentRelay < relays.length ? relays[state.currentRelay] : extraction;
    const targetPosition = target.position;
    const distance = distance2D(player.position, targetPosition);
    const near = distance < (state.currentRelay < relays.length ? 4.6 : 5.3);
    const interacting = near && keys.KeyE;

    ui.objectiveDistance.textContent = `${Math.round(distance)} M`;
    ui.objectiveLabel.textContent = state.currentRelay < 3 ? relays[state.currentRelay].label : 'EXTRAKTION';
    ui.interaction.classList.toggle('hidden', !near);
    ui.interactionText.textContent = state.currentRelay < 3 ? 'RELAY SYNCHRONISIEREN' : 'EXTRAKTION VORBEREITEN';

    if (interacting) {
      state.interactionProgress = clamp(state.interactionProgress + dt / (state.currentRelay < 3 ? 2.8 : 3.5), 0, 1);
      if (state.interactionProgress >= 1) {
        if (state.currentRelay < 3) activateRelay();
        else endGame(true);
      }
    } else {
      state.interactionProgress = Math.max(0, state.interactionProgress - dt * .45);
    }
    ui.interactionBar.style.width = `${state.interactionProgress * 100}%`;

    if (state.currentRelay < 3) {
      const relay = relays[state.currentRelay];
      relay.ring.rotation.y += dt * 1.4;
      relay.core.rotation.y -= dt * .8;
      relay.core.scale.setScalar(1 + Math.sin(state.elapsed * 3) * .08);
    } else {
      extraction.rotation.y += dt * .16;
    }
  }

  function activateRelay() {
    const relay = relays[state.currentRelay];
    relay.active = true;
    relay.ring.material = materials.cyan.clone();
    relay.core.material = materials.cyan.clone();
    relay.light.color.setHex(0x54f0ef);
    state.currentRelay += 1;
    state.interactionProgress = 0;
    state.score += 1000;
    state.difficulty += .55;
    for (let i = 0; i < 3 + state.currentRelay; i += 1) spawnEnemy();
    announce(state.currentRelay < 3 ? `RELAY 0${state.currentRelay} ONLINE` : 'NETZWERK STABIL — EXTRAKTION OFFEN');
    tone(260, .35, 'sawtooth', .1, 540);
    setTimeout(() => tone(620, .4, 'sine', .08, 380), 160);
    if (state.currentRelay >= 3) {
      extraction.visible = true;
      ui.mission.textContent = 'EXTRAKTION ERREICHEN';
    } else {
      ui.mission.textContent = `${relays[state.currentRelay].label} ERREICHEN`;
    }
    updateHud();
  }

  function updateSpawning(dt) {
    state.spawnTimer -= dt;
    const cap = 7 + state.currentRelay * 3;
    const living = enemies.filter((enemy) => !enemy.dead).length;
    if (state.spawnTimer <= 0 && living < cap) {
      spawnEnemy();
      state.spawnTimer = Math.max(1.1, 4.6 - state.difficulty * .48) + rand(0, 1.4);
    }
  }

  function updateRain(dt) {
    const positions = rain.geometry.attributes.position.array;
    for (let i = 1; i < positions.length; i += 3) {
      positions[i] -= dt * 18;
      if (positions[i] < .2) positions[i] = 28;
    }
    rain.geometry.attributes.position.needsUpdate = true;
    rain.position.x = player.position.x * .15;
    rain.position.z = player.position.z * .15;
  }

  function drawMinimap() {
    const ctx = ui.minimap.getContext('2d');
    const size = ui.minimap.width;
    const scale = size / 100;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.fillStyle = 'rgba(2,12,15,.64)';
    ctx.strokeStyle = 'rgba(103,220,216,.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, size * .47, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-size*.42,0); ctx.lineTo(size*.42,0);
    ctx.moveTo(0,-size*.42); ctx.lineTo(0,size*.42);
    ctx.stroke();

    for (let i = 0; i < relays.length; i += 1) {
      const relay = relays[i];
      ctx.fillStyle = relay.active ? '#54f0ef' : '#ffbf68';
      ctx.save();
      ctx.translate(relay.position.x * scale, relay.position.z * scale);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-3, -3, 6, 6);
      ctx.restore();
    }
    if (extraction.visible) {
      ctx.strokeStyle = '#54f0ef';
      ctx.beginPath();
      ctx.arc(extraction.position.x * scale, extraction.position.z * scale, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#ff675d';
    enemies.forEach((enemy) => {
      if (!enemy.dead) ctx.fillRect(enemy.group.position.x * scale - 1.5, enemy.group.position.z * scale - 1.5, 3, 3);
    });
    ctx.fillStyle = '#fff';
    ctx.save();
    ctx.translate(player.position.x * scale, player.position.z * scale);
    ctx.rotate(-player.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(4, 5); ctx.lineTo(-4, 5); ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  function updateObjectiveMarker() {
    const target = state.currentRelay < 3 ? relays[state.currentRelay].position : extraction.position;
    const projected = target.clone();
    projected.y = state.currentRelay < 3 ? 5.3 : 2.5;
    projected.project(camera);
    const behind = projected.z > 1;
    const x = clamp((projected.x * .5 + .5) * innerWidth, 70, innerWidth - 70);
    const y = clamp((-projected.y * .5 + .5) * innerHeight, 90, innerHeight - 120);
    ui.objective.style.left = `${behind ? innerWidth / 2 : x}px`;
    ui.objective.style.top = `${behind ? 90 : y}px`;
    ui.objective.style.opacity = behind ? '.55' : '1';
  }

  function updateHud() {
    ui.health.textContent = Math.max(0, Math.ceil(player.health));
    ui.healthRing.style.strokeDashoffset = `${270 * (1 - clamp(player.health / 100, 0, 1))}`;
    ui.healthRing.style.stroke = player.health < 30 ? '#ff675d' : '#54f0ef';
    ui.shield.style.width = `${clamp(player.shield, 0, 100)}%`;
    ui.ammo.textContent = player.ammo;
    ui.relayCount.textContent = `${state.currentRelay} / 3`;
    ui.dash.style.width = `${(1 - clamp(player.dashCooldown / 3.2, 0, 1)) * 100}%`;
    ui.weaponStatus.textContent = player.reloadTimer > 0 ? 'NACHLADEN' : `${player.reserve} RESERVE`;
  }

  function announce(text) {
    ui.announcement.textContent = text;
    ui.announcement.classList.remove('hidden');
    clearTimeout(state.announcementTimer);
    state.announcementTimer = setTimeout(() => ui.announcement.classList.add('hidden'), 2300);
  }

  function clearEntities() {
    for (const enemy of enemies) scene.remove(enemy.group);
    enemies.length = 0;
    for (const shot of projectiles) scene.remove(shot.mesh);
    projectiles.length = 0;
    for (const pickup of pickups) scene.remove(pickup.mesh);
    pickups.length = 0;
    for (const effect of effects) scene.remove(effect.mesh);
    effects.length = 0;
  }

  function resetGame() {
    clearEntities();
    player.position.set(0, 1.75, -30);
    player.velocity.set(0, 0, 0);
    player.yaw = Math.PI;
    player.pitch = 0;
    player.health = 100;
    player.shield = 100;
    player.ammo = 24;
    player.reserve = 120;
    player.fireCooldown = 0;
    player.reloadTimer = 0;
    player.dashCooldown = 0;
    state.elapsed = 0;
    state.kills = 0;
    state.score = 0;
    state.currentRelay = 0;
    state.spawnTimer = 5.5;
    state.difficulty = 1;
    state.interactionProgress = 0;
    state.recoil = 0;
    relays.forEach((relay) => {
      relay.active = false;
      relay.ring.material = materials.amber.clone();
      relay.core.material = materials.amber.clone();
      relay.light.color.setHex(0xffa942);
    });
    extraction.visible = false;
    ui.mission.textContent = 'RELAY 01 ERREICHEN';
    updateHud();
  }

  function startGame() {
    makeAudio();
    if (audio?.ctx.state === 'suspended') audio.ctx.resume();
    resetGame();
    state.mode = 'playing';
    ui.menu.classList.add('hidden');
    ui.how.classList.add('hidden');
    ui.pause.classList.add('hidden');
    ui.end.classList.add('hidden');
    ui.hud.classList.remove('hidden');
    ui.canvas.requestPointerLock?.();
    announce('RELAY-PROTOKOLL GESTARTET');
    spawnEnemy();
    clock.getDelta();
  }

  function pauseGame() {
    if (state.mode !== 'playing') return;
    state.mode = 'paused';
    ui.pause.classList.remove('hidden');
    document.exitPointerLock?.();
  }

  function resumeGame() {
    if (state.mode !== 'paused') return;
    state.mode = 'playing';
    ui.pause.classList.add('hidden');
    ui.canvas.requestPointerLock?.();
    clock.getDelta();
  }

  function showMenu() {
    state.mode = 'menu';
    document.exitPointerLock?.();
    ui.hud.classList.add('hidden');
    ui.pause.classList.add('hidden');
    ui.end.classList.add('hidden');
    ui.how.classList.add('hidden');
    ui.menu.classList.remove('hidden');
  }

  function endGame(victory) {
    if (state.mode !== 'playing') return;
    state.mode = victory ? 'won' : 'lost';
    document.exitPointerLock?.();
    ui.hud.classList.add('hidden');
    ui.end.classList.remove('hidden');
    ui.endLabel.textContent = victory ? 'MISSION ERFÜLLT' : 'SIGNAL VERLOREN';
    ui.endTitle.textContent = victory ? 'EXTRAKTION ERFOLGREICH' : 'OPERATOR GEFALLEN';
    ui.endCopy.textContent = victory
      ? 'Das Relaisnetz ist stabil. Der Canyon sendet wieder.'
      : 'Der Schwarm hat die Verbindung getrennt. Neu formieren.';
    ui.resultKills.textContent = state.kills;
    ui.resultTime.textContent = formatTime(state.elapsed);
    ui.resultScore.textContent = Math.floor(state.score + state.kills * 25);
    tone(victory ? 420 : 80, .7, victory ? 'sine' : 'sawtooth', .12, victory ? 500 : -40);
  }

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), .05);
    if (state.mode === 'playing') {
      state.elapsed += dt;
      state.score += dt * 2;
      updatePlayer(dt);
      updateEnemies(dt);
      updateProjectiles(dt);
      updatePickups(dt);
      updateEffects(dt);
      updateMission(dt);
      updateSpawning(dt);
      updateRain(dt);
      updateObjectiveMarker();
      drawMinimap();
      updateHud();
      raycaster.setFromCamera(center, camera);
      const hoverTargets = enemies.filter((enemy) => !enemy.dead).map((enemy) => enemy.body);
      ui.crosshair.classList.toggle('target', raycaster.intersectObjects(hoverTargets, false).length > 0);
    } else {
      updateRain(dt);
    }
    renderer.render(scene, camera);
  }

  function onResize() {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }

  window.addEventListener('resize', onResize);
  window.addEventListener('blur', () => {
    Object.keys(keys).forEach((key) => { keys[key] = false; });
  });
  window.addEventListener('keydown', (event) => {
    keys[event.code] = true;
    if (['KeyW','KeyA','KeyS','KeyD','Space'].includes(event.code)) event.preventDefault();
    if (event.code === 'Space' && !event.repeat) dash();
    if (event.code === 'KeyR' && !event.repeat) reload();
    if (event.code === 'Escape') {
      if (state.mode === 'playing') pauseGame();
      else if (state.mode === 'paused') resumeGame();
    }
  });
  window.addEventListener('keyup', (event) => { keys[event.code] = false; });
  window.addEventListener('mousemove', (event) => {
    if (state.mode !== 'playing' || document.pointerLockElement !== ui.canvas) return;
    player.yaw -= event.movementX * .0018;
    player.pitch = clamp(player.pitch - event.movementY * .0018, -1.25, 1.25);
  });
  window.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    if (state.mode === 'playing' && document.pointerLockElement === ui.canvas) fire();
    else if (state.mode === 'playing') ui.canvas.requestPointerLock?.();
  });
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && state.mode === 'playing') pauseGame();
  });

  ui.start.addEventListener('click', startGame);
  ui.howOpen.addEventListener('click', () => {
    ui.menu.classList.add('hidden');
    ui.how.classList.remove('hidden');
  });
  ui.howBack.addEventListener('click', () => {
    ui.how.classList.add('hidden');
    ui.menu.classList.remove('hidden');
  });
  ui.resume.addEventListener('click', resumeGame);
  ui.restart.addEventListener('click', startGame);
  ui.menuButton.addEventListener('click', showMenu);
  ui.endRestart.addEventListener('click', startGame);
  ui.endMenu.addEventListener('click', showMenu);

  buildWorld();
  camera.position.copy(player.position);
  camera.rotation.y = Math.PI;
  updateHud();
  animate();
})();
