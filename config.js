// config.js — все цвета, шрифты и числа игры.
// Меняйте значения здесь, игровой код трогать не нужно.

const CONFIG = {
  // Логическое поле игры (портрет, mobile-first)
  view: {
    width: 360,
    height: 640
  },

  // Палитра из ТЗ
  colors: {
    navy: '#2B5180',    // основной тёмно-синий
    deep: '#1F3960',    // глубокий синий: текст и детали
    cream: '#EDE3D0',   // кремовый
    sky: '#A9C6E0',     // фон уровня 1
    yellow: '#F5DA8A',  // пастельно-жёлтый
    beige: '#F1E5D7',   // фон уровня 2 и страницы
    accent: '#EFC44F',  // акцент бонусов и выбранной карточки
    cloud: '#9CBBD9',   // облака чуть темнее неба
    city: '#8FB0D0',    // дома вдали чуть темнее неба
    pageBg: '#F1E5D7'   // фон страницы вокруг поля
  },

  // Шрифты. Файлы woff2 добавим позже, сейчас системные.
  // После добавления шрифтов достаточно поменять эти две строки.
  fonts: {
    title: 'Georgia, "Times New Roman", serif',              // заголовки
    text: 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif' // текст
  },

  // Раскладка экрана старта (в логических пикселях поля 360×640)
  layout: {
    groundY: 560,      // линия земли
    heroX: 90,         // герой на 25% ширины поля
    heroHeight: 96,    // рост героя в игре

    menu: {
      titleY: 80,
      subtitleY: 106,
      heroLabelY: 160,
      cardTop: 182,
      cardWidth: 132,
      cardHeight: 178,
      cardGap: 36,
      cardMargin: 30,
      startTop: 392,
      startWidth: 240,
      startHeight: 54,
      hintY: 482,
      iconsY: 518,
      iconLabelY: 542
    }
  },

  // Движение фона и героя
  motion: {
    menuCloudSpeed: 6,   // дрейф облаков в меню, px/с
    menuCitySpeed: 3,    // дрейф домов в меню, px/с
    runSpeed: 220,       // скорость мира на старте уровня 1, px/с
    runPhaseSpeed: 9     // скорость анимации бега
  },

  // Уровень 1: дистанция и скорость к финишу
  level: {
    distance: 19500,     // дистанция уровня, px (около 75 с)
    speedEnd: 300        // скорость у финиша, px/с
  },

  // Прыжок: высота и время в воздухе
  jump: {
    height: 110,
    airTime: 0.62
  },

  // Жизни
  lives: {
    start: 3,
    invulnerableTime: 1.5   // неуязвимость после столкновения, с
  },

  // Хитбокс героя чуть меньше рисунка — так столкновения честнее
  player: {
    hitWidth: 20,
    hitHeight: 84
  },

  // Подсказка «Тап!» в начале уровня
  hint: {
    duration: 5             // максимум секунд показа
  },

  // Препятствия уровня 1
  obstacles: {
    firstAt: 620,           // первое препятствие по дистанции
    minGapTime: 0.9,        // минимальный зазор = скорость × это время
    extraGapMin: 90,        // случайная добавка к зазору
    extraGapMax: 220,
    plateHeight: 22,
    plateFontSize: 13,
    hitInsetX: 6,           // хитбокс уже рисунка на столько с каждой стороны
    hitInsetTop: 4,         // хитбокс ниже рисунка сверху
    types: {
      ghost: { width: 46, height: 56 },
      papers: { width: 52, height: 48 },
      door: { width: 44, height: 62 },
      sign: { width: 46, height: 58 }
    }
  },

  // Финишная дверь
  door: {
    width: 110,
    height: 200
  }
};
