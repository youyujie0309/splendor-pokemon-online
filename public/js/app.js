import { COLORS, ALL_BALLS, BALL_INFO, AVATAR_CHOICES, renderBallSVG, avatarUrl } from './pokeballs.js';

// ==================== LOCAL STATE ====================
const state = {
  socket: null,
  connected: false,
  meta: null, // /api/meta -> cardById, evolvesFrom
  clientToken: getOrCreateToken(),
  profile: loadProfile(),
  lobbyRooms: [],
  room: null,
  myPlayerId: null,
  stagedBalls: {}, // { red: 1, ... }
  modalLocked: false,
  lastToastLogId: 0,
  lastRecordedGameKey: null,
  timerInterval: null,
  victoryShownForKey: null
};

const QUICK_EMOTES = [
  '⚡ 冲呀，去吧精灵球！',
  '😭 别抢我盯上的卡！',
  '✨ 好一手丝滑进化！',
  '🤔 稍等，让我算一下球',
  '🔥 超梦/传说归我了！',
  '👏 玩得漂亮，承让承让'
];

// ==================== STORAGE HELPERS ====================
function getOrCreateToken() {
  let tok = localStorage.getItem('sp_client_token');
  if (!tok) {
    tok = 't_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem('sp_client_token', tok);
  }
  return tok;
}

function loadProfile() {
  try {
    const raw = localStorage.getItem('sp_profile');
    if (raw) {
      const p = JSON.parse(raw);
      if (p.name) return p;
    }
  } catch {}
  const num = Math.floor(100 + Math.random() * 899);
  const p = { name: `训练家${num}`, avatar: 25 };
  localStorage.setItem('sp_profile', JSON.stringify(p));
  return p;
}

function saveProfile(name, avatar) {
  state.profile = { name: name.trim().slice(0, 14) || '训练家', avatar: Number(avatar) || 25 };
  localStorage.setItem('sp_profile', JSON.stringify(state.profile));
  renderProfileUI();
}

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem('sp_records') || '[]');
  } catch {
    return [];
  }
}

function saveMatchRecord(game) {
  const key = `${state.room?.code}_${game.turnNumber}_${game.winner?.id}`;
  if (state.lastRecordedGameKey === key) return;
  state.lastRecordedGameKey = key;
  const me = game.rankings?.find((r) => r.id === state.myPlayerId);
  if (!me) return;
  const rank = game.rankings.findIndex((r) => r.id === state.myPlayerId) + 1;
  const records = loadRecords();
  records.unshift({
    date: new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    roomCode: state.room?.code,
    playersCount: game.players.length,
    rank,
    points: me.points,
    evolutions: me.evolutions,
    winnerName: game.winner?.name || ''
  });
  localStorage.setItem('sp_records', JSON.stringify(records.slice(0, 30)));
}

// ==================== DOM REFS ====================
const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg, type = 'default', duration = 2600) {
  const wrap = $('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.25s ease';
    setTimeout(() => el.remove(), 260);
  }, duration);
}

async function copyText(text, successMsg) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    showToast(successMsg, 'success');
  } catch {
    showToast('复制失败，请手动长按复制', 'error');
  }
}

// ==================== MODAL SYSTEM ====================
function openModal(title, htmlContent, { locked = false, onMount = null } = {}) {
  state.modalLocked = locked;
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = htmlContent;
  $('modal-close').classList.toggle('hidden', locked);
  $('modal-backdrop').classList.remove('hidden');
  $('modal-sheet').classList.remove('hidden');
  if (typeof onMount === 'function') onMount($('modal-body'));
}

function closeModal(force = false) {
  if (state.modalLocked && !force) return;
  state.modalLocked = false;
  $('modal-backdrop').classList.add('hidden');
  $('modal-sheet').classList.add('hidden');
  $('modal-body').innerHTML = '';
}

// ==================== PAYMENT HELPER (CLIENT PREVIEW) ====================
function calcClientPayment(player, card) {
  if (!player || !card) return { canAfford: false, payment: {}, breakdown: [] };
  const bonuses = player.bonuses || {};
  const balls = player.balls || {};
  const payment = { red: 0, blue: 0, yellow: 0, pink: 0, black: 0, master: 0 };
  const breakdown = [];

  let canAfford = true;
  const reqMaster = card.cost.master || 0;
  let remMaster = balls.master || 0;

  if (reqMaster > 0) {
    const have = Math.min(remMaster, reqMaster);
    const short = reqMaster - have;
    if (short > 0) canAfford = false;
    payment.master += have;
    remMaster -= have;
    breakdown.push({ color: 'master', base: reqMaster, bonus: 0, net: reqMaster, payBall: have, payMaster: 0, short });
  }

  for (const c of COLORS) {
    const base = card.cost[c] || 0;
    if (base === 0) continue;
    const bonus = bonuses[c] || 0;
    const net = Math.max(0, base - bonus);
    const held = balls[c] || 0;
    const payBall = Math.min(held, net);
    const deficit = net - payBall;
    const payMaster = Math.min(remMaster, deficit);
    const short = deficit - payMaster;
    if (short > 0) canAfford = false;
    payment[c] = payBall;
    payment.master += payMaster;
    remMaster -= payMaster;
    breakdown.push({ color: c, base, bonus, net, payBall, payMaster, short });
  }

  return { canAfford, payment, breakdown };
}

// ==================== VIEW ROUTING ====================
function showView(name) {
  $('view-lobby').classList.toggle('hidden', name !== 'lobby');
  $('view-waiting').classList.toggle('hidden', name !== 'waiting');
  $('view-game').classList.toggle('hidden', name !== 'game');
}

function renderProfileUI() {
  $('profile-name-display').textContent = state.profile.name;
  $('profile-avatar-img').src = avatarUrl(state.profile.avatar);
}

// ==================== LOBBY RENDERING ====================
function renderLobby() {
  const list = state.lobbyRooms || [];
  $('lobby-count-badge').textContent = `${list.length} 个公开房间`;
  const container = $('lobby-room-list');

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <img src="/assets/pokemon/133.webp" alt="伊布" class="empty-sprite" />
        <p class="empty-title">暂无公开等待中的房间</p>
        <p class="empty-desc">点击下方「创建联机房间」开一桌，把链接发给微信好友即可直连开玩，或者先点「单机练习」试玩一局！</p>
      </div>
    `;
    return;
  }

  container.innerHTML = list
    .map((r) => {
      const isWaiting = r.status === 'WAITING';
      const isFull = r.playerCount >= r.maxPlayers;
      const timerTxt = r.turnTimer > 0 ? `${r.turnTimer}秒/回合` : '不限时';
      return `
        <article class="room-card">
          <div class="room-card-left">
            <div class="room-card-title">
              <span>房间 ${escapeHtml(r.code)}</span>
              <span class="room-status-tag ${isWaiting ? '' : 'playing'}">${isWaiting ? '等待中' : '对战中'}</span>
            </div>
            <div class="room-card-meta">
              房主：${escapeHtml(r.hostName)} · ${r.targetScore}分制 · ${timerTxt}
            </div>
          </div>
          <div class="room-card-right">
            <span class="room-seats-text">${r.playerCount} / ${r.maxPlayers} 人</span>
            <button
              class="btn btn-primary btn-xs btn-join-room"
              data-code="${escapeHtml(r.code)}"
              ${!isWaiting || isFull ? 'disabled' : ''}
            >
              ${!isWaiting ? '游戏中' : isFull ? '已满' : '加入'}
            </button>
          </div>
        </article>
      `;
    })
    .join('');

  container.querySelectorAll('.btn-join-room').forEach((btn) => {
    btn.addEventListener('click', () => joinRoomByCode(btn.dataset.code));
  });
}

// ==================== WAITING ROOM RENDERING ====================
function renderWaitingRoom() {
  const room = state.room;
  if (!room) return;
  const isHost = room.hostId === state.myPlayerId;

  $('waiting-room-code').textContent = room.code;
  $('waiting-seat-count').textContent = `${room.members.length}/${room.settings.maxPlayers}`;
  $('btn-add-bot').classList.toggle('hidden', !isHost || room.members.length >= room.settings.maxPlayers);

  // Render seats
  const seatsHtml = [];
  for (let i = 0; i < room.settings.maxPlayers; i++) {
    const m = room.members[i];
    if (m) {
      const canKick = isHost && m.id !== room.hostId;
      seatsHtml.push(`
        <div class="seat-card">
          <img class="seat-avatar" src="${avatarUrl(m.avatar)}" alt="${escapeHtml(m.name)}" />
          <div class="seat-info">
            <div class="seat-name">${escapeHtml(m.name)}${m.id === state.myPlayerId ? ' (我)' : ''}</div>
            <div class="seat-badges">
              ${m.isHost ? '<span class="tag-host">房主</span>' : ''}
              ${m.isBot ? '<span class="tag-bot">AI</span>' : ''}
              <span class="${m.connected ? 'tag-online' : 'tag-offline'}">● ${m.connected ? '在线' : '离线'}</span>
            </div>
          </div>
          ${canKick ? `<button class="seat-kick" data-kick="${escapeHtml(m.id)}" title="移除">✕</button>` : ''}
        </div>
      `);
    } else {
      seatsHtml.push(`<div class="seat-card empty">等待训练家加入...</div>`);
    }
  }
  $('waiting-seats').innerHTML = seatsHtml.join('');

  $('waiting-seats').querySelectorAll('[data-kick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.socket.emit('room:remove_member', { memberId: btn.dataset.kick }, (res) => {
        if (!res?.ok) showToast(res?.error || '移除失败', 'error');
      });
    });
  });

  // Render settings pills
  const syncSeg = (containerId, currentVal) => {
    const el = $(containerId);
    el.querySelectorAll('.seg-btn').forEach((btn) => {
      btn.classList.toggle('active', String(btn.dataset.val) === String(currentVal));
      btn.disabled = !isHost;
    });
  };
  syncSeg('set-max-players', room.settings.maxPlayers);
  syncSeg('set-target-score', room.settings.targetScore);
  syncSeg('set-turn-timer', room.settings.turnTimer);
  syncSeg('set-is-public', room.settings.isPublic);

  // Footer start button vs guest tip
  const startBtn = $('btn-start-game');
  startBtn.classList.toggle('hidden', !isHost);
  startBtn.disabled = room.members.length < 2;
  startBtn.textContent = room.members.length < 2 ? '至少需要 2 人开局（可加 AI）' : `开始对局 (${room.members.length}人)`;
  $('waiting-guest-tip').classList.toggle('hidden', isHost);
}

// ==================== GAMEPLAY RENDERING ====================
function renderGame() {
  const room = state.room;
  const game = room?.game;
  if (!room || !game) return;

  const me = game.players.find((p) => p.id === state.myPlayerId);
  const currentPlayer = game.players[game.currentPlayerIndex];
  const isMyTurn = currentPlayer?.id === state.myPlayerId && game.status === 'PLAYING';

  // Header
  $('game-room-badge').textContent = `房 ${room.code}`;
  $('game-round-badge').textContent = `第 ${game.roundNumber} 轮`;
  $('game-target-badge').textContent = `目标 ${game.targetScore}分`;
  $('final-round-banner').classList.toggle('hidden', !game.finalRoundTriggered || game.status === 'FINISHED');

  // Show latest log toast for opponents' actions
  const latestLog = game.logs[game.logs.length - 1];
  if (latestLog && latestLog.id > state.lastToastLogId) {
    if (state.lastToastLogId > 0 && latestLog.playerId !== state.myPlayerId) {
      showToast(latestLog.text, latestLog.type === 'evolve' ? 'success' : 'default', 2800);
    }
    state.lastToastLogId = latestLog.id;
  }

  // Players strip
  const memberMap = Object.fromEntries(room.members.map((m) => [m.id, m]));
  $('players-strip').innerHTML = game.players
    .map((p) => {
      const active = p.id === currentPlayer?.id && game.status === 'PLAYING';
      const isSelf = p.id === state.myPlayerId;
      const online = memberMap[p.id]?.connected !== false;
      const bonusHtml = COLORS.filter((c) => (p.bonuses[c] || 0) > 0)
        .map((c) => `<span class="mini-color-badge ${c}">${p.bonuses[c]}</span>`)
        .join('');
      return `
        <button class="player-chip ${active ? 'is-active' : ''} ${isSelf ? 'is-self' : ''}" data-inspect-player="${escapeHtml(p.id)}" type="button">
          <div class="pchip-top">
            <img class="pchip-avatar" src="${avatarUrl(p.avatar)}" alt="${escapeHtml(p.name)}" />
            <span class="pchip-name">${escapeHtml(p.name)}${isSelf ? '(我)' : ''}${!online ? '⚠️' : ''}</span>
            <span class="pchip-vp">${p.points}分</span>
          </div>
          <div class="pchip-stats">
            <div class="pchip-bonuses">${bonusHtml || '<span class="pchip-meta">暂无加成</span>'}</div>
            <span class="pchip-meta">球${p.ballCount} · 留${p.reservedCount}</span>
          </div>
        </button>
      `;
    })
    .join('');

  $('players-strip').querySelectorAll('[data-inspect-player]').forEach((btn) => {
    btn.addEventListener('click', () => openPlayerInspectModal(btn.dataset.inspectPlayer));
  });

  // Compute evolution targets I currently own (so board cards light up if I own their pre-evolution!)
  const myOwnedEvoTargets = new Set();
  if (me) {
    for (const c of me.caught) {
      if (c.evolvesTo) myOwnedEvoTargets.add(c.evolvesTo);
    }
  }

  // Render Special Row: Rare & Legendary
  renderSpecialSlot('slot-rare', 'rare', game.board.rare[0], game.deckCounts.rare, me);
  renderSpecialSlot('slot-legendary', 'legendary', game.board.legendary[0], game.deckCounts.legendary, me);

  // Render Standard Rows: 3, 2, 1
  for (const tier of [3, 2, 1]) {
    $(`deck-count-${tier}`).textContent = game.deckCounts[tier];
    const deckBtn = document.querySelector(`[data-deck-tier="${tier}"]`);
    if (deckBtn) {
      deckBtn.disabled = !isMyTurn || game.phase !== 'ACTION' || game.deckCounts[tier] === 0 || (me?.reservedCount || 0) >= 3;
    }

    const rowEl = $(`board-row-${tier}`);
    const cards = game.board[tier] || [];
    const html = [];
    for (let i = 0; i < 4; i++) {
      const card = cards[i];
      if (!card) {
        html.push('<div class="card-empty-slot"></div>');
      } else {
        html.push(renderBoardCardHTML(card, me, myOwnedEvoTargets.has(card.id)));
      }
    }
    rowEl.innerHTML = html.join('');

    rowEl.querySelectorAll('[data-card-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cid = btn.dataset.cardId;
        const found = cards.find((c) => c.id === cid);
        if (found) openCardActionModal(found, 'board');
      });
    });
  }

  // Turn status bar
  const statusBar = $('turn-status-bar');
  statusBar.classList.toggle('my-turn', isMyTurn);
  if (game.status === 'FINISHED') {
    $('turn-status-text').textContent = `🏆 对局已结束！冠军：${game.winner?.name} (${game.winner?.points}分)`;
  } else if (isMyTurn) {
    if (game.phase === 'DISCARD') {
      $('turn-status-text').textContent = '⚠️ 精灵球超过 10 个，请归还多余筹码';
    } else if (game.phase === 'EVOLVE') {
      $('turn-status-text').textContent = '✨ 满足进化条件！可免费进化 1 只宝可梦';
    } else {
      $('turn-status-text').textContent = '🎯 轮到你了！点精灵球拿取，或点宝可梦捕捉/预留';
    }
  } else {
    $('turn-status-text').textContent = `⏳ 等待 ${currentPlayer?.name} 行动...`;
  }

  // Update countdown timer
  updateTimerDisplay();

  // Render Poké Ball Supply Tray
  renderSupplyTray(game, isMyTurn && game.phase === 'ACTION');

  // Render Personal Dock
  if (me) {
    $('self-dock').classList.toggle('my-turn', isMyTurn);
    $('self-avatar').src = avatarUrl(me.avatar);
    $('self-name').textContent = me.name;
    $('self-vp').textContent = `${me.points} / ${game.targetScore} 分`;
    $('self-ball-limit').textContent = `精灵球 ${me.ballCount}/10 · 已进化 ${me.evolutionsCount}次`;
    $('my-team-count').textContent = me.caught.length;
    $('my-reserved-count').textContent = `${me.reservedCount}/3`;
    $('btn-open-my-team').classList.toggle('has-items', me.caught.length > 0);
    $('btn-open-my-reserved').classList.toggle('has-items', me.reservedCount > 0);

    $('self-resources').innerHTML = ALL_BALLS.map((c) => {
      const held = me.balls[c] || 0;
      const bonus = c === 'master' ? null : me.bonuses[c] || 0;
      return `
        <div class="res-cell">
          <div class="res-top">
            ${renderBallSVG(c, 18)}
            <span class="res-token-num">${held}</span>
          </div>
          ${
            c === 'master'
              ? `<span class="res-bonus-pill master">万能</span>`
              : `<span class="res-bonus-pill ${bonus > 0 ? c : 'zero'}">+${bonus}</span>`
          }
        </div>
      `;
    }).join('');
  }

  // Trigger mandatory phase modals automatically
  if (isMyTurn && game.phase === 'DISCARD') {
    openDiscardModal(me);
  } else if (isMyTurn && game.phase === 'EVOLVE') {
    openEvolutionModal(game.availableEvolutions);
  } else if (game.status === 'FINISHED') {
    saveMatchRecord(game);
    const vKey = `${room.code}_${game.turnNumber}`;
    if (state.victoryShownForKey !== vKey) {
      state.victoryShownForKey = vKey;
      openVictoryModal(game);
    }
  } else if (state.modalLocked) {
    closeModal(true);
  }
}

function renderSpecialSlot(containerId, tier, card, deckCount, me) {
  const el = $(containerId);
  const label = tier === 'rare' ? '稀有' : '传说';
  if (!card) {
    el.innerHTML = `<div class="special-empty">${label}牌堆已捕捉完毕</div>`;
    return;
  }
  const affordable = me ? calcClientPayment(me, card).canAfford : false;
  const costsHtml = renderCostDotsHTML(card, me);
  el.innerHTML = `
    <button class="special-card ${tier} ${affordable ? 'affordable' : ''}" type="button" data-special-card="${escapeHtml(card.id)}">
      <div class="special-art-wrap">
        <img class="special-art" src="${card.image}" alt="${escapeHtml(card.name)}" loading="lazy" />
      </div>
      <div class="special-body">
        <div class="special-top">
          <span class="special-tier-tag">${label} · 剩${deckCount + 1}</span>
          <span class="special-vp-bonus">
            <span class="special-vp">${card.points}</span>
            ${renderBallSVG(card.bonus, 15)}
            ${renderBallSVG(card.bonus, 15)}
          </span>
        </div>
        <div class="special-name">${escapeHtml(card.name)}</div>
        <div class="card-costs">${costsHtml}</div>
      </div>
    </button>
  `;
  el.querySelector('[data-special-card]').addEventListener('click', () => {
    openCardActionModal(card, 'board');
  });
}

function renderBoardCardHTML(card, me, isMyEvoTarget) {
  const affordable = me ? calcClientPayment(me, card).canAfford : false;
  const costsHtml = renderCostDotsHTML(card, me);
  const evoFromId = state.meta?.evolvesFrom?.[card.id];
  const evoFromName = evoFromId ? state.meta?.cardById?.[evoFromId]?.name : null;

  return `
    <button
      class="poke-card bonus-${card.bonus} ${affordable ? 'affordable' : ''} ${isMyEvoTarget ? 'evo-target' : ''}"
      type="button"
      data-card-id="${escapeHtml(card.id)}"
    >
      <div class="card-top">
        <span class="card-vp ${card.points === 0 ? 'zero' : ''}">${card.points}</span>
        <span class="card-bonus-wrap">${renderBallSVG(card.bonus, 17)}</span>
      </div>
      <div class="card-art-wrap">
        <img class="card-art" src="${card.image}" alt="${escapeHtml(card.name)}" loading="lazy" />
        <span class="card-name">${escapeHtml(card.name)}</span>
        ${isMyEvoTarget ? '<span class="evo-chip">✨可进化</span>' : evoFromName ? `<span class="evo-chip">↑${escapeHtml(evoFromName)}</span>` : ''}
      </div>
      <div class="card-costs">${costsHtml}</div>
    </button>
  `;
}

function renderCostDotsHTML(card, me) {
  const bonuses = me?.bonuses || {};
  const parts = [];
  if (card.cost.master) {
    parts.push(`<span class="cost-dot master" title="需大师球">M${card.cost.master > 1 ? card.cost.master : ''}</span>`);
  }
  for (const c of COLORS) {
    const amt = card.cost[c] || 0;
    if (amt <= 0) continue;
    const covered = (bonuses[c] || 0) >= amt;
    parts.push(`<span class="cost-dot ${c} ${covered ? 'covered' : ''}">${amt}</span>`);
  }
  return parts.join('');
}

// ==================== SUPPLY TRAY & STAGED TOKENS ====================
function renderSupplyTray(game, canInteract) {
  const container = $('supply-balls');
  if (!canInteract) {
    state.stagedBalls = {};
  }

  container.innerHTML = ALL_BALLS.map((c) => {
    const count = game.supply[c] || 0;
    const staged = state.stagedBalls[c] || 0;
    const isMaster = c === 'master';
    const disabled = !canInteract || isMaster || count === 0;
    return `
      <button
        class="supply-ball-btn ${staged > 0 ? 'selected' : ''} ${isMaster ? 'master-btn' : ''}"
        type="button"
        data-supply-color="${c}"
        ${disabled ? 'disabled' : ''}
      >
        ${staged > 0 ? `<span class="staged-badge">+${staged}</span>` : ''}
        ${renderBallSVG(c, 32)}
        <span class="supply-ball-count">${count}</span>
        <span class="supply-ball-name">${BALL_INFO[c].name}</span>
      </button>
    `;
  }).join('');

  container.querySelectorAll('[data-supply-color]').forEach((btn) => {
    const color = btn.dataset.supplyColor;
    if (color === 'master') return;
    btn.addEventListener('click', () => handleTapSupplyBall(color));
  });

  renderTokenConfirmBar(game, canInteract);
}

function handleTapSupplyBall(color) {
  const game = state.room?.game;
  if (!game) return;
  const supply = game.supply;
  const cur = state.stagedBalls[color] || 0;
  const entries = Object.entries(state.stagedBalls).filter(([, v]) => v > 0);

  if (cur === 2) {
    delete state.stagedBalls[color];
  } else if (cur === 1) {
    // If this is the only selected color and supply >= 4, bump to 2! Otherwise unselect.
    if (entries.length === 1 && supply[color] >= 4) {
      state.stagedBalls[color] = 2;
    } else {
      delete state.stagedBalls[color];
    }
  } else {
    // Not currently selected
    const hasDouble = entries.some(([, v]) => v === 2);
    if (hasDouble) {
      state.stagedBalls = { [color]: 1 };
    } else if (entries.length >= 3) {
      showToast('最多只能选择 3 种不同颜色的精灵球', 'default', 1600);
      return;
    } else {
      state.stagedBalls[color] = 1;
    }
  }

  renderSupplyTray(game, true);
}

function renderTokenConfirmBar(game, canInteract) {
  const bar = $('token-confirm-bar');
  const entries = Object.entries(state.stagedBalls).filter(([, v]) => v > 0);
  if (!canInteract || entries.length === 0) {
    bar.classList.add('hidden');
    return;
  }

  const availableColorsCount = COLORS.filter((c) => game.supply[c] > 0).length;
  const isDouble = entries.length === 1 && entries[0][1] === 2;
  const requiredDiff = Math.min(3, availableColorsCount);
  const isValid = isDouble || (entries.every(([, v]) => v === 1) && entries.length === requiredDiff);

  const desc = entries.map(([c, v]) => `${BALL_INFO[c].short}×${v}`).join(' + ');
  $('token-confirm-desc').textContent = isValid
    ? `准备拿取：${desc}`
    : `已选 ${desc}（再选 ${requiredDiff - entries.length} 种，或再点一次拿同色×2）`;

  $('btn-confirm-tokens').disabled = !isValid;
  bar.classList.remove('hidden');
}

function updateTimerDisplay() {
  const pill = $('turn-timer-pill');
  const game = state.room?.game;
  if (!game || game.status !== 'PLAYING' || !game.turnTimer) {
    pill.classList.add('hidden');
    return;
  }
  const elapsed = Math.floor((Date.now() - (game.turnStartedAt || Date.now())) / 1000);
  const left = Math.max(0, game.turnTimer - elapsed);
  pill.textContent = `${left}s`;
  pill.classList.toggle('urgent', left <= 8);
  pill.classList.remove('hidden');
}

// ==================== INTERACTIVE MODALS ====================
function openCardActionModal(card, source) {
  const game = state.room?.game;
  if (!game) return;
  const me = game.players.find((p) => p.id === state.myPlayerId);
  const isMyAction = game.currentPlayerId === state.myPlayerId && game.phase === 'ACTION' && game.status === 'PLAYING';
  const pay = calcClientPayment(me, card);

  const tierLabel =
    card.tier === 'rare'
      ? '稀有宝可梦 (双加成)'
      : card.tier === 'legendary'
        ? '传说宝可梦 (双加成)'
        : `Lv.${card.tier} 宝可梦`;

  // Cost breakdown rows
  const costRows = pay.breakdown
    .map((b) => {
      const info = BALL_INFO[b.color];
      const discountText = b.bonus > 0 ? `加成-${Math.min(b.base, b.bonus)}` : '';
      const payParts = [];
      if (b.payBall > 0) payParts.push(`付${b.payBall}${info.short}球`);
      if (b.payMaster > 0) payParts.push(`大师球代${b.payMaster}`);
      if (b.net === 0) payParts.push('免费抵扣');
      if (b.short > 0) payParts.push(`缺${b.short}`);
      return `
        <div class="cost-pill-lg">
          ${renderBallSVG(b.color, 18)}
          <span>需${b.base}</span>
          ${discountText ? `<span class="ok-mark">(${discountText})</span>` : ''}
          <span class="${b.short > 0 ? 'short-mark' : 'ok-mark'}">${payParts.join(' · ')}</span>
        </div>
      `;
    })
    .join('');

  // Evolution info box
  let evoHtml = '';
  const targetMeta = card.evolvesTo ? state.meta?.cardById?.[card.evolvesTo] : null;
  const prevId = state.meta?.evolvesFrom?.[card.id];
  const prevMeta = prevId ? state.meta?.cardById?.[prevId] : null;

  if (targetMeta && card.evolveReq) {
    const reqText = Object.entries(card.evolveReq)
      .map(([c, n]) => `${BALL_INFO[c].short}加成×${n}`)
      .join(' + ');
    evoHtml += `
      <div class="evo-box">
        <div class="evo-box-head">✨ 进化路线：可免费进化为【${escapeHtml(targetMeta.name)}】(+${targetMeta.points}分)</div>
        <div class="evo-chain-preview">
          <img class="evo-mini-sprite" src="${card.image}" alt="${escapeHtml(card.name)}" />
          <span>→</span>
          <img class="evo-mini-sprite" src="${targetMeta.image}" alt="${escapeHtml(targetMeta.name)}" />
          <span>条件：${reqText}（仅计永久图标）</span>
        </div>
      </div>
    `;
  } else if (prevMeta) {
    const reqText = Object.entries(prevMeta.evolveReq || {})
      .map(([c, n]) => `${BALL_INFO[c].short}加成×${n}`)
      .join(' + ');
    evoHtml += `
      <div class="evo-box">
        <div class="evo-box-head">✨ 进化来源：可由【${escapeHtml(prevMeta.name)}】免费进化</div>
        <div class="evo-chain-preview">
          <img class="evo-mini-sprite" src="${prevMeta.image}" alt="${escapeHtml(prevMeta.name)}" />
          <span>→</span>
          <img class="evo-mini-sprite" src="${card.image}" alt="${escapeHtml(card.name)}" />
          <span>条件：${reqText}</span>
        </div>
      </div>
    `;
  }

  const canReserve =
    isMyAction &&
    source === 'board' &&
    card.reservable &&
    (me?.reservedCount || 0) < 3;

  const html = `
    <div class="detail-hero">
      <img class="detail-art" src="${card.image}" alt="${escapeHtml(card.name)}" />
      <div class="detail-meta">
        <h4>${escapeHtml(card.name)}</h4>
        <div class="detail-badges">
          <span class="detail-badge">${tierLabel}</span>
          <span class="detail-badge">🏆 ${card.points} 分</span>
          <span class="detail-badge">
            提供 ${renderBallSVG(card.bonus, 15)} ×${card.bonusCount || 1}
          </span>
        </div>
      </div>
    </div>

    <div class="cost-breakdown">
      <h5>捕捉费用与你的实付预览</h5>
      <div class="cost-row-list">${costRows}</div>
    </div>

    ${evoHtml}

    <div class="sheet-actions">
      ${
        source === 'board' && card.reservable
          ? `<button id="act-reserve-card" class="btn btn-secondary" type="button" ${!canReserve ? 'disabled' : ''}>
              预留${game.supply.master > 0 ? ' (+1大师球)' : ''}
            </button>`
          : ''
      }
      <button id="act-catch-card" class="btn ${pay.canAfford ? 'btn-emerald' : 'btn-primary'}" type="button" ${!isMyAction || !pay.canAfford ? 'disabled' : ''}>
        ${!isMyAction ? '等待你的回合' : pay.canAfford ? '🎯 捕捉宝可梦' : '精灵球不足'}
      </button>
    </div>
  `;

  openModal(source === 'reserved' ? '预留宝可梦详情' : '宝可梦卡牌详情', html, {
    onMount: (body) => {
      body.querySelector('#act-catch-card')?.addEventListener('click', () => {
        sendGameAction({ type: 'catch_card', source, cardId: card.id }, () => closeModal(true));
      });
      body.querySelector('#act-reserve-card')?.addEventListener('click', () => {
        sendGameAction({ type: 'reserve_card', source: 'board', tier: card.tier, cardId: card.id }, () =>
          closeModal(true)
        );
      });
    }
  });
}

function openDiscardModal(me) {
  const mustDiscard = me.ballCount - 10;
  const picked = { red: 0, blue: 0, yellow: 0, pink: 0, black: 0, master: 0 };

  const renderContent = (body) => {
    const selectedSum = Object.values(picked).reduce((a, b) => a + b, 0);
    const rem = mustDiscard - selectedSum;
    body.innerHTML = `
      <p style="margin:0 0 8px;font-weight:700;color:var(--ink-secondary)">
        你当前持有 <strong style="color:var(--accent-red)">${me.ballCount}</strong> 个精灵球，上限为 10 个，请归还 <strong>${mustDiscard}</strong> 个。
      </p>
      <div class="discard-grid">
        ${ALL_BALLS.filter((c) => (me.balls[c] || 0) > 0)
          .map(
            (c) => `
          <div class="discard-cell">
            ${renderBallSVG(c, 30)}
            <span style="font-size:11px;font-weight:700">${BALL_INFO[c].name} (有${me.balls[c]})</span>
            <div class="discard-stepper">
              <button class="step-btn" data-dec="${c}" ${picked[c] <= 0 ? 'disabled' : ''}>−</button>
              <strong>${picked[c]}</strong>
              <button class="step-btn" data-inc="${c}" ${picked[c] >= me.balls[c] || rem <= 0 ? 'disabled' : ''}>+</button>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
      <button id="btn-confirm-discard" class="btn btn-primary btn-full" ${rem !== 0 ? 'disabled' : ''}>
        ${rem === 0 ? `确认归还 ${mustDiscard} 个精灵球` : `还需选择归还 ${rem} 个`}
      </button>
    `;

    body.querySelectorAll('[data-inc]').forEach((b) =>
      b.addEventListener('click', () => {
        picked[b.dataset.inc] += 1;
        renderContent(body);
      })
    );
    body.querySelectorAll('[data-dec]').forEach((b) =>
      b.addEventListener('click', () => {
        picked[b.dataset.dec] -= 1;
        renderContent(body);
      })
    );
    body.querySelector('#btn-confirm-discard')?.addEventListener('click', () => {
      sendGameAction({ type: 'discard_tokens', balls: picked }, () => closeModal(true));
    });
  };

  openModal('⚠️ 归还多余精灵球', '', { locked: true, onMount: renderContent });
}

function openEvolutionModal(evolutions) {
  const html = `
    <p style="margin:0 0 12px;font-size:13px;color:var(--ink-secondary)">
      恭喜！你的永久精灵球加成已满足进化条件，本回合可<strong>免费进化 1 只宝可梦</strong>（不消耗筹码，原形态将替换为新形态）：
    </p>
    ${evolutions
      .map(
        (evo, idx) => `
      <div class="evo-option-card">
        <div class="evo-pair">
          <div class="evo-mon">
            <img src="${evo.baseCard.image}" alt="${escapeHtml(evo.baseCard.name)}" />
            <span>${escapeHtml(evo.baseCard.name)}</span>
          </div>
          <span class="evo-arrow">→</span>
          <div class="evo-mon">
            <img src="${evo.targetCard.image}" alt="${escapeHtml(evo.targetCard.name)}" />
            <span>${escapeHtml(evo.targetCard.name)} (+${evo.targetCard.points}分)</span>
          </div>
        </div>
        <button class="btn btn-emerald btn-sm" data-evo-idx="${idx}" type="button">✨ 进化</button>
      </div>
    `
      )
      .join('')}
    <button id="btn-skip-evolve" class="btn btn-outline btn-full" type="button" style="margin-top:6px">
      本回合暂不进化
    </button>
  `;

  openModal('✨ 宝可梦进化时刻！', html, {
    locked: true,
    onMount: (body) => {
      body.querySelectorAll('[data-evo-idx]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const evo = evolutions[Number(btn.dataset.evoIdx)];
          sendGameAction(
            { type: 'evolve', baseCardId: evo.baseCardId, targetCardId: evo.targetCardId },
            () => closeModal(true)
          );
        });
      });
      body.querySelector('#btn-skip-evolve')?.addEventListener('click', () => {
        sendGameAction({ type: 'skip_evolve' }, () => closeModal(true));
      });
    }
  });
}

function openPlayerInspectModal(playerId) {
  const game = state.room?.game;
  if (!game) return;
  const p = game.players.find((x) => x.id === playerId);
  if (!p) return;
  const isSelf = p.id === state.myPlayerId;

  const ballsHtml = ALL_BALLS.map(
    (c) => `
    <div class="res-cell">
      <div class="res-top">${renderBallSVG(c, 16)}<strong>${p.balls[c] || 0}</strong></div>
      ${c === 'master' ? '<span class="res-bonus-pill master">万能</span>' : `<span class="res-bonus-pill ${p.bonuses[c] > 0 ? c : 'zero'}">+${p.bonuses[c] || 0}</span>`}
    </div>
  `
  ).join('');

  const caughtHtml =
    p.caught.length === 0
      ? '<p style="color:var(--ink-muted);text-align:center;padding:14px 0">暂未捕捉宝可梦</p>'
      : `<div class="team-grid">
          ${p.caught
            .map((c) => {
              const evoTarget = c.evolvesTo ? state.meta?.cardById?.[c.evolvesTo] : null;
              return `
                <div class="team-card">
                  <img src="${c.image}" alt="${escapeHtml(c.name)}" />
                  <div class="team-card-name">${escapeHtml(c.name)}</div>
                  <div class="team-card-sub">${c.points}分 · ${BALL_INFO[c.bonus].short}×${c.bonusCount || 1}</div>
                  ${evoTarget ? `<div class="team-card-sub" style="color:#b45309">→${escapeHtml(evoTarget.name)}</div>` : ''}
                </div>
              `;
            })
            .join('')}
        </div>`;

  openModal(`${p.name}${isSelf ? ' (我)' : ''} · ${p.points}分`, `
    <div style="margin-bottom:12px">
      <div class="self-resources">${ballsHtml}</div>
    </div>
    <h4 style="margin:0 0 8px;font-size:13px">已捕捉队伍 (${p.caught.length}只 · 进化${p.evolutionsCount}次)</h4>
    ${caughtHtml}
  `);
}

function openMyReservedModal() {
  const game = state.room?.game;
  const me = game?.players.find((p) => p.id === state.myPlayerId);
  if (!me) return;

  if (me.reserved.length === 0) {
    openModal('我的预留区 (0/3)', `
      <div class="empty-state" style="border:none;padding:24px 10px">
        <p class="empty-title">预留区为空</p>
        <p class="empty-desc">点击场上 Lv.1~Lv.3 的任意宝可梦选择「预留」，或点击左侧牌堆盲抽，即可锁定卡牌并获得 1 个万能大师球（最多预留 3 张）。</p>
      </div>
    `);
    return;
  }

  const html = `
    <p style="margin:0 0 10px;font-size:12px;color:var(--ink-secondary)">点击任意预留宝可梦即可查看费用并进行捕捉（其他玩家看不到你的预留卡）：</p>
    <div class="team-grid">
      ${me.reserved
        .map((r, idx) => {
          const c = r.card;
          const canCatch = calcClientPayment(me, c).canAfford;
          return `
            <button class="poke-card bonus-${c.bonus} ${canCatch ? 'affordable' : ''}" data-res-idx="${idx}" type="button">
              <div class="card-top">
                <span class="card-vp ${c.points === 0 ? 'zero' : ''}">${c.points}</span>
                ${renderBallSVG(c.bonus, 16)}
              </div>
              <div class="card-art-wrap">
                <img class="card-art" src="${c.image}" alt="${escapeHtml(c.name)}" />
                <span class="card-name">${escapeHtml(c.name)}</span>
              </div>
              <div class="card-costs">${renderCostDotsHTML(c, me)}</div>
            </button>
          `;
        })
        .join('')}
    </div>
  `;

  openModal(`我的预留区 (${me.reserved.length}/3)`, html, {
    onMount: (body) => {
      body.querySelectorAll('[data-res-idx]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const card = me.reserved[Number(btn.dataset.resIdx)].card;
          openCardActionModal(card, 'reserved');
        });
      });
    }
  });
}

function openVictoryModal(game) {
  const isHost = state.room?.hostId === state.myPlayerId;
  const medals = ['🥇', '🥈', '🥉', '4️⃣'];
  const rows = (game.rankings || [])
    .map(
      (r, i) => `
      <div class="podium-row ${i === 0 ? 'rank-1' : ''}">
        <span class="podium-rank">${medals[i] || i + 1}</span>
        <img class="seat-avatar" src="${avatarUrl(r.avatar)}" alt="${escapeHtml(r.name)}" />
        <div class="podium-info">
          <div style="font-weight:800;font-size:14px">${escapeHtml(r.name)}${r.id === state.myPlayerId ? ' (我)' : ''}</div>
          <div style="font-size:11.5px;color:var(--ink-secondary)">进化 ${r.evolutions} 次 · 队伍 ${r.caughtCount} 只</div>
        </div>
        <span class="podium-pts">${r.points} 分</span>
      </div>
    `
    )
    .join('');

  openModal('🏆 对局结算 · 冠军诞生！', `
    <div class="podium-list">${rows}</div>
    <div class="sheet-actions">
      <button id="btn-victory-leave" class="btn btn-secondary" type="button">返回大厅</button>
      ${
        isHost
          ? '<button id="btn-victory-rematch" class="btn btn-primary" type="button">再来一局</button>'
          : '<button id="btn-victory-close" class="btn btn-primary" type="button">查看终局牌面</button>'
      }
    </div>
  `, {
    onMount: (body) => {
      body.querySelector('#btn-victory-leave')?.addEventListener('click', () => {
        closeModal(true);
        leaveRoom();
      });
      body.querySelector('#btn-victory-rematch')?.addEventListener('click', () => {
        state.socket.emit('room:rematch', {}, (res) => {
          if (res?.ok) closeModal(true);
          else showToast(res?.error || '操作失败', 'error');
        });
      });
      body.querySelector('#btn-victory-close')?.addEventListener('click', () => closeModal(true));
    }
  });
}

function openProfileModal() {
  let pickedAvatar = state.profile.avatar;
  const html = `
    <div class="form-group">
      <label class="form-label" for="input-trainer-name">训练家昵称</label>
      <input id="input-trainer-name" class="text-input" type="text" maxlength="14" value="${escapeHtml(state.profile.name)}" placeholder="输入你的昵称" />
    </div>
    <div class="form-group">
      <span class="form-label">选择搭档头像</span>
      <div class="avatar-grid">
        ${AVATAR_CHOICES.map(
          (a) => `
          <button type="button" class="avatar-opt ${a.dexId === pickedAvatar ? 'selected' : ''}" data-avatar="${a.dexId}">
            <img src="${avatarUrl(a.dexId)}" alt="${a.name}" />
            <span>${a.name}</span>
          </button>
        `
        ).join('')}
      </div>
    </div>
    <button id="btn-save-profile" class="btn btn-primary btn-full" type="button">保存名片</button>
  `;

  openModal('编辑训练家名片', html, {
    onMount: (body) => {
      body.querySelectorAll('[data-avatar]').forEach((btn) => {
        btn.addEventListener('click', () => {
          pickedAvatar = Number(btn.dataset.avatar);
          body.querySelectorAll('[data-avatar]').forEach((x) => x.classList.toggle('selected', x === btn));
        });
      });
      body.querySelector('#btn-save-profile').addEventListener('click', () => {
        const name = body.querySelector('#input-trainer-name').value;
        saveProfile(name, pickedAvatar);
        closeModal(true);
        showToast('名片已更新', 'success', 1600);
      });
    }
  });
}

function openCreateRoomModal() {
  const cfg = { maxPlayers: 4, targetScore: 18, turnTimer: 0, isPublic: true };
  const html = `
    <div class="setting-row">
      <span class="setting-label">最多人数</span>
      <div class="seg-group" data-cfg="maxPlayers">
        <button type="button" class="seg-btn" data-val="2">2人</button>
        <button type="button" class="seg-btn" data-val="3">3人</button>
        <button type="button" class="seg-btn active" data-val="4">4人</button>
      </div>
    </div>
    <div class="setting-row">
      <span class="setting-label">胜利分数</span>
      <div class="seg-group" data-cfg="targetScore">
        <button type="button" class="seg-btn" data-val="15">15分</button>
        <button type="button" class="seg-btn active" data-val="18">18分</button>
        <button type="button" class="seg-btn" data-val="21">21分</button>
      </div>
    </div>
    <div class="setting-row">
      <span class="setting-label">回合限时</span>
      <div class="seg-group" data-cfg="turnTimer">
        <button type="button" class="seg-btn active" data-val="0">不限时</button>
        <button type="button" class="seg-btn" data-val="30">30秒</button>
        <button type="button" class="seg-btn" data-val="60">60秒</button>
      </div>
    </div>
    <div class="setting-row" style="margin-bottom:16px">
      <span class="setting-label">房间公开</span>
      <div class="seg-group" data-cfg="isPublic">
        <button type="button" class="seg-btn active" data-val="true">大厅可见</button>
        <button type="button" class="seg-btn" data-val="false">仅房间号</button>
      </div>
    </div>
    <button id="btn-confirm-create" class="btn btn-primary btn-full" type="button">立即创建房间</button>
  `;

  openModal('创建联机房间', html, {
    onMount: (body) => {
      body.querySelectorAll('.seg-group').forEach((grp) => {
        const key = grp.dataset.cfg;
        grp.querySelectorAll('.seg-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            grp.querySelectorAll('.seg-btn').forEach((x) => x.classList.remove('active'));
            btn.classList.add('active');
            const v = btn.dataset.val;
            cfg[key] = v === 'true' ? true : v === 'false' ? false : Number(v);
          });
        });
      });
      body.querySelector('#btn-confirm-create').addEventListener('click', () => {
        state.socket.emit(
          'room:create',
          {
            ...cfg,
            name: state.profile.name,
            avatar: state.profile.avatar,
            clientToken: state.clientToken
          },
          (res) => {
            if (!res?.ok) return showToast(res?.error || '创建失败', 'error');
            closeModal(true);
            enterRoomSuccess(res);
          }
        );
      });
    }
  });
}

function openJoinCodeModal() {
  openModal('输入房间号加入', `
    <div class="form-group">
      <label class="form-label" for="input-room-code">6 位数字房间号</label>
      <input id="input-room-code" class="text-input" type="tel" inputmode="numeric" maxlength="6" placeholder="例如：353145" />
    </div>
    <button id="btn-confirm-join" class="btn btn-primary btn-full" type="button">加入房间</button>
  `, {
    onMount: (body) => {
      const inp = body.querySelector('#input-room-code');
      setTimeout(() => inp.focus(), 80);
      const submit = () => {
        const code = inp.value.trim();
        if (!/^\d{6}$/.test(code)) return showToast('请输入 6 位数字房间号', 'error');
        closeModal(true);
        joinRoomByCode(code);
      };
      body.querySelector('#btn-confirm-join').addEventListener('click', submit);
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
      });
    }
  });
}

function openRulesModal() {
  openModal('📖 《璀璨宝石：宝可梦》规则速查', `
    <div class="rules-list">
      <div class="rule-block">
        <h4>1. 胜利目标（默认 18 分）</h4>
        任意玩家达到 <strong>18 分</strong> 时触发<strong>最后一轮</strong>，本轮所有玩家回合数一致后结束，总分最高者获胜！平局依次比<strong>进化次数多</strong>、<strong>拥有宝可梦卡少</strong>。
      </div>
      <div class="rule-block">
        <h4>2. 每回合 4 选 1 行动</h4>
        • <strong>拿 3 异色球</strong>：从供应区拿取 3 种不同颜色的精灵球各 1 个。<br/>
        • <strong>拿 2 同色球</strong>：当该颜色供应区剩余 <strong>≥ 4 个</strong> 时，拿取 2 个同色球。<br/>
        • <strong>预留宝可梦</strong>：预留 1 张场上 Lv.1~Lv.3 卡或盲抽牌堆顶（上限 3 张，他人不可见），若供应区有大师球则获得 <strong>1 个万能大师球</strong>。<br/>
        • <strong>捕捉宝可梦</strong>：用永久加成抵扣费用后，支付剩余精灵球筹码（大师球可替代任意颜色）捕捉场上或预留区的宝可梦。
      </div>
      <div class="rule-block">
        <h4>3. 筹码上限（10 个）</h4>
        行动结束后若持有精灵球总数超过 10 个，必须先归还多余的球至正好 10 个。
      </div>
      <div class="rule-block">
        <h4>4. ✨ 免费进化（每回合最多 1 次）</h4>
        归还多余球后，如果你已捕捉的宝可梦满足其卡片上的<strong>进化条件</strong>（仅计永久图标，不计手里筹码），且它的下一阶段正展示在<strong>场上</strong>或你的<strong>预留区</strong>，你可以将其<strong>免费进化</strong>！进化后原卡被替换（不再计分和提供图标），新进化体直接加入你的队伍。
      </div>
      <div class="rule-block">
        <h4>5. 稀有与传说宝可梦</h4>
        顶部展示区各有 1 张稀有与传说宝可梦，<strong>不可预留</strong>，且捕捉时<strong>必须消耗 1 个大师球</strong>；捕捉后提供 <strong>2 个永久精灵球图标</strong> 和丰厚分数！
      </div>
    </div>
  `);
}

function openRecordsModal() {
  const recs = loadRecords();
  if (recs.length === 0) {
    openModal('🏆 本地对局记录', `<div class="empty-state" style="border:none"><p class="empty-title">暂无对局记录</p><p class="empty-desc">完成一局游戏后，你的排名和得分会自动保存在这里。</p></div>`);
    return;
  }
  const wins = recs.filter((r) => r.rank === 1).length;
  openModal(`🏆 对局记录 (${wins}胜 / ${recs.length}局)`, `
    <div class="log-list">
      ${recs
        .map(
          (r) => `
        <div class="log-item ${r.rank === 1 ? 'victory' : ''}">
          <strong>${r.rank === 1 ? '🥇 冠军' : `第 ${r.rank} 名`}</strong> · ${r.points}分 · 进化${r.evolutions}次
          <div style="font-size:11px;color:var(--ink-secondary);margin-top:2px">${escapeHtml(r.date)} · ${r.playersCount}人局 · 冠军：${escapeHtml(r.winnerName)}</div>
        </div>
      `
        )
        .join('')}
    </div>
  `);
}

function openLogsModal() {
  const logs = [...(state.room?.game?.logs || [])].reverse();
  openModal('📜 本局行动记录', `
    <div class="log-list">
      ${logs.map((l) => `<div class="log-item ${l.type || ''}">${escapeHtml(l.text)}</div>`).join('')}
    </div>
  `);
}

function openEmoteModal() {
  openModal('💬 快捷发言', `
    <div class="emote-grid">
      ${QUICK_EMOTES.map((t, i) => `<button class="emote-btn" data-emote="${i}" type="button">${escapeHtml(t)}</button>`).join('')}
    </div>
  `, {
    onMount: (body) => {
      body.querySelectorAll('[data-emote]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const text = QUICK_EMOTES[Number(btn.dataset.emote)];
          state.socket.emit('room:emote', { text });
          closeModal(true);
        });
      });
    }
  });
}

// ==================== SOCKET ACTIONS ====================
function enterRoomSuccess(res) {
  state.myPlayerId = res.playerId;
  state.room = res.room;
  state.stagedBalls = {};
  state.lastToastLogId = 0;
  state.victoryShownForKey = null;
  sessionStorage.setItem('sp_active_room', res.code);

  // Sync URL query param without reload so friend can copy address bar too
  const url = new URL(window.location.href);
  url.searchParams.set('room', res.code);
  window.history.replaceState({}, '', url);

  syncViewToRoomState();
}

function syncViewToRoomState() {
  if (!state.room) {
    showView('lobby');
    renderLobby();
    return;
  }
  if (state.room.status === 'WAITING') {
    showView('waiting');
    renderWaitingRoom();
  } else {
    showView('game');
    renderGame();
  }
}

function joinRoomByCode(code) {
  state.socket.emit(
    'room:join',
    {
      code: String(code).trim(),
      name: state.profile.name,
      avatar: state.profile.avatar,
      clientToken: state.clientToken
    },
    (res) => {
      if (!res?.ok) {
        showToast(res?.error || '加入房间失败', 'error');
        sessionStorage.removeItem('sp_active_room');
        return;
      }
      enterRoomSuccess(res);
      if (res.reconnected) {
        showToast('已自动重连回到房间！', 'success');
      }
    }
  );
}

function leaveRoom() {
  state.socket.emit('room:leave', {}, () => {
    state.room = null;
    state.myPlayerId = null;
    state.stagedBalls = {};
    sessionStorage.removeItem('sp_active_room');
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url);
    closeModal(true);
    showView('lobby');
    renderLobby();
  });
}

function sendGameAction(action, onSuccess = null) {
  state.socket.emit('game:action', action, (res) => {
    if (!res?.ok) {
      showToast(res?.error || '操作无效', 'error');
      return;
    }
    state.stagedBalls = {};
    if (typeof onSuccess === 'function') onSuccess();
  });
}

// ==================== INITIALIZATION ====================
async function init() {
  $('brand-ball-icon').innerHTML = renderBallSVG('red', 34);
  renderProfileUI();

  // Fetch card metadata for evolution lookups
  try {
    const resp = await fetch('/api/meta');
    state.meta = await resp.json();
  } catch (e) {
    console.error('Failed to load /api/meta', e);
  }

  // Connect Socket.IO (works reliably on Chinese mobile / WeChat WebView with websocket + polling fallback)
  const socket = io({
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000
  });
  state.socket = socket;

  socket.on('connect', () => {
    state.connected = true;
    $('conn-banner').classList.add('hidden');

    // Auto-join from invite URL (?room=123456) or reconnect after page refresh
    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get('room');
    const savedRoom = sessionStorage.getItem('sp_active_room');
    const targetCode = state.room?.code || urlRoom || savedRoom;
    if (targetCode && /^\d{6}$/.test(targetCode)) {
      joinRoomByCode(targetCode);
    }
  });

  socket.on('disconnect', () => {
    state.connected = false;
    $('conn-banner').classList.remove('hidden');
    $('conn-banner').textContent = '网络连接暂时中断，正在自动重连...';
  });

  socket.on('lobby:update', (rooms) => {
    state.lobbyRooms = rooms || [];
    if (!state.room) renderLobby();
  });

  socket.on('room:state', (room) => {
    state.room = room;
    syncViewToRoomState();
  });

  socket.on('room:kicked', ({ reason } = {}) => {
    showToast(reason || '你已离开房间', 'error');
    state.room = null;
    state.myPlayerId = null;
    sessionStorage.removeItem('sp_active_room');
    showView('lobby');
    renderLobby();
  });

  socket.on('room:emote', ({ playerName, text }) => {
    showToast(`${playerName}：${text}`, 'emote', 3000);
  });

  // Bind UI events
  $('btn-open-rules').addEventListener('click', openRulesModal);
  $('btn-waiting-rules').addEventListener('click', openRulesModal);
  $('btn-game-rules').addEventListener('click', openRulesModal);
  $('btn-open-records').addEventListener('click', openRecordsModal);
  $('btn-edit-profile').addEventListener('click', openProfileModal);
  $('btn-create-room-open').addEventListener('click', openCreateRoomModal);
  $('btn-join-code-open').addEventListener('click', openJoinCodeModal);
  $('btn-refresh-lobby').addEventListener('click', () => {
    socket.emit('lobby:refresh');
    showToast('已刷新房间列表', 'default', 1200);
  });

  $('btn-quick-practice').addEventListener('click', () => {
    socket.emit(
      'room:practice',
      { name: state.profile.name, avatar: state.profile.avatar, clientToken: state.clientToken, botCount: 1 },
      (res) => {
        if (!res?.ok) return showToast(res?.error || '无法开始练习', 'error');
        enterRoomSuccess(res);
      }
    );
  });

  // Waiting room buttons
  $('btn-leave-waiting').addEventListener('click', leaveRoom);
  $('btn-copy-code').addEventListener('click', () => {
    if (state.room) copyText(state.room.code, `已复制房间号：${state.room.code}`);
  });
  $('btn-copy-link').addEventListener('click', () => {
    if (!state.room) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${state.room.code}`;
    copyText(shareUrl, '已复制邀请链接，发给微信好友即可加入！');
  });
  $('btn-add-bot').addEventListener('click', () => {
    socket.emit('room:add_bot', {}, (res) => {
      if (!res?.ok) showToast(res?.error || '添加失败', 'error');
    });
  });
  $('btn-start-game').addEventListener('click', () => {
    socket.emit('room:start', {}, (res) => {
      if (!res?.ok) showToast(res?.error || '无法开始', 'error');
    });
  });

  // Waiting room settings segments
  const bindSettingSeg = (id, key) => {
    $(id).querySelectorAll('.seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const raw = btn.dataset.val;
        const val = raw === 'true' ? true : raw === 'false' ? false : Number(raw);
        socket.emit('room:settings', { [key]: val }, (res) => {
          if (!res?.ok) showToast(res?.error || '修改失败', 'error');
        });
      });
    });
  };
  bindSettingSeg('set-max-players', 'maxPlayers');
  bindSettingSeg('set-target-score', 'targetScore');
  bindSettingSeg('set-turn-timer', 'turnTimer');
  bindSettingSeg('set-is-public', 'isPublic');

  // In-game buttons
  $('btn-game-exit').addEventListener('click', () => {
    if (state.room?.game?.status === 'FINISHED') {
      leaveRoom();
      return;
    }
    openModal('退出当前对局？', `
      <p style="margin:0 0 14px;color:var(--ink-secondary);font-size:13px">
        退出后将返回房间大厅。如果只是想暂时切屏，直接关闭页面即可，稍后重新点开链接会自动重连回当前座位！
      </p>
      <div class="sheet-actions">
        <button id="btn-stay" class="btn btn-secondary" type="button">继续对局</button>
        <button id="btn-confirm-exit" class="btn btn-danger" type="button">确认退出</button>
      </div>
    `, {
      onMount: (body) => {
        body.querySelector('#btn-stay').addEventListener('click', () => closeModal(true));
        body.querySelector('#btn-confirm-exit').addEventListener('click', leaveRoom);
      }
    });
  });

  $('btn-game-log').addEventListener('click', openLogsModal);
  $('btn-game-emote').addEventListener('click', openEmoteModal);
  $('btn-open-my-team').addEventListener('click', () => openPlayerInspectModal(state.myPlayerId));
  $('btn-open-my-reserved').addEventListener('click', openMyReservedModal);

  $('btn-cancel-tokens').addEventListener('click', () => {
    state.stagedBalls = {};
    if (state.room?.game) renderSupplyTray(state.room.game, true);
  });
  $('btn-confirm-tokens').addEventListener('click', () => {
    sendGameAction({ type: 'take_tokens', balls: { ...state.stagedBalls } });
  });

  // Blind-reserve from deck piles
  document.querySelectorAll('[data-deck-tier]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tier = Number(btn.dataset.deckTier);
      const game = state.room?.game;
      if (!game) return;
      openModal(`盲抽预留 Lv.${tier} 宝可梦`, `
        <p style="margin:0 0 14px;font-size:13px;color:var(--ink-secondary)">
          确定从 <strong>Lv.${tier} 牌堆顶</strong>盲抽 1 张宝可梦卡放入你的私密预留区${game.supply.master > 0 ? '，并获得 <strong>1 个大师球</strong>' : ''}吗？
        </p>
        <div class="sheet-actions">
          <button id="btn-cancel-blind" class="btn btn-secondary" type="button">取消</button>
          <button id="btn-ok-blind" class="btn btn-primary" type="button">确认盲抽预留</button>
        </div>
      `, {
        onMount: (body) => {
          body.querySelector('#btn-cancel-blind').addEventListener('click', () => closeModal(true));
          body.querySelector('#btn-ok-blind').addEventListener('click', () => {
            sendGameAction({ type: 'reserve_card', source: 'deck', tier }, () => closeModal(true));
          });
        }
      });
    });
  });

  // Modal dismiss
  $('modal-close').addEventListener('click', () => closeModal(false));
  $('modal-backdrop').addEventListener('click', () => closeModal(false));

  // Turn timer tick every second
  state.timerInterval = setInterval(updateTimerDisplay, 1000);
}

init();
