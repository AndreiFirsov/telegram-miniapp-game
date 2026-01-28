// game.js

(function initTelegram() {
  if (window.Telegram?.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    if (typeof tg.disableVerticalSwipes === "function") tg.disableVerticalSwipes();
  }
})();

const LEVELS_TOTAL = 5;
const DEMONS_TOTAL = 5;
const LEVEL_TIME_SEC = 30;
const LIVES_TOTAL = 5;

const GAME_W = 360;
const GAME_H = 640;

const PROMO_CODE = "ARCH10";
const PROMO_TEXT = `Победа! Промокод -10%: ${PROMO_CODE}`;

const COURSE_URL =
  "https://slurm.io/architect?&utm_source=app&utm_medium=posev&utm_campaign=architect&utm_term=28_01_26";

// ===========================
// ТИПЫ ПРОБЛЕМ: ВИЗУАЛ + ДВИЖЕНИЕ
// ===========================
const PROBLEM_TYPES = [
  { emoji: "🔥", speedMin: 50, speedMax: 85,  size: 38, glowColor: 0xff3b30, auraAlpha: 0.22, auraRings: 3, motion: "pulse" },
  { emoji: "⚠️", speedMin: 65, speedMax: 105, size: 34, glowColor: 0xffd200, auraAlpha: 0.18, auraRings: 2, motion: "blink" },
  { emoji: "🤖", speedMin: 70, speedMax: 110, size: 34, glowColor: 0x4fd7ff, auraAlpha: 0.16, auraRings: 2, motion: "cold"  },
  { emoji: "👾", speedMin: 60, speedMax: 95,  size: 36, glowColor: 0x9b5cff, auraAlpha: 0.16, auraRings: 2, motion: "trail" },
  { emoji: "⌛️", speedMin: 55, speedMax: 90,  size: 32, glowColor: 0xb7b7c7, auraAlpha: 0.14, auraRings: 1, motion: "heavy", speedMul: 0.72 },
];

// ===========================
// ФОН
// ===========================
let bgGfx = null;
let vignetteGfx = null;
let noiseGfx = null;

function buildBackground(scene) {
  if (bgGfx) bgGfx.destroy();
  if (vignetteGfx) vignetteGfx.destroy();
  if (noiseGfx) noiseGfx.destroy();

  bgGfx = scene.add.graphics().setDepth(-30);
  vignetteGfx = scene.add.graphics().setDepth(-20);
  noiseGfx = scene.add.graphics().setDepth(-10);

  drawRadialGradient(bgGfx, 0, 0, GAME_W, GAME_H, {
    inner: 0x281a86,
    outer: 0x0d0a33,
    steps: 28,
  });

  drawVignette(vignetteGfx, 0, 0, GAME_W, GAME_H, {
    strength: 0.55,
    steps: 18,
  });

  drawNoise(noiseGfx, 0, 0, GAME_W, GAME_H, {
    alpha: 0.03,
    cell: 2,
  });
}

function drawRadialGradient(gfx, x, y, w, h, opts) {
  const { inner, outer, steps } = opts;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const maxR = Math.hypot(w / 2, h / 2);

  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    const col = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(inner),
      Phaser.Display.Color.ValueToColor(outer),
      100,
      Math.round((1 - t) * 100)
    );
    const color = Phaser.Display.Color.GetColor(col.r, col.g, col.b);
    const r = maxR * t;
    gfx.fillStyle(color, 1);
    gfx.fillCircle(cx, cy, r);
  }
}

function drawVignette(gfx, x, y, w, h, opts) {
  const { strength, steps } = opts;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const maxR = Math.hypot(w / 2, h / 2);

  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const r = maxR * (0.55 + t * 0.55);
    const a = strength * t * t;
    gfx.fillStyle(0x000000, a);
    gfx.fillCircle(cx, cy, r);
  }
}

function drawNoise(gfx, x, y, w, h, opts) {
  const { alpha, cell } = opts;
  for (let yy = y; yy < y + h; yy += cell) {
    for (let xx = x; xx < x + w; xx += cell) {
      const a = alpha * (0.6 + Math.random() * 0.8);
      gfx.fillStyle(0xffffff, a);
      gfx.fillRect(xx, yy, cell, cell);
    }
  }
}

// ===========================
// КОЛЬЦО
// ===========================
const RING_COLOR_INNER = 0x2ff3a0;
const RING_COLOR_OUTER = 0x1ecf7e;
const RING_COLOR_ALERT = 0xffd200;
const RING_COLOR_CRIT = 0xff3b30;

const RING_BASE_STROKE = 6;
const RING_GRAD_STEPS = 5;
const RING_GLOW_LAYERS = 3;

const RING_PULSE_IDLE_MIN = 0.86;
const RING_PULSE_IDLE_MAX = 1.0;

const ALERT_DISTANCE = 70;
const CRITICAL_DISTANCE = 28;

let ringState = "idle";
let ringIdlePulse = 0;
let ringPulse = 0;
let ringPulseTween = null;

let ringCritFlash = 0;
let ringNeedsRedraw = true;

// ===========================
// РЕНДЕР (FIX: FIT без CSS-растягивания)
// ===========================
const config = {
  type: Phaser.CANVAS,
  backgroundColor: "#170F63",
  render: {
    pixelArt: false,
    antialias: false,
    roundPixels: true,
    transparent: false,
    clearBeforeRender: true,
    resolution: 1,
  },
  scale: {
    parent: "game",
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_W,
    height: GAME_H,
  },
  scene: { create, update },
};

const game = new Phaser.Game(config);

let centerX = 0,
  centerY = 0;
let arenaRadius = 180;

let level = 1;
let timeLeft = LEVEL_TIME_SEC;
let livesLeft = LIVES_TOTAL;

let arenaGfx;
let demons = [];
let draggedDemon = null;

let timerText, levelText, livesText, messageText;
let tickEvent;

let gameEnded = false;
let gameStarted = false;

let winContainer = null;
let introContainer = null;
let loseContainer = null;

let nowSec = 0;

function create() {
  centerX = this.scale.width / 2;
  centerY = this.scale.height / 2;
  arenaRadius = Math.floor(this.scale.width * 0.4);

  buildBackground(this);

  arenaGfx = this.add.graphics().setDepth(10);

  this.tweens.add({
    targets: { v: 0 },
    v: 1,
    duration: 1400,
    yoyo: true,
    repeat: -1,
    ease: "Sine.easeInOut",
    onUpdate: (tw, t) => {
      ringIdlePulse = t.v;
      ringNeedsRedraw = true;
    },
  });

  drawArena();

  levelText = this.add.text(16, 16, `Уровень: ${level}`, {
    fontFamily: "Inter",
    fontSize: "20px",
    color: "#ffffff",
  });

  timerText = this.add.text(16, 44, `Время: ${timeLeft}`, {
    fontFamily: "Inter",
    fontSize: "20px",
    color: "#ffffff",
  });

  livesText = this.add.text(16, 72, `Жизни: ${livesLeft}`, {
    fontFamily: "Inter",
    fontSize: "20px",
    color: "#ffffff",
  });

  messageText = this.add
    .text(16, 100, "", { fontFamily: "Inter", fontSize: "18px", color: "#ff5555" })
    .setVisible(false);

  demons = [];
  for (let i = 0; i < DEMONS_TOTAL; i++) {
    demons.push(spawnDemon(this));
  }

  arenaGfx.setVisible(false);
  for (const d of demons) d.container.setVisible(false);

  this.input.on("dragstart", (pointer, obj) => {
    if (gameEnded || !gameStarted) return;
    draggedDemon = obj.__demon || null;
    if (draggedDemon) draggedDemon.container.setScale(1.06);
  });

  this.input.on("drag", (pointer, obj, dragX, dragY) => {
    if (gameEnded || !gameStarted) return;
    const d = obj.__demon;
    if (!d) return;
    d.container.x = dragX;
    d.container.y = dragY;
  });

  this.input.on("dragend", (pointer, obj) => {
    if (gameEnded || !gameStarted) return;
    const d = obj.__demon;
    draggedDemon = null;
    if (!d) return;

    d.container.setScale(1.0);

    this.tweens.add({
      targets: d.container,
      x: Phaser.Math.Linear(d.container.x, centerX, 0.35),
      y: Phaser.Math.Linear(d.container.y, centerY, 0.35),
      duration: 220,
      ease: "Quad.easeOut",
    });
  });

  showIntroUI(this);
}

function startTimer(scene) {
  if (tickEvent) tickEvent.remove(false);

  tickEvent = scene.time.addEvent({
    delay: 1000,
    loop: true,
    callback: () => {
      if (gameEnded || !gameStarted) return;

      timeLeft -= 1;
      timerText.setText(`Время: ${timeLeft}`);

      if (timeLeft <= 0) {
        if (level < LEVELS_TOTAL) {
          level += 1;
          startLevel(scene, { keepLives: true });
        } else {
          winGame(scene);
        }
      }
    },
  });
}

function update(time, delta) {
  if (gameEnded || !gameStarted) return;

  const dt = delta / 1000;
  nowSec += dt;

  const speedMulLevel = levelSpeedMultiplier(level);

  let breachedThisFrame = false;

  for (const d of demons) {
    if (d === draggedDemon) continue;

    const vx = d.container.x - centerX;
    const vy = d.container.y - centerY;
    const len = Math.hypot(vx, vy) || 1;

    const nx = vx / len;
    const ny = vy / len;

    const heavyMul = d.type?.speedMul ?? 1;
    const localMul = speedMulLevel * heavyMul;

    if (d.type?.motion === "heavy") {
      d.velX = Phaser.Math.Linear(d.velX || 0, nx * d.baseSpeed * localMul, 0.04);
      d.velY = Phaser.Math.Linear(d.velY || 0, ny * d.baseSpeed * localMul, 0.04);
      d.container.x += (d.velX || 0) * dt;
      d.container.y += (d.velY || 0) * dt;
    } else {
      d.container.x += nx * d.baseSpeed * localMul * dt;
      d.container.y += ny * d.baseSpeed * localMul * dt;
    }

    updateDemonVisuals(d, nowSec);

    const dist = Math.hypot(d.container.x - centerX, d.container.y - centerY);
    if (dist > arenaRadius) {
      breachedThisFrame = true;
      break;
    }
  }

  if (breachedThisFrame) {
    onBreach(this);
    restartLevel(this);
    return;
  }

  let minToEdge = Infinity;
  for (const d of demons) {
    const dist = Math.hypot(d.container.x - centerX, d.container.y - centerY);
    const toEdge = arenaRadius - dist;
    if (toEdge < minToEdge) minToEdge = toEdge;
  }

  if (minToEdge <= CRITICAL_DISTANCE) {
    setRingState(this, "critical");
    ringCritFlash = Math.min(1, ringCritFlash + dt * 6);
    ringNeedsRedraw = true;
  } else if (minToEdge <= ALERT_DISTANCE) {
    setRingState(this, "alert");
  } else {
    setRingState(this, "idle");
  }

  if (ringCritFlash > 0 && ringState !== "critical") {
    ringCritFlash = Math.max(0, ringCritFlash - dt * 4);
    ringNeedsRedraw = true;
  }

  if (ringNeedsRedraw) {
    drawArena();
    ringNeedsRedraw = false;
  }
}

// --------------------
// Demons
// --------------------
function pickProblemType() {
  return PROBLEM_TYPES[Math.floor(Math.random() * PROBLEM_TYPES.length)];
}

function spawnDemon(scene) {
  const ang = Math.random() * Math.PI * 2;
  const r = Math.random() * arenaRadius * 0.4;
  const x = centerX + Math.cos(ang) * r;
  const y = centerY + Math.sin(ang) * r;

  const t = pickProblemType();

  const container = scene.add.container(x, y).setDepth(20);

  const aura = scene.add.graphics();
  container.add(aura);

  const trail = scene.add.graphics();
  container.add(trail);

  const text = scene.add
    .text(0, 0, t.emoji, {
      fontFamily: "Inter, Apple Color Emoji, Segoe UI Emoji",
      fontSize: `${t.size}px`,
    })
    .setOrigin(0.5);

  container.add(text);

  const hit = Math.max(44, Math.floor(t.size * 1.35));
  container.setSize(hit, hit);
  container.setInteractive({ useHandCursor: true, draggable: true });
  scene.input.setDraggable(container);

  const demon = {
    container,
    aura,
    trail,
    text,
    type: t,
    baseSpeed: Phaser.Math.Between(t.speedMin, t.speedMax),
    lastX: x,
    lastY: y,
    velX: 0,
    velY: 0,
  };

  container.__demon = demon;

  drawDemonAura(demon, 0);
  return demon;
}

function rerollDemon(d) {
  const t = pickProblemType();
  d.type = t;
  d.text.setText(t.emoji);
  d.text.setStyle({ fontSize: `${t.size}px` });

  const hit = Math.max(44, Math.floor(t.size * 1.35));
  d.container.setSize(hit, hit);

  d.baseSpeed = Phaser.Math.Between(t.speedMin, t.speedMax);
  d.velX = 0;
  d.velY = 0;
  d.trail.clear();
  drawDemonAura(d, nowSec);
}

function updateDemonVisuals(d, tsec) {
  const m = d.type.motion;

  if (m === "pulse") {
    const s = 1 + 0.06 * Math.sin(tsec * 6.2);
    d.text.setScale(s);
    drawDemonAura(d, 0.18 + 0.06 * (0.5 + 0.5 * Math.sin(tsec * 6.2)));
  } else if (m === "blink") {
    const on = Math.sin(tsec * 10.0) > 0.2;
    drawDemonAura(d, on ? 0.20 : 0.06);
  } else if (m === "cold") {
    const a = 0.14 + 0.04 * (0.5 + 0.5 * Math.sin(tsec * 2.2));
    drawDemonAura(d, a);
  } else if (m === "trail") {
    drawDemonAura(d, 0.14);
    drawTrail(d);
  } else if (m === "heavy") {
    const a = 0.12 + 0.02 * (0.5 + 0.5 * Math.sin(tsec * 1.3));
    d.text.setScale(1 + 0.02 * Math.sin(tsec * 1.3));
    drawDemonAura(d, a);
  } else {
    drawDemonAura(d, d.type.auraAlpha ?? 0.14);
  }
}

function drawDemonAura(d, overrideAlpha = null) {
  const aura = d.aura;
  aura.clear();

  const t = d.type;
  const color = t.glowColor;
  const rings = t.auraRings ?? 2;

  const baseAlpha = overrideAlpha === null ? (t.auraAlpha ?? 0.16) : overrideAlpha;
  const maxR = t.size * 0.62;

  for (let i = 1; i <= rings; i++) {
    const rr = maxR + i * 8;
    const a = baseAlpha / i;
    aura.lineStyle(10 + i * 6, color, a * 0.55);
    aura.strokeCircle(0, 0, rr);
  }

  aura.fillStyle(color, baseAlpha * 0.35);
  aura.fillCircle(0, 0, maxR * 0.9);
}

function drawTrail(d) {
  const tr = d.trail;
  tr.clear();

  const dx = d.container.x - (d.lastX ?? d.container.x);
  const dy = d.container.y - (d.lastY ?? d.container.y);

  const speed = Math.hypot(dx, dy);
  if (speed < 0.4) {
    d.lastX = d.container.x;
    d.lastY = d.container.y;
    return;
  }

  const color = d.type.glowColor;
  const vx = dx / (speed || 1);
  const vy = dy / (speed || 1);

  for (let i = 1; i <= 3; i++) {
    const back = i * 10;
    const a = 0.16 / i;
    tr.fillStyle(color, a);
    tr.fillCircle(-vx * back, -vy * back, 6 - i);
  }

  d.lastX = d.container.x;
  d.lastY = d.container.y;
}

// --------------------
// Game logic
// --------------------
function restartLevel(scene) {
  if (gameEnded) return;

  livesLeft -= 1;
  livesText.setText(`Жизни: ${livesLeft}`);

  if (livesLeft > 0) {
    showMessage(scene, `Проблема вышла из круга!`, "#ff5555", 1200);
    startLevel(scene, { keepLives: true });
  } else {
    loseGame(scene);
  }
}

function startLevel(scene, options = {}) {
  const { keepLives = false } = options;

  timeLeft = LEVEL_TIME_SEC;
  timerText.setText(`Время: ${timeLeft}`);
  levelText.setText(`Уровень: ${level}`);

  if (!keepLives) {
    livesLeft = LIVES_TOTAL;
    livesText.setText(`Жизни: ${livesLeft}`);
  }

  for (const d of demons) {
    const ang = Math.random() * Math.PI * 2;
    const r = Math.random() * arenaRadius * 0.45;

    d.container.x = centerX + Math.cos(ang) * r;
    d.container.y = centerY + Math.sin(ang) * r;

    d.lastX = d.container.x;
    d.lastY = d.container.y;

    rerollDemon(d);

    d.container.setInteractive({ useHandCursor: true, draggable: true });
    scene.input.setDraggable(d.container);
  }

  setRingState(scene, "idle");
}

function resetGameToStart(scene) {
  gameEnded = false;
  gameStarted = true;

  level = 1;
  livesLeft = LIVES_TOTAL;

  levelText.setText(`Уровень: ${level}`);
  livesText.setText(`Жизни: ${livesLeft}`);

  destroyWinUI();
  destroyLoseUI();

  startLevel(scene, { keepLives: true });
  startTimer(scene);
}

function winGame(scene) {
  gameEnded = true;
  if (tickEvent) tickEvent.remove(false);

  setRingState(scene, "idle");

  draggedDemon = null;
  for (const d of demons) d.container.disableInteractive();

  showWinUI(scene);
}

function loseGame(scene) {
  gameEnded = true;
  if (tickEvent) tickEvent.remove(false);

  setRingState(scene, "idle");

  draggedDemon = null;
  for (const d of demons) d.container.disableInteractive();

  showLoseUI(scene);
}

// --------------------
// Ring
// --------------------
function setRingState(scene, nextState) {
  if (ringState === nextState) return;

  ringState = nextState;
  ringNeedsRedraw = true;

  if (ringState === "alert") {
    ringPulse = 0;
    if (ringPulseTween) ringPulseTween.stop();

    ringPulseTween = scene.tweens.add({
      targets: { v: 0 },
      v: 1,
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      onUpdate: (tw, target) => {
        ringPulse = target.v;
        ringNeedsRedraw = true;
      },
    });
  } else {
    if (ringPulseTween) {
      ringPulseTween.stop();
      ringPulseTween = null;
    }
    ringPulse = 0;
  }
}

function onBreach(scene) {
  if (scene.cameras?.main) {
    scene.cameras.main.shake(180, 0.008);
  }

  ringCritFlash = 1;
  ringNeedsRedraw = true;

  scene.tweens.add({
    targets: { v: 1 },
    v: 0,
    duration: 260,
    ease: "Quad.easeOut",
    onUpdate: (tw, t) => {
      ringCritFlash = t.v;
      ringNeedsRedraw = true;
    },
  });
}

function drawArena() {
  arenaGfx.clear();

  const idleAlpha = Phaser.Math.Linear(RING_PULSE_IDLE_MIN, RING_PULSE_IDLE_MAX, ringIdlePulse);
  const alertMix = ringState === "alert" ? ringPulse : 0;
  const critMix = ringCritFlash;

  for (let i = 0; i < RING_GRAD_STEPS; i++) {
    const t = i / Math.max(1, RING_GRAD_STEPS - 1);

    const colBase = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(RING_COLOR_INNER),
      Phaser.Display.Color.ValueToColor(RING_COLOR_OUTER),
      100,
      Math.round(t * 100)
    );
    let color = Phaser.Display.Color.GetColor(colBase.r, colBase.g, colBase.b);

    if (alertMix > 0) {
      const colAlert = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(color),
        Phaser.Display.Color.ValueToColor(RING_COLOR_ALERT),
        100,
        Math.round(alertMix * 100)
      );
      color = Phaser.Display.Color.GetColor(colAlert.r, colAlert.g, colAlert.b);
    }

    if (critMix > 0) {
      const colCrit = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(color),
        Phaser.Display.Color.ValueToColor(RING_COLOR_CRIT),
        100,
        Math.round(critMix * 100)
      );
      color = Phaser.Display.Color.GetColor(colCrit.r, colCrit.g, colCrit.b);
    }

    const stroke = RING_BASE_STROKE + i;
    const alpha = idleAlpha * Phaser.Math.Linear(0.85, 1.0, t);

    arenaGfx.lineStyle(stroke, color, alpha);
    arenaGfx.strokeCircle(centerX, centerY, arenaRadius);
  }

  const glowPower = Math.max(alertMix, critMix);
  const glowAlphaBase = 0.10 + glowPower * 0.22;

  for (let g = 1; g <= RING_GLOW_LAYERS; g++) {
    const glowStroke = RING_BASE_STROKE + RING_GRAD_STEPS + g * 6;
    const glowAlpha = glowAlphaBase / g;

    const glowColor =
      critMix > 0.05 ? RING_COLOR_CRIT : alertMix > 0.05 ? RING_COLOR_ALERT : RING_COLOR_OUTER;

    arenaGfx.lineStyle(glowStroke, glowColor, glowAlpha);
    arenaGfx.strokeCircle(centerX, centerY, arenaRadius);
  }
}

// --------------------
// UI
// --------------------
function showIntroUI(scene) {
  destroyIntroUI();

  introContainer = scene.add.container(0, 0);
  introContainer.setDepth(2000);

  if (arenaGfx) arenaGfx.setVisible(false);
  for (const d of demons) d.container.setVisible(false);

  const overlay = scene.add.rectangle(centerX, centerY, GAME_W, GAME_H, 0x000000, 1).setOrigin(0.5);

  const title = scene.add
    .text(centerX, centerY - 220, "Защити систему от хаоса", {
      fontFamily: "Inter",
      fontSize: "22px",
      color: "#ffffff",
      fontStyle: "700",
      align: "center",
    })
    .setOrigin(0.5);

  const bodyText =
    "Тебе нужно удержать всю систему в рабочем состоянии,\n" +
    "чтобы проблемы и ошибки не разбежались.\n\n" +
    `Удержи проблемы внутри круга ${LEVEL_TIME_SEC} секунд.\n` +
    `Всего ${LEVELS_TOTAL} уровней. Каждый уровень ускоряет скорость проблем.\n` +
    `У тебя ${LIVES_TOTAL} жизней.\n\n` +
    "Если ты выиграешь, то получишь скидку 10%\n" +
    "на курс «Архитектура приложений».";

  const text = scene.add
    .text(centerX, centerY - 35, bodyText, {
      fontFamily: "Inter",
      fontSize: "15px",
      fontStyle: "400",
      color: "#EDEBFF",
      align: "center",
      lineSpacing: 6,
      wordWrap: { width: GAME_W - 40 },
    })
    .setOrigin(0.5);

  const btnW = 240;
  const btnH = 54;
  const btnY = centerY + 220;

  const btnBg = scene.add.rectangle(centerX, btnY, btnW, btnH, 0x66d966, 1).setOrigin(0.5);
  btnBg.setStrokeStyle(1, 0x000000, 1);

  const btnText = scene.add
    .text(centerX, btnY, "Начать", {
      fontFamily: "Inter",
      fontSize: "18px",
      fontStyle: "600",
      color: "#000000",
    })
    .setOrigin(0.5);

  btnBg.setInteractive({ useHandCursor: true });
  btnBg.on("pointerdown", () => {
    destroyIntroUI();

    gameStarted = true;
    gameEnded = false;

    level = 1;
    livesLeft = LIVES_TOTAL;
    timeLeft = LEVEL_TIME_SEC;

    levelText.setText(`Уровень: ${level}`);
    livesText.setText(`Жизни: ${livesLeft}`);
    timerText.setText(`Время: ${timeLeft}`);

    if (arenaGfx) arenaGfx.setVisible(true);
    for (const d of demons) d.container.setVisible(true);

    startLevel(scene, { keepLives: true });
    startTimer(scene);
  });

  introContainer.add([overlay, title, text, btnBg, btnText]);
}

function destroyIntroUI() {
  if (introContainer) {
    introContainer.destroy(true);
    introContainer = null;
  }
}

// Win/Lose UI + helpers (без изменений логики)
function showWinUI(scene) {
  destroyWinUI();
  winContainer = scene.add.container(0, 0).setDepth(2000);

  const overlay = scene.add.rectangle(centerX, centerY, GAME_W, GAME_H, 0x000000, 1).setOrigin(0.5);

  const title = scene.add
    .text(centerX, centerY - 130, "Ты защитил систему!", {
      fontFamily: "Inter",
      fontSize: "22px",
      color: "#ffffff",
      fontStyle: "700",
      align: "center",
    })
    .setOrigin(0.5);

  const promo = scene.add
    .text(centerX, centerY - 85, PROMO_TEXT, {
      fontFamily: "Inter",
      fontSize: "18px",
      color: "#66D966",
      align: "center",
      wordWrap: { width: GAME_W - 40 },
    })
    .setOrigin(0.5);

  const btnW = 280;
  const btnH = 52;
  const btnY = centerY + 10;

  const btnBg = scene.add.rectangle(centerX, btnY, btnW, btnH, 0x66d966, 1).setOrigin(0.5);
  btnBg.setStrokeStyle(1, 0x000000, 1);

  const btnText = scene.add
    .text(centerX, btnY, "Воспользоваться промокодом", {
      fontFamily: "Inter",
      fontSize: "15px",
      fontStyle: "700",
      color: "#000000",
    })
    .setOrigin(0.5);

  btnBg.setInteractive({ useHandCursor: true });
  btnBg.on("pointerdown", () => openCourseLink());

  const hint = scene.add
    .text(
      centerX,
      centerY + 80,
      "Откроется страница курса.\nПромокод применяй при оплате.\n\nСделай скриншот, чтобы не потерять промокод.",
      { fontFamily: "Inter", fontSize: "14px", color: "#EDEBFF", align: "center", alpha: 0.95 }
    )
    .setOrigin(0.5);

  winContainer.add([overlay, title, promo, btnBg, btnText, hint]);
}

function destroyWinUI() {
  if (winContainer) {
    winContainer.destroy(true);
    winContainer = null;
  }
}

function showLoseUI(scene) {
  destroyLoseUI();
  loseContainer = scene.add.container(0, 0).setDepth(2000);

  const overlay = scene.add.rectangle(centerX, centerY, GAME_W, GAME_H, 0x000000, 1).setOrigin(0.5);

  const title = scene.add
    .text(centerX, centerY - 110, "Жизни закончились", {
      fontFamily: "Inter",
      fontSize: "22px",
      color: "#ffffff",
      fontStyle: "700",
      align: "center",
    })
    .setOrigin(0.5);

  const body = scene.add
    .text(centerX, centerY - 55, "Проблемы вышли из-под контроля.\nПопробуешь ещё раз?", {
      fontFamily: "Inter",
      fontSize: "15px",
      color: "#EDEBFF",
      align: "center",
      lineSpacing: 6,
      wordWrap: { width: GAME_W - 40 },
    })
    .setOrigin(0.5);

  const btnW = 240;
  const btnH = 54;
  const btnY = centerY + 30;

  const btnBg = scene.add.rectangle(centerX, btnY, btnW, btnH, 0x66d966, 1).setOrigin(0.5);
  btnBg.setStrokeStyle(1, 0x000000, 1);

  const btnText = scene.add
    .text(centerX, btnY, "Начать заново", {
      fontFamily: "Inter",
      fontSize: "18px",
      fontStyle: "700",
      color: "#000000",
    })
    .setOrigin(0.5);

  btnBg.setInteractive({ useHandCursor: true });
  btnBg.on("pointerdown", () => resetGameToStart(scene));

  loseContainer.add([overlay, title, body, btnBg, btnText]);
}

function destroyLoseUI() {
  if (loseContainer) {
    loseContainer.destroy(true);
    loseContainer = null;
  }
}

// --------------------
// Helpers
// --------------------
function openCourseLink() {
  if (window.Telegram?.WebApp?.openLink) {
    window.Telegram.WebApp.openLink(COURSE_URL);
  } else {
    window.open(COURSE_URL, "_blank", "noopener,noreferrer");
  }
}

function levelSpeedMultiplier(lvl) {
  const map = [0.2, 0.3, 0.4, 0.5, 0.6];
  return map[Math.max(0, Math.min(map.length - 1, lvl - 1))];
}

function showMessage(scene, text, color, ms) {
  messageText.setText(text);
  messageText.setColor(color);
  messageText.setVisible(true);
  scene.time.delayedCall(ms, () => messageText.setVisible(false));
}
