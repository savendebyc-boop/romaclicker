/* =============================================
   CRYPTO TAP — Game Logic
   Telegram Mini App Clicker
   ============================================= */

'use strict';

// ============================================================
// 1. TELEGRAM WEB APP INIT
// ============================================================
const TG = window.Telegram?.WebApp;

if (TG) {
  TG.ready();
  TG.expand();
  TG.enableClosingConfirmation();
  // Apply Telegram theme colors if available
  if (TG.colorScheme === 'dark' || !TG.colorScheme) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

/** Haptic feedback helper — safe to call even outside Telegram */
function haptic(type = 'light') {
  try {
    if (TG?.HapticFeedback) {
      if (type === 'impact') TG.HapticFeedback.impactOccurred('medium');
      else if (type === 'success') TG.HapticFeedback.notificationOccurred('success');
      else if (type === 'error') TG.HapticFeedback.notificationOccurred('error');
      else TG.HapticFeedback.impactOccurred('light');
    }
  } catch (_) {}
}

// ============================================================
// 2. UPGRADE DEFINITIONS
// ============================================================

const MULTI_TAP_UPGRADES = [
  { id: 'mt1', name: 'Быстрый палец',  icon: '👆', desc: '+1 монета за клик',      cost: 50,    bonus: 1,   maxLevel: 10 },
  { id: 'mt2', name: 'Двойной удар',   icon: '✌️', desc: '+2 монеты за клик',      cost: 200,   bonus: 2,   maxLevel: 10 },
  { id: 'mt3', name: 'Тройной тап',    icon: '🤘', desc: '+5 монет за клик',       cost: 800,   bonus: 5,   maxLevel: 10 },
  { id: 'mt4', name: 'Квантовый тап',  icon: '⚛️', desc: '+15 монет за клик',      cost: 3000,  bonus: 15,  maxLevel: 10 },
  { id: 'mt5', name: 'Мега-удар',      icon: '💥', desc: '+50 монет за клик',      cost: 12000, bonus: 50,  maxLevel: 10 },
];

const AUTO_UPGRADES = [
  { id: 'ac1', name: 'Майнинг-бот',    icon: '🤖', desc: '+1 монета в секунду',    cost: 100,   bonus: 1,   maxLevel: 15 },
  { id: 'ac2', name: 'Фарм-ферма',     icon: '🌾', desc: '+3 монеты в секунду',    cost: 500,   bonus: 3,   maxLevel: 15 },
  { id: 'ac3', name: 'GPU-кластер',    icon: '🖥️', desc: '+10 монет в секунду',    cost: 2000,  bonus: 10,  maxLevel: 15 },
  { id: 'ac4', name: 'ASIC-майнер',    icon: '⚡', desc: '+30 монет в секунду',    cost: 8000,  bonus: 30,  maxLevel: 15 },
  { id: 'ac5', name: 'Квантовая ферма',icon: '🌌', desc: '+100 монет в секунду',   cost: 35000, bonus: 100, maxLevel: 15 },
];

const ENERGY_UPGRADES = [
  { id: 'en1', name: 'Энерго-банк I',  icon: '🔋', desc: '+50 макс. энергии',      cost: 150,   bonus: 50,  type: 'maxEnergy',  maxLevel: 5 },
  { id: 'en2', name: 'Энерго-банк II', icon: '🔌', desc: '+100 макс. энергии',     cost: 600,   bonus: 100, type: 'maxEnergy',  maxLevel: 5 },
  { id: 'en3', name: 'Регенерация I',  icon: '💚', desc: '+1 ед. восст./сек',      cost: 300,   bonus: 1,   type: 'regenRate',  maxLevel: 5 },
  { id: 'en4', name: 'Регенерация II', icon: '💫', desc: '+3 ед. восст./сек',      cost: 1200,  bonus: 3,   type: 'regenRate',  maxLevel: 5 },
];

// ============================================================
// 3. DEFAULT GAME STATE
// ============================================================

function createDefaultState() {
  return {
    coins:        0,
    totalCoins:   0,
    totalClicks:  0,
    playtime:     0,        // seconds
    level:        1,

    energy:       100,
    maxEnergy:    100,
    baseRegen:    1,        // energy per second baseline

    perClick:     1,        // coins earned per click
    autoPerSec:   0,        // passive income per second

    upgrades: {},           // { upgradeId: level }

    lastSaved:    Date.now(),
  };
}

// ============================================================
// 4. STATE & PERSISTENCE
// ============================================================

const SAVE_KEY = 'cryptotap_v2';

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return createDefaultState();
    const saved = JSON.parse(raw);
    // Calculate offline earnings
    const now = Date.now();
    const elapsed = Math.floor((now - (saved.lastSaved || now)) / 1000);
    if (elapsed > 0 && saved.autoPerSec > 0) {
      const maxOffline = 4 * 3600; // cap at 4 hours
      const offlineSeconds = Math.min(elapsed, maxOffline);
      const earned = Math.floor(saved.autoPerSec * offlineSeconds);
      saved.coins += earned;
      saved.totalCoins += earned;
      if (earned > 0) {
        setTimeout(() => showToast(`📦 Оффлайн доход: +${formatNumber(earned)} монет`), 800);
      }
    }
    return { ...createDefaultState(), ...saved };
  } catch (_) {
    return createDefaultState();
  }
}

function saveState() {
  state.lastSaved = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (_) {}
}

let state = loadState();

// ============================================================
// 5. COMPUTED VALUES (recalculate after each upgrade purchase)
// ============================================================

function recalcStats() {
  let perClick = 1;
  let autoPerSec = 0;
  let maxEnergy = 100;
  let regenBonus = 0;

  for (const upg of MULTI_TAP_UPGRADES) {
    const lvl = state.upgrades[upg.id] || 0;
    perClick += upg.bonus * lvl;
  }

  for (const upg of AUTO_UPGRADES) {
    const lvl = state.upgrades[upg.id] || 0;
    autoPerSec += upg.bonus * lvl;
  }

  for (const upg of ENERGY_UPGRADES) {
    const lvl = state.upgrades[upg.id] || 0;
    if (upg.type === 'maxEnergy') maxEnergy += upg.bonus * lvl;
    if (upg.type === 'regenRate') regenBonus += upg.bonus * lvl;
  }

  state.perClick   = perClick;
  state.autoPerSec = autoPerSec;
  state.maxEnergy  = maxEnergy;
  state.baseRegen  = 1 + regenBonus;

  // Level based on total coins
  state.level = Math.max(1, Math.floor(Math.log10(Math.max(state.totalCoins, 1) + 1)) + 1);
}

// ============================================================
// 6. DOM REFERENCES
// ============================================================

const DOM = {
  coinCount:       document.getElementById('coinCount'),
  energyCurrent:   document.getElementById('energyCurrent'),
  energyMax:       document.getElementById('energyMax'),
  energyFill:      document.getElementById('energyFill'),
  tapBtn:          document.getElementById('tapBtn'),
  passiveRate:     document.getElementById('passiveRate'),
  perClickStat:    document.getElementById('perClickStat'),
  autoStat:        document.getElementById('autoStat'),
  levelStat:       document.getElementById('levelStat'),
  shopBalance:     document.getElementById('shopBalance'),
  multiTapList:    document.getElementById('multiTapList'),
  autoClickList:   document.getElementById('autoClickList'),
  energyUpList:    document.getElementById('energyUpgradeList'),
  statTotal:       document.getElementById('statTotal'),
  statClicks:      document.getElementById('statClicks'),
  statPerClick:    document.getElementById('statPerClick'),
  statAuto:        document.getElementById('statAuto'),
  statPlaytime:    document.getElementById('statPlaytime'),
  statLevel:       document.getElementById('statLevel'),
  floatingContainer: document.getElementById('floatingContainer'),
  toast:           document.getElementById('toast'),
  resetBtn:        document.getElementById('resetBtn'),
  navBtns:         document.querySelectorAll('.nav-btn'),
  screens:         document.querySelectorAll('.screen'),
};

// ============================================================
// 7. UI UPDATES
// ============================================================

function formatNumber(n) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 10_000)        return (n / 1_000).toFixed(1) + 'K';
  return Math.floor(n).toLocaleString('ru-RU');
}

function updateUI() {
  DOM.coinCount.textContent     = formatNumber(state.coins);
  DOM.energyCurrent.textContent = Math.floor(state.energy);
  DOM.energyMax.textContent     = state.maxEnergy;

  const energyPct = (state.energy / state.maxEnergy) * 100;
  DOM.energyFill.style.width    = `${Math.max(0, Math.min(100, energyPct))}%`;

  // Energy color: red when low
  if (energyPct < 25) {
    DOM.energyFill.style.background = 'linear-gradient(90deg, #ef4444, #f97316)';
  } else if (energyPct < 60) {
    DOM.energyFill.style.background = 'linear-gradient(90deg, #f59e0b, #eab308)';
  } else {
    DOM.energyFill.style.background = 'linear-gradient(90deg, var(--accent), var(--accent2))';
  }

  DOM.passiveRate.textContent   = `${state.autoPerSec}/s`;
  DOM.perClickStat.textContent  = `+${state.perClick}`;
  DOM.autoStat.textContent      = state.autoPerSec;
  DOM.levelStat.textContent     = state.level;
  DOM.shopBalance.textContent   = formatNumber(state.coins);

  // Stats screen
  DOM.statTotal.textContent     = formatNumber(state.totalCoins);
  DOM.statClicks.textContent    = formatNumber(state.totalClicks);
  DOM.statPerClick.textContent  = state.perClick;
  DOM.statAuto.textContent      = state.autoPerSec;
  DOM.statPlaytime.textContent  = formatPlaytime(state.playtime);
  DOM.statLevel.textContent     = state.level;
}

function formatPlaytime(seconds) {
  if (seconds < 60)   return `${seconds} сек`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин`;
  return `${Math.floor(seconds / 3600)} ч ${Math.floor((seconds % 3600) / 60)} мин`;
}

// ============================================================
// 8. FLOATING TEXT
// ============================================================

function spawnFloatText(x, y, text) {
  const el = document.createElement('span');
  el.className = 'float-text';
  el.textContent = text;
  // Offset randomly a bit so multiple touches don't stack
  el.style.left = `${x - 20 + Math.random() * 40}px`;
  el.style.top  = `${y - 20}px`;
  DOM.floatingContainer.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

// ============================================================
// 9. TOAST NOTIFICATION
// ============================================================

let toastTimer = null;

function showToast(message, duration = 2500) {
  DOM.toast.textContent = message;
  DOM.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => DOM.toast.classList.remove('show'), duration);
}

// ============================================================
// 10. TAP HANDLER
// ============================================================

DOM.tapBtn.addEventListener('pointerdown', handleTap, { passive: true });

function handleTap(e) {
  if (state.energy < 1) {
    haptic('error');
    showToast('⚡ Нет энергии! Подожди восстановления…');
    DOM.tapBtn.classList.add('pressed');
    setTimeout(() => DOM.tapBtn.classList.remove('pressed'), 120);
    return;
  }

  // Deduct energy
  state.energy = Math.max(0, state.energy - 1);

  // Add coins
  const earned = state.perClick;
  state.coins      += earned;
  state.totalCoins += earned;
  state.totalClicks++;

  haptic('impact');

  // Floating text at tap position
  const rect = DOM.tapBtn.getBoundingClientRect();
  const x = e.clientX ?? (rect.left + rect.width / 2);
  const y = e.clientY ?? (rect.top + rect.height / 2);
  spawnFloatText(x, y, `+${earned}`);

  // Press animation
  DOM.tapBtn.classList.add('pressed');
  setTimeout(() => DOM.tapBtn.classList.remove('pressed'), 120);

  updateUI();
}

// ============================================================
// 11. GAME LOOP (60ms tick)
// ============================================================

let lastTick = Date.now();
let saveAccum  = 0;
let playtimeAccum = 0;

function gameTick() {
  const now = Date.now();
  const dt  = (now - lastTick) / 1000; // seconds
  lastTick  = now;

  // Passive income
  if (state.autoPerSec > 0) {
    const gained = state.autoPerSec * dt;
    state.coins      += gained;
    state.totalCoins += gained;
  }

  // Energy regeneration
  if (state.energy < state.maxEnergy) {
    state.energy = Math.min(state.maxEnergy, state.energy + state.baseRegen * dt);
  }

  // Playtime tracking
  playtimeAccum += dt;
  if (playtimeAccum >= 1) {
    state.playtime += Math.floor(playtimeAccum);
    playtimeAccum -= Math.floor(playtimeAccum);
  }

  // Auto-save every 10 seconds
  saveAccum += dt;
  if (saveAccum >= 10) {
    saveState();
    saveAccum = 0;
  }

  updateUI();
  updateShopAffordability();
}

setInterval(gameTick, 100);

// ============================================================
// 12. UPGRADE SHOP
// ============================================================

function getUpgradeCost(upg) {
  const lvl = state.upgrades[upg.id] || 0;
  return Math.floor(upg.cost * Math.pow(1.8, lvl));
}

function renderUpgradeCard(upg) {
  const lvl  = state.upgrades[upg.id] || 0;
  const maxed = lvl >= upg.maxLevel;
  const cost  = getUpgradeCost(upg);
  const canAfford = !maxed && state.coins >= cost;

  const card = document.createElement('div');
  card.className = `upgrade-card${canAfford ? ' affordable' : ''}${maxed ? ' maxed' : ''}`;
  card.dataset.id = upg.id;

  card.innerHTML = `
    <div class="upgrade-icon">${upg.icon}</div>
    <div class="upgrade-info">
      <div class="upgrade-name">${upg.name}</div>
      <div class="upgrade-desc">${upg.desc}</div>
      <div class="upgrade-level">Уровень: <span>${lvl} / ${upg.maxLevel}</span></div>
    </div>
    <div class="upgrade-cost">
      ${maxed
        ? `<div class="cost-maxed">MAX</div>`
        : `<div class="cost-amount">🪙 ${formatNumber(cost)}</div>
           <div class="cost-label">цена</div>`}
    </div>
  `;

  if (!maxed) {
    card.addEventListener('pointerdown', () => purchaseUpgrade(upg, card), { passive: true });
  }

  return card;
}

function renderShop() {
  DOM.multiTapList.innerHTML  = '';
  DOM.autoClickList.innerHTML = '';
  DOM.energyUpList.innerHTML  = '';

  MULTI_TAP_UPGRADES.forEach(u => DOM.multiTapList.appendChild(renderUpgradeCard(u)));
  AUTO_UPGRADES.forEach(u      => DOM.autoClickList.appendChild(renderUpgradeCard(u)));
  ENERGY_UPGRADES.forEach(u    => DOM.energyUpList.appendChild(renderUpgradeCard(u)));
}

function purchaseUpgrade(upg, cardEl) {
  const lvl  = state.upgrades[upg.id] || 0;
  if (lvl >= upg.maxLevel) return;

  const cost = getUpgradeCost(upg);
  if (state.coins < cost) {
    haptic('error');
    showToast('❌ Недостаточно монет!');
    cardEl.style.animation = 'none';
    cardEl.offsetHeight; // reflow
    cardEl.style.animation = '';
    return;
  }

  state.coins -= cost;
  state.upgrades[upg.id] = lvl + 1;

  recalcStats();
  saveState();
  haptic('success');
  showToast(`✅ ${upg.name} — уровень ${lvl + 1}!`);
  renderShop();
  updateUI();
}

/** Update affordability classes without full re-render (called in game loop) */
let lastAffordabilityUpdate = 0;
function updateShopAffordability() {
  const now = Date.now();
  if (now - lastAffordabilityUpdate < 500) return; // throttle to 2/sec
  lastAffordabilityUpdate = now;

  const allUpgrades = [...MULTI_TAP_UPGRADES, ...AUTO_UPGRADES, ...ENERGY_UPGRADES];
  allUpgrades.forEach(upg => {
    const card = document.querySelector(`.upgrade-card[data-id="${upg.id}"]`);
    if (!card) return;
    const lvl   = state.upgrades[upg.id] || 0;
    const maxed = lvl >= upg.maxLevel;
    if (maxed) return;
    const cost = getUpgradeCost(upg);
    card.classList.toggle('affordable', state.coins >= cost);
  });
}

// ============================================================
// 13. NAVIGATION
// ============================================================

DOM.navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.screen;
    DOM.navBtns.forEach(b => b.classList.remove('active'));
    DOM.screens.forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`screen-${target}`)?.classList.add('active');

    if (target === 'shop') renderShop();
    haptic('light');
  });
});

// ============================================================
// 14. RESET BUTTON
// ============================================================

DOM.resetBtn.addEventListener('click', () => {
  if (TG) {
    TG.showConfirm('Сбросить весь прогресс? Это действие необратимо.', (confirmed) => {
      if (confirmed) resetGame();
    });
  } else {
    if (confirm('Сбросить весь прогресс? Это действие необратимо.')) resetGame();
  }
});

function resetGame() {
  state = createDefaultState();
  recalcStats();
  saveState();
  renderShop();
  updateUI();
  haptic('success');
  showToast('🔄 Прогресс сброшен!');
}

// ============================================================
// 15. PREVENT UNWANTED BROWSER BEHAVIORS
// ============================================================

// Prevent context menu on long press
document.addEventListener('contextmenu', e => e.preventDefault());

// Prevent zoom on double-tap (iOS)
let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
  const now = Date.now();
  if (now - lastTouchEnd < 300) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

// Prevent pull-to-refresh
document.addEventListener('touchmove', e => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

// ============================================================
// 16. INIT
// ============================================================

recalcStats();
renderShop();
updateUI();

// Announce to Telegram that app is ready
if (TG) {
  TG.ready();
}

console.log('🚀 CryptoTap initialized. State:', state);
