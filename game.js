// game.js

// --- Telegram init (не ломает запуск в обычном браузере) ---
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

// Дизайновый размер под вертикальный формат
const GAME_W = 360;
const GAME_H = 640;

// Промокод/скидка
const PROMO_CODE = "ARCH20";
const PROMO_TEXT = `Победа! Промокод -20%: ${PROMO_CODE}`;

// Ссылка на курс
const COURSE_URL = "https://slurm.io/architect";

// Типы проблем (эмодзи + диапазоны скорости)
const PROBLEM_TYPES = [
  { emoji: "👾", speedMin: 60, speedMax: 95 },   // базовый
  { emoji: "🐞", speedMin: 70, speedMax: 110 },  // быстрее
  { emoji: "🧨", speedMin: 50, speedMax: 85 },   // медленнее
  { emoji: "⚠️", speedMin: 65, speedMax: 105 },  // быстрый
  { emoji: "🧯", speedMin: 55, speedMax: 90 },   // средний
];

const config = {
  type: Phaser.AUTO,
  backgroundColor: "#170F63",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_W,
    height: GAME_H,
  },
  scene: { create, update }
};

const game = new Phaser.Game(config);

let centerX = 0, centerY = 0;
let arenaRadius = 180;

let level = 1;
let timeLeft = LEVEL_TIME_SEC;

let livesLeft = LIVES_TOTAL;

let arenaGfx;
let demons = [];
let dragged = null;

let timerText, levelText, livesText, messageText;
let tickEvent;

let gameEnded = false;
let gameStarted = false; // пока false — показываем интро

// --- UI контейнеры ---
let winContainer = null;
let introContainer = null;
let loseContainer = null;

function create() {
  centerX = this.scale.width / 2;
  centerY = this.scale.height / 2;
  arenaRadius = Math.floor(this.scale.width * 0.40);

  arenaGfx = this.add.graphics();
  drawArena();

  // UI сверху
  levelText = this.add.text(16, 16, `Уровень: ${level}`, { fontFamily: "Inter", fontSize: "20px", color: "#ffffff" });
  timerText = this.add.text(16, 44, `Время: ${timeLeft}`, { fontFamily: "Inter", fontSize: "20px", color: "#ffffff" });
  livesText = this.add.text(16, 72, `Жизни: ${livesLeft}`, { fontFamily: "Inter", fontSize: "20px", color: "#ffffff" });
  messageText = this.add.text(16, 100, "", { fontFamily: "Inter", fontSize: "18px", color: "#ff5555" }).setVisible(false);

  // Демоны
  demons = [];
  for (let i = 0; i < DEMONS_TOTAL; i++) {
    demons.push(spawnDemon(this));
  }

  // Drag handlers — один раз
  this.input.on("dragstart", (pointer, obj) => {
    if (gameEnded || !gameStarted) return;
    dragged = obj;
    obj.setScale(1.08); // небольшой визуальный фидбек
  });

  this.input.on("drag", (pointer, obj, dragX, dragY) => {
    if (gameEnded || !gameStarted) return;
    obj.x = dragX;
    obj.y = dragY;
  });

  this.input.on("dragend", (pointer, obj) => {
    if (gameEnded || !gameStarted) return;
    dragged = null;
    obj.setScale(1.0);

    // Мягко “впихиваем” к центру
    this.tweens.add({
      targets: obj,
      x: Phaser.Math.Linear(obj.x, centerX, 0.35),
      y: Phaser.Math.Linear(obj.y, centerY, 0.35),
      duration: 220,
      ease: "Quad.easeOut",
    });
  });

  // Стартовый экран
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
    }
  });
}

function update(time, delta) {
  if (gameEnded || !gameStarted) return;

  const dt = delta / 1000;
  const speedMul = levelSpeedMultiplier(level);

  for (const d of demons) {
    if (d === dragged) continue;

    // Радиальное движение наружу
    const vx = d.x - centerX;
    const vy = d.y - centerY;
    const len = Math.hypot(vx, vy) || 1;

    const nx = vx / len;
    const ny = vy / len;

    d.x += nx * d.baseSpeed * speedMul * dt;
    d.y += ny * d.baseSpeed * speedMul * dt;

    // Проверка выхода за круг
    const dist = Math.hypot(d.x - centerX, d.y - centerY);
    if (dist > arenaRadius) {
      restartLevel(this);
      return;
    }
  }
}

// --------------------
// Демоны (эмодзи-проблемы)
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

  const demon = scene.add.text(x, y, t.emoji, {
    fontFamily: "Inter, Apple Color Emoji, Segoe UI Emoji",
    fontSize: "34px",
  }).setOrigin(0.5);

  demon.problemType = t.emoji;
  demon.baseSpeed = Phaser.Math.Between(t.speedMin, t.speedMax);

  demon.setInteractive({ useHandCursor: true });
  scene.input.setDraggable(demon);

  return demon;
}

function rerollDemon(d) {
  const t = pickProblemType();
  d.setText(t.emoji);
  d.problemType = t.emoji;
  d.baseSpeed = Phaser.Math.Between(t.speedMin, t.speedMax);
}

// --------------------
// Логика уровней / жизни / победа / поражение
// --------------------
function restartLevel(scene) {
  if (gameEnded) return;

  livesLeft -= 1;
  livesText.setText(`Жизни: ${livesLeft}`);

  if (livesLeft > 0) {
    showMessage(scene, `Проблема вышла из круга! Осталось жизней: ${livesLeft}`, "#ff5555", 1200);
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

  // Переразместить демонов + перемешать типы
  for (const d of demons) {
    const ang = Math.random() * Math.PI * 2;
    const r = Math.random() * arenaRadius * 0.45;

    d.x = centerX + Math.cos(ang) * r;
    d.y = centerY + Math.sin(ang) * r;

    rerollDemon(d);

    d.setInteractive({ useHandCursor: true });
    scene.input.setDraggable(d);
  }
}

function resetGameToStart(scene) {
  // полный сброс под "первый уровень" (без интро)
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

  dragged = null;
  for (const d of demons) d.disableInteractive();

  showWinUI(scene);
}

function loseGame(scene) {
  gameEnded = true;
  if (tickEvent) tickEvent.remove(false);

  dragged = null;
  for (const d of demons) d.disableInteractive();

  showLoseUI(scene);
}

// --------------------
// Intro UI
// --------------------
function showIntroUI(scene) {
  destroyIntroUI();

  introContainer = scene.add.container(0, 0);

  const overlay = scene.add.rectangle(centerX, centerY, GAME_W, GAME_H, 0x000000, 1).setOrigin(0.5);

  const title = scene.add.text(centerX, centerY - 220, "Защити систему от хаоса", {
    fontFamily: "Inter",
    fontSize: "22px",
    color: "#ffffff",
    fontStyle: "700",
    align: "center",
  }).setOrigin(0.5);

  const bodyText =
    "Тебе нужно удержать всю систему в рабочем состоянии,\n" +
    "чтобы проблемы и ошибки не разбежались.\n\n" +
    `Удержи проблемы внутри круга ${LEVEL_TIME_SEC} секунд.\n` +
    `Всего ${LEVELS_TOTAL} уровней. Каждый уровень ускоряет скорость проблем.\n` +
    `У тебя ${LIVES_TOTAL} жизней.\n\n` +
    "Если ты выиграешь, то получишь скидку 20%\n" +
    "на курс «Архитектура приложений».";

  const text = scene.add.text(centerX, centerY - 35, bodyText, {
    fontFamily: "Inter",
    fontSize: "15px",
    fontStyle: "400",
    color: "#EDEBFF",
    align: "center",
    lineSpacing: 6,
    wordWrap: { width: GAME_W - 40 }
  }).setOrigin(0.5);

  // Кнопка "Начать" (цвета по твоим требованиям)
  const btnW = 240;
  const btnH = 54;
  const btnY = centerY + 220;

  const btnBg = scene.add.rectangle(centerX, btnY, btnW, btnH, 0x66D966, 1).setOrigin(0.5);
  btnBg.setStrokeStyle(1, 0x000000, 1);

  const btnText = scene.add.text(centerX, btnY, "Начать", {
    fontFamily: "Inter",
    fontSize: "18px",
    fontStyle: "600",
    color: "#000000",
  }).setOrigin(0.5);

  btnBg.setInteractive({ useHandCursor: true });
  btnBg.on("pointerdown", () => {
    destroyIntroUI();

    gameStarted = true;
    gameEnded = false;

    // сброс
    level = 1;
    livesLeft = LIVES_TOTAL;
    timeLeft = LEVEL_TIME_SEC;

    levelText.setText(`Уровень: ${level}`);
    livesText.setText(`Жизни: ${livesLeft}`);
    timerText.setText(`Время: ${timeLeft}`);

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

// --------------------
// Win UI
// --------------------
function showWinUI(scene) {
  destroyWinUI();

  winContainer = scene.add.container(0, 0);

  const overlay = scene.add.rectangle(centerX, centerY, GAME_W, GAME_H, 0x000000, 1).setOrigin(0.5);

  const title = scene.add.text(centerX, centerY - 130, "Ты защитил систему!", {
    fontFamily: "Inter",
    fontSize: "22px",
    color: "#ffffff",
    fontStyle: "700",
    align: "center",
  }).setOrigin(0.5);

  const promo = scene.add.text(centerX, centerY - 85, PROMO_TEXT, {
    fontFamily: "Inter",
    fontSize: "18px",
    color: "#66D966",
    align: "center",
    wordWrap: { width: GAME_W - 40 }
  }).setOrigin(0.5);

  const btnW = 280;
  const btnH = 52;
  const btnY = centerY + 10;

  const btnBg = scene.add.rectangle(centerX, btnY, btnW, btnH, 0x66D966, 1).setOrigin(0.5);
  btnBg.setStrokeStyle(1, 0x000000, 1);

  const btnText = scene.add.text(centerX, btnY, "Воспользоваться промокодом", {
    fontFamily: "Inter",
    fontSize: "15px",
    fontStyle: "700",
    color: "#000000",
  }).setOrigin(0.5);

  btnBg.setInteractive({ useHandCursor: true });
  btnBg.on("pointerdown", () => openCourseLink());

  const hint = scene.add.text(centerX, centerY + 80, "Откроется страница курса.\nПромокод применяй при оплате.", {
    fontFamily: "Inter",
    fontSize: "14px",
    color: "#EDEBFF",
    align: "center",
    alpha: 0.95,
  }).setOrigin(0.5);

  winContainer.add([overlay, title, promo, btnBg, btnText, hint]);
}

function destroyWinUI() {
  if (winContainer) {
    winContainer.destroy(true);
    winContainer = null;
  }
}

// --------------------
// Lose UI (когда закончились жизни)
// --------------------
function showLoseUI(scene) {
  destroyLoseUI();

  loseContainer = scene.add.container(0, 0);

  const overlay = scene.add.rectangle(centerX, centerY, GAME_W, GAME_H, 0x000000, 1).setOrigin(0.5);

  const title = scene.add.text(centerX, centerY - 110, "Жизни закончились", {
    fontFamily: "Inter",
    fontSize: "22px",
    color: "#ffffff",
    fontStyle: "700",
    align: "center",
  }).setOrigin(0.5);

  const body = scene.add.text(centerX, centerY - 55, "Проблемы вышли из-под контроля.\nПопробуешь ещё раз?", {
    fontFamily: "Inter",
    fontSize: "15px",
    color: "#EDEBFF",
    align: "center",
    lineSpacing: 6,
    wordWrap: { width: GAME_W - 40 }
  }).setOrigin(0.5);

  const btnW = 240;
  const btnH = 54;
  const btnY = centerY + 30;

  const btnBg = scene.add.rectangle(centerX, btnY, btnW, btnH, 0x66D966, 1).setOrigin(0.5);
  btnBg.setStrokeStyle(1, 0x000000, 1);

  const btnText = scene.add.text(centerX, btnY, "Начать заново", {
    fontFamily: "Inter",
    fontSize: "18px",
    fontStyle: "700",
    color: "#000000",
  }).setOrigin(0.5);

  btnBg.setInteractive({ useHandCursor: true });
  btnBg.on("pointerdown", () => {
    // сброс на 1 уровень
    resetGameToStart(scene);
  });

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
  // плавное ускорение по уровням
  const map = [0.2, 0.3, 0.4, 0.5, 0.6];
  return map[Math.max(0, Math.min(map.length - 1, lvl - 1))];
}

function drawArena() {
  arenaGfx.clear();
  arenaGfx.lineStyle(4, 0x66D966, 1);
  arenaGfx.strokeCircle(centerX, centerY, arenaRadius);
}

function showMessage(scene, text, color, ms) {
  messageText.setText(text);
  messageText.setColor(color);
  messageText.setVisible(true);
  scene.time.delayedCall(ms, () => messageText.setVisible(false));
}
