// game.js — каркас игры: масштабирование поля, экран старта,
// бег героя на фоне уровня 1.

(function () {
  'use strict';

  const W = CONFIG.view.width;
  const H = CONFIG.view.height;
  const C = CONFIG.colors;
  const F = CONFIG.fonts;
  const M = CONFIG.layout.menu;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // Состояние игры. Экраны: меню, бег, победа, поражение.
  const state = {
    screen: 'menu',
    hero: 0,          // выбранный герой (индекс в CONTENT.heroes)
    phase: 0,         // фаза анимации бега
    cloudOffset: 0,   // сдвиг облаков
    cityOffset: 0,    // сдвиг домов
    groundOffset: 0,  // сдвиг разметки на земле
    time: 0,          // время уровня в секундах

    // Уровень 1
    worldX: 0,        // пройденная дистанция
    lives: CONFIG.lives.start,
    invuln: 0,        // остаток неуязвимости после столкновения
    jumpY: 0,         // высота героя над землёй
    jumpVY: 0,        // скорость прыжка
    onGround: true,
    jumped: false,    // был ли уже первый прыжок (для подсказки)
    obstacles: [],
    nextObstacleX: 0,

    // Бонусы
    bonuses: [],
    bonusPlan: [],        // запланированные позиции на уровне
    bonusPool: [],        // все бонусы уровня 1 одним списком
    bonusSpawned: 0,
    bonusTotal: 0,        // общий счётчик для HUD
    bonusByCategory: {},  // счётчики по категориям, игроку не показываются
    bonusPopups: [],      // всплывающие надписи «+Английский»

    running: false,
    rafId: 0,
    lastTime: 0
  };

  // Физика прыжка считается из высоты и времени в воздухе
  const JUMP_VELOCITY = 4 * CONFIG.jump.height / CONFIG.jump.airTime;
  const JUMP_GRAVITY = 8 * CONFIG.jump.height / (CONFIG.jump.airTime * CONFIG.jump.airTime);

  // ---------- Фон: облака и дома ----------

  const CLOUD_TILE = 720; // ширина повторяющегося ряда облаков
  const CITY_TILE = 720;  // ширина повторяющегося ряда домов

  const clouds = [
    { x: 40, y: 92, w: 64 },
    { x: 190, y: 58, w: 46 },
    { x: 330, y: 128, w: 70 },
    { x: 470, y: 74, w: 54 },
    { x: 610, y: 118, w: 62 }
  ];

  // Дома создаются один раз при запуске
  const buildings = [];
  (function buildCity() {
    let x = 0;
    while (x < CITY_TILE - 30) {
      const w = 26 + Math.random() * 34;
      const h = 40 + Math.random() * 95;
      buildings.push({ x: x, w: w, h: h, win: Math.random() < 0.45 });
      x += w + 10 + Math.random() * 22;
    }
  })();

  function drawCloud(x, y, w) {
    const h = w * 0.42;
    ctx.fillStyle = C.cloud;
    ctx.beginPath();
    ctx.arc(x, y, h * 0.6, 0, Math.PI * 2);
    ctx.arc(x + w * 0.25, y - h * 0.25, h * 0.75, 0, Math.PI * 2);
    ctx.arc(x + w * 0.55, y, h * 0.6, 0, Math.PI * 2);
    ctx.arc(x + w * 0.3, y + h * 0.25, h * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawClouds(offset) {
    const base = ((offset % CLOUD_TILE) + CLOUD_TILE) % CLOUD_TILE;
    for (let k = -1; k <= 1; k++) {
      for (let i = 0; i < clouds.length; i++) {
        const cl = clouds[i];
        const x = cl.x - base + k * CLOUD_TILE;
        if (x < -120 || x > W + 120) continue;
        drawCloud(x, cl.y, cl.w);
      }
    }
  }

  function drawCity(offset) {
    const groundY = CONFIG.layout.groundY;
    const base = ((offset % CITY_TILE) + CITY_TILE) % CITY_TILE;
    ctx.fillStyle = C.city;
    for (let k = -1; k <= 1; k++) {
      for (let i = 0; i < buildings.length; i++) {
        const b = buildings[i];
        const x = b.x - base + k * CITY_TILE;
        if (x + b.w < 0 || x > W) continue;
        ctx.fillRect(x, groundY - b.h, b.w, b.h);

        // Пара кремовых окон
        if (b.win) {
          ctx.fillStyle = C.cream;
          ctx.fillRect(x + b.w * 0.28, groundY - b.h + 10, 4, 6);
          ctx.fillRect(x + b.w * 0.58, groundY - b.h + 10, 4, 6);
          ctx.fillStyle = C.city;
        }
      }
    }
  }

  function drawBackground() {
    ctx.fillStyle = C.sky;
    ctx.fillRect(0, 0, W, H);
    drawClouds(state.cloudOffset);
    drawCity(state.cityOffset);
  }

  function drawGround(showMarks) {
    const groundY = CONFIG.layout.groundY;

    // Широкая тёмно-синяя полоса земли
    ctx.fillStyle = C.navy;
    ctx.fillRect(0, groundY, W, H - groundY);

    if (!showMarks) return;

    // Бегущие штрихи, чтобы чувствовать скорость
    ctx.fillStyle = C.deep;
    const step = 90;
    const base = state.groundOffset % step;
    for (let x = -step; x < W + step; x += step) {
      ctx.fillRect(x - base + 20, groundY + 24, 34, 4);
      ctx.fillRect(x - base + 65, groundY + 48, 20, 4);
    }
  }

  // ---------- Герой ----------

  // cx, feetY — точка по центру у ног; height — рост фигурки
  function drawHero(cx, feetY, height, kind, phase, moving, jumping) {
    const s = height / 100;
    ctx.save();
    ctx.translate(cx, feetY);
    ctx.scale(s, s);

    const bob = moving && !jumping ? Math.sin(phase * 2) * 1.5 : 0;
    const swing = moving && !jumping ? Math.sin(phase) : 0;

    // В прыжке ноги поджаты
    let footAX = -6 + swing * 20;
    let footAY = moving ? -Math.max(0, Math.cos(phase)) * 10 : 0;
    let footBX = 6 - swing * 20;
    let footBY = moving ? -Math.max(0, -Math.cos(phase)) * 10 : 0;
    if (jumping) {
      footAX = -12;
      footAY = -10;
      footBX = 10;
      footBY = -20;
    }

    // Ноги
    ctx.strokeStyle = C.navy;
    ctx.lineCap = 'round';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-6, -40 + bob);
    ctx.lineTo(footAX, footAY);
    ctx.moveTo(6, -40 + bob);
    ctx.lineTo(footBX, footBY);
    ctx.stroke();

    // Кроссовки
    ctx.fillStyle = C.cream;
    ctx.beginPath();
    ctx.arc(footAX, footAY, 4, 0, Math.PI * 2);
    ctx.arc(footBX, footBY, 4, 0, Math.PI * 2);
    ctx.fill();

    // Руки
    const armSwing = moving ? Math.sin(phase + Math.PI) : 0;
    ctx.strokeStyle = C.navy;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-9, -70 + bob);
    ctx.lineTo(-10 + armSwing * 10, -50 + bob);
    ctx.moveTo(9, -70 + bob);
    ctx.lineTo(10 - armSwing * 10, -50 + bob);
    ctx.stroke();

    // Туловище
    const bodyW = kind === 'girl' ? 22 : 26;
    ctx.fillStyle = C.navy;
    roundRect(-bodyW / 2, -78 + bob, bodyW, 38, 7);
    ctx.fill();

    if (kind === 'girl') {
      // Юбка и кремовый поясок
      ctx.beginPath();
      ctx.moveTo(-12, -46 + bob);
      ctx.lineTo(12, -46 + bob);
      ctx.lineTo(19, -26 + bob);
      ctx.lineTo(-19, -26 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C.cream;
      ctx.fillRect(-12, -47 + bob, 24, 3);
    } else {
      // Кремовая полоска на футболке
      ctx.fillStyle = C.cream;
      ctx.fillRect(-9, -60 + bob, 18, 4);
    }

    // Длинные волосы и хвост у девушки
    if (kind === 'girl') {
      ctx.fillStyle = C.navy;
      roundRect(-15, -99 + bob, 18, 36, 8);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-13, -80 + bob, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Голова
    ctx.fillStyle = C.cream;
    ctx.beginPath();
    ctx.arc(0, -86 + bob, 12.5, 0, Math.PI * 2);
    ctx.fill();

    // Волосы сверху
    ctx.fillStyle = C.navy;
    ctx.beginPath();
    ctx.arc(0, -88 + bob, 13, Math.PI * 1.02, Math.PI * 1.98);
    ctx.fill();

    // Глаз
    ctx.fillStyle = C.deep;
    ctx.beginPath();
    ctx.arc(5, -87 + bob, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ---------- Экран старта ----------

  function heroCardRect(i) {
    return {
      x: M.cardMargin + i * (M.cardWidth + M.cardGap),
      y: M.cardTop,
      w: M.cardWidth,
      h: M.cardHeight
    };
  }

  function startButtonRect() {
    return {
      x: (W - M.startWidth) / 2,
      y: M.startTop,
      w: M.startWidth,
      h: M.startHeight
    };
  }

  // В меню фон спокойнее: небо, облака и земля, без домов,
  // чтобы подсказки внизу читались.
  function drawMenuBackground() {
    ctx.fillStyle = C.sky;
    ctx.fillRect(0, 0, W, H);
    drawClouds(state.cloudOffset);
    drawGround(false);
  }

  function drawMenu() {
    drawMenuBackground();

    drawFitText(CONTENT.title, W / 2, M.titleY, 34, 'bold', F.title, C.deep, W - 32);
    drawFitText(CONTENT.subtitle, W / 2, M.subtitleY, 12, 'normal', F.text, C.deep, W - 32);
    drawFitText(CONTENT.heroLabel, W / 2, M.heroLabelY, 13, 'bold', F.text, C.deep, W - 32);

    // Две карточки героев
    for (let i = 0; i < CONTENT.heroes.length; i++) {
      const r = heroCardRect(i);
      const hero = CONTENT.heroes[i];
      const selected = i === state.hero;

      // Выбранная карточка акцентная, вторая кремовая
      ctx.fillStyle = selected ? C.accent : C.cream;
      roundRect(r.x, r.y, r.w, r.h, 16);
      ctx.fill();

      // Кружок неба за фигуркой, чтобы кремовая голова была видна
      ctx.fillStyle = C.sky;
      ctx.beginPath();
      ctx.arc(r.x + r.w / 2, r.y + 62, 46, 0, Math.PI * 2);
      ctx.fill();

      drawHero(r.x + r.w / 2, r.y + r.h - 38, 92, hero.id, 0, false);
      drawFitText(hero.name, r.x + r.w / 2, r.y + r.h - 14, 14, 'bold', F.text, C.deep, r.w - 16);
    }

    // Кнопка «Старт»
    const btn = startButtonRect();
    ctx.fillStyle = C.navy;
    roundRect(btn.x, btn.y, btn.w, btn.h, 14);
    ctx.fill();
    drawFitText(CONTENT.startButton, W / 2, btn.y + btn.h / 2 + 7, 20, 'bold', F.text, C.cream, btn.w - 24);

    // Подсказка и мини-иконки
    // Подсказка переносится по словам. Одна строка стоит на M.hintY,
    // две строки располагаются симметрично вокруг него.
    // Перенос можно задать вручную символом \n в content.js.
    const hintLines = wrapLines(CONTENT.hint, W - 48, 12, 'normal', F.text);
    const hintLineHeight = 15;
    const hintTop = M.hintY - (hintLines.length - 1) * hintLineHeight / 2;
    for (let i = 0; i < hintLines.length; i++) {
      drawText(hintLines[i], W / 2, hintTop + i * hintLineHeight, 12, 'normal', F.text, C.deep);
    }
    for (let i = 0; i < CONTENT.hintIcons.length; i++) {
      const item = CONTENT.hintIcons[i];
      const x = W / 2 + (i - 1) * 90;
      drawMiniIcon(item.type, x, M.iconsY);
      drawFitText(item.label, x, M.iconLabelY, 10, 'normal', F.text, C.deep, 84);
    }
  }

  function drawMiniIcon(type, cx, cy) {
    if (type === 'bonus') {
      ctx.fillStyle = C.accent;
      ctx.beginPath();
      ctx.arc(cx, cy, 11, 0, Math.PI * 2);
      ctx.fill();

      // Лампочка
      ctx.fillStyle = C.deep;
      ctx.beginPath();
      ctx.arc(cx, cy - 2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(cx - 2, cy + 2, 4, 3);
    } else if (type === 'obstacle') {
      ctx.fillStyle = C.navy;
      roundRect(cx - 10, cy - 10, 20, 20, 5);
      ctx.fill();
      ctx.fillStyle = C.cream;
      ctx.fillRect(cx - 6, cy - 2, 12, 4);
    } else if (type === 'life') {
      drawHeart(cx, cy, 11, C.navy);
    }
  }

  // ---------- Препятствия и финиш ----------

  function drawObstacles() {
    const groundY = CONFIG.layout.groundY;
    for (let i = 0; i < state.obstacles.length; i++) {
      const o = state.obstacles[i];
      if (o.dead) continue;

      const x = o.x - state.worldX;
      if (x + o.w < -20 || x > W + 20) continue;

      const y = groundY - o.h;
      drawObstacleShape(o.type, x, y, o.w, o.h);
      drawObstaclePlate(o.name, x + o.w / 2, y - 6);
    }
  }

  // Кремовая плашка с названием препятствия
  function drawObstaclePlate(name, cx, bottomY) {
    const fontSize = CONFIG.obstacles.plateFontSize;
    const plateH = CONFIG.obstacles.plateHeight;

    ctx.font = 'bold ' + fontSize + 'px ' + F.text;
    const plateW = ctx.measureText(name).width + 16;
    let x = cx - plateW / 2;
    x = Math.max(4, Math.min(W - plateW - 4, x));
    const y = bottomY - plateH;

    ctx.fillStyle = C.cream;
    roundRect(x, y, plateW, plateH, 6);
    ctx.fill();

    drawText(name, x + plateW / 2, y + plateH - 7, fontSize, 'bold', F.text, C.deep);
  }

  // Каждое препятствие — плоская фигурка из простых форм
  function drawObstacleShape(type, x, y, w, h) {
    if (type === 'ghost') {
      // Призрак-простыня
      ctx.fillStyle = C.navy;
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x, y + w / 2);
      ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + w * 0.75, y + h - 8);
      ctx.lineTo(x + w * 0.5, y + h);
      ctx.lineTo(x + w * 0.25, y + h - 8);
      ctx.closePath();
      ctx.fill();

      // Кремовые глаза
      ctx.fillStyle = C.cream;
      ctx.beginPath();
      ctx.arc(x + w * 0.35, y + 26, 4, 0, Math.PI * 2);
      ctx.arc(x + w * 0.65, y + 26, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'papers') {
      // Стопка бумаг
      const sheetH = h * 0.34;
      for (let i = 0; i < 3; i++) {
        const sw = w - i * 8;
        const sx = x + i * 4;
        const sy = y + h - sheetH - i * h * 0.27;

        ctx.fillStyle = C.navy;
        roundRect(sx, sy, sw, sheetH, 2);
        ctx.fill();

        // Кремовые строчки
        ctx.fillStyle = C.cream;
        ctx.fillRect(sx + 6, sy + 5, sw - 12, 2);
        ctx.fillRect(sx + 6, sy + 10, sw - 18, 2);
      }
    } else if (type === 'door') {
      // Дверь с замком
      ctx.fillStyle = C.navy;
      roundRect(x, y, w, h, 10);
      ctx.fill();

      // Кремовый замок
      ctx.fillStyle = C.cream;
      roundRect(x + w / 2 - 7, y + h * 0.45, 14, 12, 3);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h * 0.45, 5, Math.PI, 0);
      ctx.fill();

      ctx.fillStyle = C.deep;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h * 0.45 + 6, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'sign') {
      // Табличка на столбе
      ctx.fillStyle = C.navy;
      ctx.fillRect(x + w / 2 - 5, y + 20, 10, h - 20);

      roundRect(x, y, w, 26, 4);
      ctx.fill();

      ctx.fillStyle = C.cream;
      ctx.fillRect(x + 7, y + 8, w - 14, 3);
      ctx.fillRect(x + 7, y + 16, w - 22, 3);
    }
  }

  // Финишная дверь «Офис мечты»
  function drawDoor() {
    const d = CONFIG.door;
    const doorWorldX = CONFIG.level.distance + CONFIG.layout.heroX - d.width / 2;
    const x = doorWorldX - state.worldX;
    if (x > W + 60) return;

    const y = CONFIG.layout.groundY - d.height;

    ctx.fillStyle = C.cream;
    roundRect(x, y, d.width, d.height, 10);
    ctx.fill();

    // Ручка
    ctx.fillStyle = C.accent;
    ctx.beginPath();
    ctx.arc(x + d.width - 18, y + d.height * 0.55, 6, 0, Math.PI * 2);
    ctx.fill();

    // Табличка над дверью
    const label = CONTENT.finishSign;
    ctx.font = 'bold 13px ' + F.text;
    const plateW = ctx.measureText(label).width + 20;
    const plateX = x + d.width / 2 - plateW / 2;
    const plateY = y - 34;

    ctx.fillStyle = C.deep;
    roundRect(plateX, plateY, plateW, 24, 6);
    ctx.fill();
    drawText(label, x + d.width / 2, plateY + 16, 13, 'bold', F.text, C.cream);
  }

  // ---------- Бонусы ----------

  // Все бонусы уровня 1 одним списком: категория, иконка, название
  function bonusList() {
    const list = [];
    const cats = CONTENT.bonuses.categories;
    for (let i = 0; i < cats.length; i++) {
      for (let j = 0; j < cats[i].level1.length; j++) {
        list.push({
          category: cats[i].id,
          icon: cats[i].icon,
          name: cats[i].level1[j]
        });
      }
    }
    return list;
  }

  // Раскладываем бонусы по дистанции: ровно count штук между первым и финишем
  function planBonusPositions(count) {
    const cfg = CONFIG.bonuses;
    const span = CONFIG.level.distance - cfg.endMargin - cfg.firstAt;
    const positions = [];
    const weights = [];
    let sum = 0;

    for (let i = 0; i < count; i++) {
      const w = randomBetween(1 - cfg.jitter, 1 + cfg.jitter);
      weights.push(w);
      sum += w;
    }

    let acc = 0;
    for (let i = 0; i < count; i++) {
      positions.push(cfg.firstAt + span * (acc / sum));
      acc += weights[i];
    }
    return positions;
  }

  function drawBonuses() {
    const groundY = CONFIG.layout.groundY;

    for (let i = 0; i < state.bonuses.length; i++) {
      const b = state.bonuses[i];
      if (b.taken) continue;

      const x = b.x - state.worldX;
      if (x < -b.r || x > W + b.r) continue;
      const y = groundY - b.height;

      // Акцентно-жёлтый круг
      ctx.fillStyle = C.accent;
      ctx.beginPath();
      ctx.arc(x, y, b.r, 0, Math.PI * 2);
      ctx.fill();

      // Тёмно-синяя иконка категории, растёт вместе с кругом
      drawBonusIcon(b.icon, x, y - b.r * 0.08, b.r * 0.56);

      // Подпись под кругом
      drawBonusLabel(b.name, x, y + b.r + 4);
    }
  }

  // Простые иконки категорий, рисуются фигурами
  function drawBonusIcon(icon, cx, cy, s) {
    ctx.fillStyle = C.deep;

    if (icon === 'bulb') {
      // Лампочка: колба и цоколь
      ctx.beginPath();
      ctx.arc(cx, cy - s * 0.2, s * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(cx - s * 0.24, cy + s * 0.3, s * 0.48, s * 0.4);
    } else if (icon === 'people') {
      // Два человечка: головы и плечи
      ctx.beginPath();
      ctx.arc(cx - s * 0.34, cy - s * 0.42, s * 0.28, 0, Math.PI * 2);
      ctx.arc(cx + s * 0.34, cy - s * 0.14, s * 0.28, 0, Math.PI * 2);
      ctx.fill();
      roundRect(cx - s * 0.74, cy - s * 0.06, s * 0.62, s * 0.5, s * 0.2);
      ctx.fill();
      roundRect(cx + s * 0.02, cy + s * 0.2, s * 0.62, s * 0.5, s * 0.2);
      ctx.fill();
    } else if (icon === 'bolt') {
      // Молния
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.22, cy - s * 0.78);
      ctx.lineTo(cx - s * 0.48, cy + s * 0.08);
      ctx.lineTo(cx - s * 0.02, cy + s * 0.08);
      ctx.lineTo(cx - s * 0.22, cy + s * 0.78);
      ctx.lineTo(cx + s * 0.48, cy - s * 0.1);
      ctx.lineTo(cx + s * 0.02, cy - s * 0.1);
      ctx.closePath();
      ctx.fill();
    } else {
      // Бумажный самолётик
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.8, cy - s * 0.62);
      ctx.lineTo(cx - s * 0.8, cy + s * 0.02);
      ctx.lineTo(cx + s * 0.1, cy + s * 0.34);
      ctx.lineTo(cx + s * 0.3, cy + s * 0.8);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Кремовая плашка с названием бонуса. Длинное название переносится
  // на две строки, плашка не выходит за край поля.
  function drawBonusLabel(name, cx, topY) {
    const cfg = CONFIG.bonuses;
    const fontSize = cfg.labelFontSize;
    const lineHeight = fontSize + 3;

    // Строки подписи
    const lines = wrapLines(name, cfg.labelWidthMax - 12, fontSize, 'bold', F.text);

    // Ширина плашки по самой длинной строке
    ctx.font = 'bold ' + fontSize + 'px ' + F.text;
    let w = 0;
    for (let i = 0; i < lines.length; i++) {
      w = Math.max(w, ctx.measureText(lines[i]).width);
    }
    w = Math.min(w + 12, cfg.labelWidthMax);
    const h = lines.length * lineHeight + 6;

    // Держим плашку внутри поля
    const x = Math.max(2, Math.min(W - w - 2, cx - w / 2));

    ctx.fillStyle = C.cream;
    roundRect(x, topY, w, h, 6);
    ctx.fill();

    for (let i = 0; i < lines.length; i++) {
      drawText(lines[i], x + w / 2, topY + 3 + fontSize + i * lineHeight,
        fontSize, 'bold', F.text, C.deep);
    }
  }

  // Всплывающий текст после сбора
  function drawBonusPopups() {
    const cfg = CONFIG.bonuses.popup;
    for (let i = 0; i < state.bonusPopups.length; i++) {
      const p = state.bonusPopups[i];
      // В конце плавно растворяется
      ctx.globalAlpha = Math.min(1, p.life / 0.35);
      drawFitText(p.text, W / 2, p.y, cfg.fontSize, 'bold', F.title, C.deep, W - 24);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- Игра ----------

  function drawHud() {
    // Сердечки: слева сверху
    for (let i = 0; i < CONFIG.lives.start; i++) {
      drawHeart(24 + i * 26, 32, 11, i < state.lives ? C.deep : C.cream);
    }

    // Полоса прогресса
    const barX = 104;
    const barY = 24;
    const barW = 170;
    const barH = 8;

    ctx.fillStyle = C.cream;
    roundRect(barX, barY, barW, barH, 4);
    ctx.fill();

    const progress = Math.min(state.worldX / CONFIG.level.distance, 1);
    if (progress > 0) {
      ctx.fillStyle = C.deep;
      roundRect(barX, barY, Math.max(barW * progress, 8), barH, 4);
      ctx.fill();
    }

    // Общий счётчик бонусов: под сердечками
    ctx.fillStyle = C.accent;
    ctx.beginPath();
    ctx.arc(24, 66, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = C.deep;
    drawStar(24, 66, 6.5, 3);
    drawText(String(state.bonusTotal), 46, 71, 15, 'bold', F.text, C.deep);
  }

  // Мигающая подсказка «Тап!» до первого прыжка
  function drawTapHint() {
    if (state.jumped || state.time > CONFIG.hint.duration) return;
    if (Math.floor(state.time * 3) % 2 === 1) return;

    const x = CONFIG.layout.heroX;
    const y = CONFIG.layout.groundY - CONFIG.layout.heroHeight - 56;
    const w = 76;
    const h = 32;

    ctx.fillStyle = C.cream;
    roundRect(x - w / 2, y, w, h, 10);
    ctx.fill();
    drawFitText(CONTENT.tapHint, x, y + 22, 20, 'bold', F.text, C.deep, w - 12);
  }

  function drawRun() {
    drawBackground();
    drawGround(true);
    drawDoor();
    drawObstacles();
    drawBonuses();

    // После столкновения герой мигает
    const blink = state.invuln > 0 && Math.floor(state.invuln * 10) % 2 === 0;
    if (!blink) {
      const hero = CONTENT.heroes[state.hero];
      drawHero(
        CONFIG.layout.heroX,
        CONFIG.layout.groundY - state.jumpY,
        CONFIG.layout.heroHeight,
        hero.id,
        state.phase,
        true,
        !state.onGround
      );
    }

    drawBonusPopups();
    drawHud();
    drawTapHint();
  }

  // ---------- Экраны победы и поражения ----------

  function endButtonRect() {
    return { x: (W - 240) / 2, y: 430, w: 240, h: 54 };
  }

  function drawEnd() {
    ctx.fillStyle = C.sky;
    ctx.fillRect(0, 0, W, H);
    drawClouds(state.cloudOffset);
    drawGround(false);

    const screen = state.screen === 'win' ? CONTENT.screens.win : CONTENT.screens.lose;

    drawFitText(screen.title, W / 2, 220, 32, 'bold', F.title, C.deep, W - 32);
    drawWrappedText(screen.text, W / 2, 262, 280, 24, 16, 'normal', F.text, C.deep);

    const btn = endButtonRect();
    ctx.fillStyle = C.navy;
    roundRect(btn.x, btn.y, btn.w, btn.h, 14);
    ctx.fill();
    drawFitText(screen.button, W / 2, btn.y + btn.h / 2 + 6, 17, 'bold', F.text, C.cream, btn.w - 24);
  }

  function draw() {
    if (state.screen === 'menu') {
      drawMenu();
    } else if (state.screen === 'run') {
      drawRun();
    } else {
      drawEnd();
    }
  }

  // ---------- Вспомогательное рисование ----------

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawHeart(cx, cy, size, color) {
    const s = size;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.75);
    ctx.bezierCurveTo(cx - s * 1.4, cy - s * 0.1, cx - s * 0.55, cy - s, cx, cy - s * 0.35);
    ctx.bezierCurveTo(cx + s * 0.55, cy - s, cx + s * 1.4, cy - s * 0.1, cx, cy + s * 0.75);
    ctx.closePath();
    ctx.fill();
  }

  // Пятиконечная звезда: значок счётчика бонусов
  function drawStar(cx, cy, outer, inner) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawText(text, x, y, size, weight, font, color) {
    ctx.fillStyle = color;
    ctx.font = weight + ' ' + size + 'px ' + font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
  }

  // Текст в одну строку: если не помещается по ширине, шрифт немного
  // уменьшается (но не меньше 70% от заданного размера)
  function drawFitText(text, x, y, size, weight, font, color, maxWidth) {
    let s = size;
    const minSize = Math.floor(size * 0.7);
    ctx.font = weight + ' ' + s + 'px ' + font;
    while (s > minSize && ctx.measureText(text).width > maxWidth) {
      s -= 1;
      ctx.font = weight + ' ' + s + 'px ' + font;
    }
    drawText(text, x, y, s, weight, font, color);
  }

  // Разбивает текст на строки по ширине. Слова не режутся.
  // Неразрывный пробел (\u00A0) склеивает слова, \n задаёт перенос вручную.
  function wrapLines(text, maxWidth, size, weight, font) {
    ctx.font = weight + ' ' + size + 'px ' + font;
    const result = [];
    const paragraphs = text.split('\n');

    for (let p = 0; p < paragraphs.length; p++) {
      const words = paragraphs[p].split(' ');
      let line = '';
      for (let i = 0; i < words.length; i++) {
        const test = line ? line + ' ' + words[i] : words[i];
        if (line && ctx.measureText(test).width > maxWidth) {
          result.push(line);
          line = words[i];
        } else {
          line = test;
        }
      }
      result.push(line);
    }
    return result;
  }

  // Перенос длинного текста по словам. Возвращает число строк.
  function drawWrappedText(text, cx, y, maxWidth, lineHeight, size, weight, font, color) {
    const lines = wrapLines(text, maxWidth, size, weight, font);
    for (let i = 0; i < lines.length; i++) {
      drawText(lines[i], cx, y + i * lineHeight, size, weight, font, color);
    }
    return lines.length;
  }

  // ---------- Масштабирование поля ----------

  function resize() {
    const stage = document.getElementById('stage');
    const availW = stage.clientWidth;
    const availH = stage.clientHeight;
    if (!availW || !availH) return;

    // Поле 360×640 вписываем с сохранением пропорций
    const scale = Math.min(availW / W, availH / H);
    const cssW = W * scale;
    const cssH = H * scale;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);

    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    // Рисуем в логических координатах 360×640
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    draw();
  }

  // ---------- Ввод ----------

  function isInside(r, x, y) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  function handleTap(x, y) {
    // Во время бега любой тап — прыжок
    if (state.screen === 'run') {
      jump();
      return;
    }

    if (state.screen === 'menu') {
      for (let i = 0; i < CONTENT.heroes.length; i++) {
        if (isInside(heroCardRect(i), x, y)) {
          state.hero = i;
          draw();
          return;
        }
      }

      if (isInside(startButtonRect(), x, y)) {
        startLevel();
      }
      return;
    }

    // Победа или поражение: кнопка перезапуска
    if (isInside(endButtonRect(), x, y)) {
      startLevel();
    }
  }

  function jump() {
    if (state.screen !== 'run' || !state.onGround) return;
    state.jumpVY = JUMP_VELOCITY;
    state.onGround = false;
    state.jumped = true;
  }

  function startLevel() {
    state.screen = 'run';
    state.phase = 0;
    state.time = 0;
    state.worldX = 0;
    state.lives = CONFIG.lives.start;
    state.invuln = 0;
    state.jumpY = 0;
    state.jumpVY = 0;
    state.onGround = true;
    state.jumped = false;
    state.obstacles = [];
    state.nextObstacleX = CONFIG.obstacles.firstAt;
    state.groundOffset = 0;

    // Бонусы: обнуляем счётчики и планируем 12–15 штук на уровень
    state.bonuses = [];
    state.bonusPopups = [];
    state.bonusTotal = 0;
    state.bonusByCategory = {};
    const cats = CONTENT.bonuses.categories;
    for (let i = 0; i < cats.length; i++) {
      state.bonusByCategory[cats[i].id] = 0;
    }
    state.bonusCount = Math.floor(randomBetween(CONFIG.bonuses.countMin, CONFIG.bonuses.countMax + 1));
    state.bonusSpawned = 0;
    state.bonusPool = bonusList();
    state.bonusPlan = planBonusPositions(state.bonusCount);

    draw();
  }

  canvas.addEventListener('pointerdown', function (e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * W;
    const y = (e.clientY - rect.top) / rect.height * H;
    handleTap(x, y);
  });

  // Пробел: старт, прыжок, перезапуск
  window.addEventListener('keydown', function (e) {
    if (e.code !== 'Space' && e.key !== ' ') return;

    if (state.screen === 'run') {
      e.preventDefault();
      jump();
    } else if (state.screen === 'menu' || state.screen === 'win' || state.screen === 'lose') {
      e.preventDefault();
      startLevel();
    }
  });

  // ---------- Игровой цикл ----------

  // Скорость растёт плавно по дистанции
  function getSpeed() {
    const p = Math.min(state.worldX / CONFIG.level.distance, 1);
    return CONFIG.motion.runSpeed + (CONFIG.level.speedEnd - CONFIG.motion.runSpeed) * p;
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function spawnObstacles() {
    const limit = CONFIG.level.distance - 300;

    while (state.nextObstacleX < state.worldX + W + 200 && state.nextObstacleX < limit) {
      const list = CONTENT.obstacles.level1;
      const item = list[Math.floor(Math.random() * list.length)];
      const size = CONFIG.obstacles.types[item.type];

      state.obstacles.push({
        x: state.nextObstacleX,
        type: item.type,
        name: item.name,
        w: size.width,
        h: size.height,
        dead: false
      });

      // Зазор не меньше скорость × 0,9 с плюс случайная добавка
      const p = Math.min(state.nextObstacleX / CONFIG.level.distance, 1);
      const speedHere = CONFIG.motion.runSpeed +
        (CONFIG.level.speedEnd - CONFIG.motion.runSpeed) * p;
      const gap = speedHere * CONFIG.obstacles.minGapTime +
        randomBetween(CONFIG.obstacles.extraGapMin, CONFIG.obstacles.extraGapMax);
      state.nextObstacleX += size.width + gap;
    }
  }

  // Бонусы ставим только там, где препятствия уже созданы,
  // поэтому все препятствия на этом месте видны и можно их обойти.
  function freeBonusX(startX) {
    const gap = CONFIG.bonuses.radius + CONFIG.bonuses.obstacleMargin;
    let x = startX;

    for (let n = 0; n < 12; n++) {
      let shifted = false;
      for (let i = 0; i < state.obstacles.length; i++) {
        const o = state.obstacles[i];
        if (x > o.x - gap && x < o.x + o.w + gap) {
          x = o.x + o.w + gap;
          shifted = true;
        }
      }
      if (!shifted) return x;
    }
    return x;
  }

  function spawnBonuses() {
    if (state.bonusSpawned >= state.bonusPlan.length) return;

    const cfg = CONFIG.bonuses;
    const frontier = state.worldX + W + 120;

    while (state.bonusSpawned < state.bonusPlan.length) {
      // Позицию из плана сдвигаем, если на ней стоит препятствие
      const x = freeBonusX(state.bonusPlan[state.bonusSpawned]);
      if (x > frontier) return;

      const item = state.bonusPool[Math.floor(Math.random() * state.bonusPool.length)];
      const inAir = Math.random() < cfg.airShare;

      state.bonuses.push({
        x: x,
        height: inAir ? randomBetween(cfg.airHeightMin, cfg.airHeightMax) : cfg.groundHeight,
        r: cfg.radius,
        category: item.category,
        icon: item.icon,
        name: item.name,
        taken: false
      });

      state.bonusSpawned += 1;
    }
  }

  // Сбор бонуса касанием героя
  function checkBonusPickup() {
    const heroX = CONFIG.layout.heroX;
    const feet = CONFIG.layout.groundY - state.jumpY;
    const heroW = CONFIG.player.hitWidth;
    const heroH = CONFIG.player.hitHeight;
    const heroBox = {
      x: heroX - heroW / 2,
      y: feet - heroH,
      w: heroW,
      h: heroH
    };

    for (let i = 0; i < state.bonuses.length; i++) {
      const b = state.bonuses[i];
      if (b.taken) continue;

      const bx = b.x - state.worldX;
      if (bx < -80 || bx > W + 80) continue;
      const by = CONFIG.layout.groundY - b.height;

      // Ближайшая к центру круга точка прямоугольника героя
      const nx = Math.max(heroBox.x, Math.min(bx, heroBox.x + heroBox.w));
      const ny = Math.max(heroBox.y, Math.min(by, heroBox.y + heroBox.h));
      const dx = bx - nx;
      const dy = by - ny;

      // Расстояние сравниваем с квадратом радиуса
      if (dx * dx + dy * dy <= b.r * b.r) {
        collectBonus(b);
      }
    }
  }

  function collectBonus(b) {
    b.taken = true;
    state.bonusTotal += 1;
    state.bonusByCategory[b.category] = (state.bonusByCategory[b.category] || 0) + 1;

    // Всплывающий текст над героем
    state.bonusPopups.push({
      text: CONTENT.bonuses.popupPrefix + b.name,
      y: CONFIG.layout.groundY - state.jumpY - CONFIG.bonuses.popup.heroOffsetY,
      life: CONFIG.bonuses.popup.duration
    });
  }

  function updateBonusPopups(dt) {
    const cfg = CONFIG.bonuses.popup;
    for (let i = 0; i < state.bonusPopups.length; i++) {
      const p = state.bonusPopups[i];
      p.life -= dt;
      p.y -= cfg.rise * dt / cfg.duration;
    }
    state.bonusPopups = state.bonusPopups.filter(function (p) {
      return p.life > 0;
    });
  }

  function hitObstacle(o) {
    o.dead = true;
    state.lives -= 1;
    state.invuln = CONFIG.lives.invulnerableTime;
    if (state.lives <= 0) {
      state.screen = 'lose';
    }
  }

  // Проверка столкновения по прямоугольникам
  function checkCollisions() {
    if (state.invuln > 0) return;

    const heroX = CONFIG.layout.heroX;
    const feet = CONFIG.layout.groundY - state.jumpY;
    const heroW = CONFIG.player.hitWidth;
    const heroH = CONFIG.player.hitHeight;
    const heroBox = {
      x: heroX - heroW / 2,
      y: feet - heroH,
      w: heroW,
      h: heroH
    };

    const insetX = CONFIG.obstacles.hitInsetX;
    const insetTop = CONFIG.obstacles.hitInsetTop;

    for (let i = 0; i < state.obstacles.length; i++) {
      const o = state.obstacles[i];
      if (o.dead) continue;

      const ox = o.x - state.worldX;
      if (ox > W || ox + o.w < 0) continue;

      // Хитбокс препятствия тоже немного меньше рисунка
      const box = {
        x: ox + insetX,
        y: CONFIG.layout.groundY - o.h + insetTop,
        w: o.w - insetX * 2,
        h: o.h - insetTop
      };
      const hit = heroBox.x < box.x + box.w && heroBox.x + heroBox.w > box.x &&
        heroBox.y < box.y + box.h && heroBox.y + heroBox.h > box.y;
      if (hit) {
        hitObstacle(o);
        return;
      }
    }
  }

  function updateRun(dt) {
    state.time += dt;

    const speed = getSpeed();
    state.worldX += speed * dt;
    state.cloudOffset += speed * 0.12 * dt;
    state.cityOffset += speed * 0.32 * dt;
    state.groundOffset += speed * dt;
    state.phase += CONFIG.motion.runPhaseSpeed * (speed / CONFIG.motion.runSpeed) * dt;

    // Неуязвимость после столкновения
    if (state.invuln > 0) state.invuln = Math.max(0, state.invuln - dt);

    // Прыжок по времени, а не по кадрам
    if (!state.onGround) {
      state.jumpY += state.jumpVY * dt - 0.5 * JUMP_GRAVITY * dt * dt;
      state.jumpVY -= JUMP_GRAVITY * dt;
      if (state.jumpY <= 0) {
        state.jumpY = 0;
        state.jumpVY = 0;
        state.onGround = true;
      }
    }

    spawnObstacles();
    spawnBonuses();

    // Убираем далёкие препятствия
    state.obstacles = state.obstacles.filter(function (o) {
      return o.x - state.worldX > -200;
    });

    checkCollisions();
    if (state.screen !== 'run') return;

    // Бонусы: сбор и уборка собранных
    checkBonusPickup();
    state.bonuses = state.bonuses.filter(function (b) {
      return b.x - state.worldX > -120;
    });
    updateBonusPopups(dt);

    // Финиш
    if (state.worldX >= CONFIG.level.distance) {
      state.screen = 'win';
    }
  }

  function update(dt) {
    const motion = CONFIG.motion;
    if (state.screen === 'menu') {
      state.cloudOffset += motion.menuCloudSpeed * dt;
      state.cityOffset += motion.menuCitySpeed * dt;
    } else if (state.screen === 'run') {
      updateRun(dt);
    } else {
      // На экранах победы и поражения двигаются только облака
      state.cloudOffset += motion.menuCloudSpeed * dt;
    }
  }

  function loop(now) {
    if (!state.running) return;
    const dt = Math.min((now - state.lastTime) / 1000, 0.05);
    state.lastTime = now;
    update(dt);
    draw();
    state.rafId = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (state.running) return;
    state.running = true;
    state.lastTime = performance.now();
    state.rafId = requestAnimationFrame(loop);
  }

  function stopLoop() {
    state.running = false;
    cancelAnimationFrame(state.rafId);
  }

  // Пауза, когда вкладка скрыта
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stopLoop();
    } else {
      startLoop();
    }
  });

  // ---------- Запуск ----------

  document.documentElement.style.setProperty('--page-bg', C.pageBg);

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () {
    setTimeout(resize, 100);
  });

  if (window.ResizeObserver) {
    new ResizeObserver(resize).observe(document.getElementById('stage'));
  }

  resize();
  startLoop();
})();
