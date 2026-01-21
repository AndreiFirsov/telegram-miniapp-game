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
const LEVEL_TIME_SEC = 1;
const LIVES_TOTAL = 5;

// Дизайновый размер под вертикальный формат
const GAME_W = 360;
const GAME_H = 640;

// Промокод/скидка
const PROMO_CODE = "ARCH20";
const PROMO_TEXT = `Победа! Промокод -20%: ${PROMO_CODE}`;

// Ссылка на курс
const COURSE_URL = "https://slurm.io/architect";

const config = {
  type: Phaser.AUTO,
  backgroundColor: "#000000",
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

// --- UI победы ---
let winContainer = null;

function create() {
  centerX = this.scale.width / 2;
  centerY = this.scale.height / 2;
  arenaRadius = Math.floor(this.scale.width * 0.40);

  arenaGfx = this.add.graphics();
  drawArena();

  levelText = this.add.text(16, 16, `Уровень: ${level}`, { fontSize: "20px", color: "#ffffff" });
  timerText = this.add.text(16, 44, `Время: ${timeLeft}`, { fontSize: "20px", color: "#ffffff" });
  livesText = this.add.text(16, 72, `Попытки: ${livesLeft}`, { fontSize: "20px", color: "#ffffff" });
  messageText = this.add.text(16, 100, "", { fontSize: "18px", color: "#ff5555" }).setVisible(false);

  // Таймер
  tickEvent = this.time.addEvent({
    delay: 1000,
    loop: true,
    callback: () => {
      if (gameEnded) return;

      timeLeft -= 1;
      timerText.setText(`Время: ${timeLeft}`);

      if (timeLeft <= 0) {
        if (level < LEVELS_TOTAL) {
          level += 1;
          startLevel(this, { keepLives: true });
        } else {
          winGame(this);
        }
      }
    }
  });

  // Демоны
  demons = [];
  for (let i = 0; i < DEMONS_TOTAL; i++) {
    demons.push(spawnDemon(this));
  }

  // Drag handlers — один раз
  this.input.on("dragstart", (pointer, obj) => {
    if (gameEnded) return;
    dragged = obj;
    obj.bodyColor = 0x00ff88;
  });

  this.input.on("drag", (pointer, obj, dragX, dragY) => {
    if (gameEnded) return;
    obj.x = dragX;
    obj.y = dragY;
  });

  this.input.on("dragend", (pointer, obj) => {
    if (gameEnded) return;
    dragged = null;
    obj.bodyColor = 0xff3355;

    this.tweens.add({
      targets: obj,
      x: Phaser.Math.Linear(obj.x, centerX, 0.35),
      y: Phaser.Math.Linear(obj.y, centerY, 0.35),
      duration: 220,
      ease: "Quad.easeOut",
    });
  });

  startLevel(this, { keepLives: true });
}

function update(time, delta) {
  if (gameEnded) return;

  const dt = delta / 1000;
  const speedMul = levelSpeedMultiplier(level);

  for (const d of demons) {
    if (d === dragged) continue;

    const vx = d.x - centerX;
    const vy = d.y - centerY;
    const len = Math.hypot(vx, vy) || 1;

    const nx = vx / len;
    const ny = vy / len;

    d.x += nx * d.baseSpeed * speedMul * dt;
    d.y += ny * d.baseSpeed * speedMul * dt;

    const dist = Math.hypot(d.x - centerX, d.y - centerY);
    if (dist > arenaRadius) {
      restartLevel(this);
      return;
    }
  }
}

function spawnDemon(scene) {
  const ang = Math.random() * Math.PI * 2;
  const r = Math.random() * arenaRadius * 0.5;
  const x = centerX + Math.cos(ang) * r;
  const y = centerY + Math.sin(ang) * r;

  // радиус побольше, чтобы удобно хватать
  const demon = scene.add.circle(x, y, 30, 0xff3355);

  demon.baseSpeed = Phaser.Math.FloatBetween(60, 95);

  demon.setInteractive({ useHandCursor: true });
  scene.input.setDraggable(demon);

  return demon;
}

function restartLevel(scene) {
  if (gameEnded) return;

  livesLeft -= 1;
  livesText.setText(`Попытки: ${livesLeft}`);

  if (livesLeft > 0) {
    showMessage(scene, `Демон вырвался! Осталось попыток: ${livesLeft}`, "#ff5555", 1200);
    startLevel(scene, { keepLives: true });
  } else {
    showMessage(scene, "Попытки закончились. Начинаем заново!", "#ff5555", 2000);
    resetGame(scene);
  }
}

function startLevel(scene, options = {}) {
  const { keepLives = false } = options;

  timeLeft = LEVEL_TIME_SEC;
  timerText.setText(`Время: ${timeLeft}`);
  levelText.setText(`Уровень: ${level}`);

  if (!keepLives) {
    livesLeft = LIVES_TOTAL;
    livesText.setText(`Попытки: ${livesLeft}`);
  }

  // Включаем интерактивность демонов (на случай если была победа/дизейбл)
  for (const d of demons) {
    d.setInteractive({ useHandCursor: true });
    scene.input.setDraggable(d);
  }

  for (const d of demons) {
    const ang = Math.random() * Math.PI * 2;
    const r = Math.random() * arenaRadius * 0.45;
    d.x = centerX + Math.cos(ang) * r;
    d.y = centerY + Math.sin(ang) * r;
    d.baseSpeed = Phaser.Math.FloatBetween(60, 95);
  }
}

function resetGame(scene) {
  gameEnded = false;
  level = 1;
  livesLeft = LIVES_TOTAL;

  levelText.setText(`Уровень: ${level}`);
  livesText.setText(`Попытки: ${livesLeft}`);

  destroyWinUI();

  // Запускаем первый уровень
  startLevel(scene, { keepLives: true });
}

function winGame(scene) {
  gameEnded = true;

  // Остановить таймер
  if (tickEvent) tickEvent.remove(false);

  // Остановить взаимодействие с демонами, НО НЕ выключать input целиком (иначе кнопка не работает)
  dragged = null;
  for (const d of demons) {
    d.disableInteractive();
  }

  // Показать промокод + кнопку
  showWinUI(scene);
}

function showWinUI(scene) {
  destroyWinUI();

  winContainer = scene.add.container(0, 0);

  // Полупрозрачная подложка
  const overlay = scene.add.rectangle(centerX, centerY, GAME_W, GAME_H, 0x000000, 0.75).setOrigin(0.5);

  // Текст победы
  const title = scene.add.text(centerX, centerY - 110, "Ты защитил систему!", {
    fontSize: "22px",
    color: "#ffffff",
    fontStyle: "bold",
    align: "center",
  }).setOrigin(0.5);

  const promo = scene.add.text(centerX, centerY - 70, PROMO_TEXT, {
    fontSize: "18px",
    color: "#55ff88",
    align: "center",
    wordWrap: { width: GAME_W - 40 }
  }).setOrigin(0.5);

  // Кнопка
  const btnW = 280;
  const btnH = 52;
  const btnY = centerY + 10;

  const btnBg = scene.add.rectangle(centerX, btnY, btnW, btnH, 0x00d5ff, 1).setOrigin(0.5);
  btnBg.setStrokeStyle(2, 0x003344, 1);

  const btnText = scene.add.text(centerX, btnY, "Перейти на slurm.io/architect", {
    fontSize: "15px",
    color: "#001018",
    fontStyle: "bold",
  }).setOrigin(0.5);

  // Делаем кнопку кликабельной
  btnBg.setInteractive({ useHandCursor: true });
  btnBg.on("pointerdown", () => openCourseLink());

  // Хинт
  const hint = scene.add.text(centerX, centerY + 80, "Откроется страница курса.\nПромокод применяй при оплате.", {
    fontSize: "14px",
    color: "#ffffff",
    align: "center",
    alpha: 0.9,
  }).setOrigin(0.5);

  winContainer.add([overlay, title, promo, btnBg, btnText, hint]);
}

function destroyWinUI() {
  if (winContainer) {
    winContainer.destroy(true);
    winContainer = null;
  }
}

function openCourseLink() {
  // В Telegram Mini App — корректно откроется через openLink
  if (window.Telegram?.WebApp?.openLink) {
    window.Telegram.WebApp.openLink(COURSE_URL);
  } else {
    window.open(COURSE_URL, "_blank", "noopener,noreferrer");
  }
}

function levelSpeedMultiplier(lvl) {
  const map = [0.65, 1.0, 1.35, 1.75, 2.2];
  return map[Math.max(0, Math.min(map.length - 1, lvl - 1))];
}

function drawArena() {
  arenaGfx.clear();
  arenaGfx.lineStyle(4, 0x00d5ff, 1);
  arenaGfx.strokeCircle(centerX, centerY, arenaRadius);
}

function showMessage(scene, text, color, ms) {
  messageText.setText(text);
  messageText.setColor(color);
  messageText.setVisible(true);
  scene.time.delayedCall(ms, () => messageText.setVisible(false));
}
