const { COLORS, ALL_BALLS, CARDS, CARD_BY_ID } = require('../shared/cards');

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function emptyBalls() {
  return { red: 0, blue: 0, yellow: 0, pink: 0, black: 0, master: 0 };
}

function totalBalls(balls) {
  return ALL_BALLS.reduce((sum, c) => sum + (balls[c] || 0), 0);
}

function getPlayerBonuses(player) {
  const bonuses = { red: 0, blue: 0, yellow: 0, pink: 0, black: 0 };
  for (const c of player.caught) {
    bonuses[c.bonus] = (bonuses[c.bonus] || 0) + (c.bonusCount || 1);
  }
  return bonuses;
}

function getPlayerPoints(player) {
  return player.caught.reduce((sum, c) => sum + c.points, 0);
}

/**
 * Calculates exact token payment needed for a player to catch a card.
 * Returns { canAfford, payment, shortfall }
 */
function calculatePayment(player, card) {
  const bonuses = getPlayerBonuses(player);
  const payment = emptyBalls();

  // Rare/Legendary cards explicitly require Master Ball(s) which cannot be discounted
  const requiredMaster = card.cost.master || 0;
  if ((player.balls.master || 0) < requiredMaster) {
    return { canAfford: false, payment, missingMaster: requiredMaster - (player.balls.master || 0) };
  }
  payment.master = requiredMaster;
  let remainingMaster = (player.balls.master || 0) - requiredMaster;

  for (const c of COLORS) {
    const costC = card.cost[c] || 0;
    const net = Math.max(0, costC - (bonuses[c] || 0));
    const held = player.balls[c] || 0;
    if (held >= net) {
      payment[c] = net;
    } else {
      payment[c] = held;
      const deficit = net - held;
      if (remainingMaster >= deficit) {
        payment.master += deficit;
        remainingMaster -= deficit;
      } else {
        return { canAfford: false, payment };
      }
    }
  }

  return { canAfford: true, payment };
}

function findAvailableEvolutions(game, player) {
  const bonuses = getPlayerBonuses(player);
  const options = [];

  for (const baseCard of player.caught) {
    if (!baseCard.evolvesTo || !baseCard.evolveReq) continue;

    // Check permanent bonus requirement (tokens do NOT count for evolution!)
    let meetsReq = true;
    for (const [color, reqCount] of Object.entries(baseCard.evolveReq)) {
      if ((bonuses[color] || 0) < reqCount) {
        meetsReq = false;
        break;
      }
    }
    if (!meetsReq) continue;

    const targetId = baseCard.evolvesTo;
    const targetCardMeta = CARD_BY_ID[targetId];
    if (!targetCardMeta) continue;

    // Look on the face-up board
    const tierRow = game.board[targetCardMeta.tier] || [];
    const onBoard = tierRow.find((c) => c && c.id === targetId);
    if (onBoard) {
      options.push({
        baseCardId: baseCard.id,
        targetCardId: onBoard.id,
        source: 'board',
        tier: targetCardMeta.tier,
        baseCard,
        targetCard: onBoard
      });
      continue;
    }

    // Look in player's own reserved hand
    const inReserved = player.reserved.find((r) => r.card.id === targetId);
    if (inReserved) {
      options.push({
        baseCardId: baseCard.id,
        targetCardId: inReserved.card.id,
        source: 'reserved',
        tier: targetCardMeta.tier,
        baseCard,
        targetCard: inReserved.card
      });
    }
  }

  return options;
}

function createGame(playersConfig, options = {}) {
  const playerCount = playersConfig.length;
  if (playerCount < 2 || playerCount > 4) {
    throw new Error('游戏人数必须为 2 至 4 人');
  }

  const baseCount = playerCount === 2 ? 4 : playerCount === 3 ? 5 : 7;
  const supply = {
    red: baseCount,
    blue: baseCount,
    yellow: baseCount,
    pink: baseCount,
    black: baseCount,
    master: 5
  };

  const decks = {
    1: shuffle(CARDS.filter((c) => c.tier === 1)),
    2: shuffle(CARDS.filter((c) => c.tier === 2)),
    3: shuffle(CARDS.filter((c) => c.tier === 3)),
    rare: shuffle(CARDS.filter((c) => c.tier === 'rare')),
    legendary: shuffle(CARDS.filter((c) => c.tier === 'legendary'))
  };

  const board = {
    1: decks[1].splice(0, 4),
    2: decks[2].splice(0, 4),
    3: decks[3].splice(0, 4),
    rare: decks.rare.splice(0, 1),
    legendary: decks.legendary.splice(0, 1)
  };

  const players = playersConfig.map((p, idx) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar || 25,
    isBot: Boolean(p.isBot),
    seatIndex: idx,
    balls: emptyBalls(),
    caught: [],
    evolvedHistory: [],
    reserved: [] // { card, isBlind }
  }));

  const targetScore = Number(options.targetScore) || 18;
  const turnTimer = Number(options.turnTimer) || 0; // 0 = unlimited

  const game = {
    status: 'PLAYING',
    phase: 'ACTION', // 'ACTION' | 'DISCARD' | 'EVOLVE' | 'FINISHED'
    targetScore,
    turnTimer,
    roundNumber: 1,
    turnNumber: 1,
    currentPlayerIndex: 0,
    supply,
    decks,
    board,
    players,
    availableEvolutions: [],
    finalRoundTriggered: false,
    finalRoundTriggerPlayer: null,
    rankings: null,
    winner: null,
    lastAction: null,
    logs: [
      {
        id: 1,
        time: Date.now(),
        text: `对局开始！目标 ${targetScore} 分，先手训练家：${players[0].name}`,
        type: 'system'
      }
    ],
    turnStartedAt: Date.now()
  };

  return game;
}

function addLog(game, text, type = 'action', playerId = null) {
  const id = (game.logs[game.logs.length - 1]?.id || 0) + 1;
  game.logs.push({ id, time: Date.now(), text, type, playerId });
  if (game.logs.length > 80) {
    game.logs = game.logs.slice(-80);
  }
}

function replenishSlot(game, tier, slotIndex) {
  const deck = game.decks[tier];
  if (deck && deck.length > 0) {
    game.board[tier][slotIndex] = deck.shift();
  } else {
    game.board[tier].splice(slotIndex, 1);
  }
}

function advanceAfterAction(game) {
  const player = game.players[game.currentPlayerIndex];
  const heldCount = totalBalls(player.balls);

  if (heldCount > 10) {
    game.phase = 'DISCARD';
    game.availableEvolutions = [];
    return;
  }

  enterEvolutionOrFinishTurn(game);
}

function enterEvolutionOrFinishTurn(game) {
  const player = game.players[game.currentPlayerIndex];
  const evos = findAvailableEvolutions(game, player);
  if (evos.length > 0) {
    game.phase = 'EVOLVE';
    game.availableEvolutions = evos;
    return;
  }
  finishTurn(game);
}

function finishTurn(game) {
  const player = game.players[game.currentPlayerIndex];
  const points = getPlayerPoints(player);

  if (!game.finalRoundTriggered && points >= game.targetScore) {
    game.finalRoundTriggered = true;
    game.finalRoundTriggerPlayer = player.name;
    addLog(game, `⚡ ${player.name} 达到 ${points} 分，触发最后一轮！`, 'milestone', player.id);
  }

  const nextIndex = (game.currentPlayerIndex + 1) % game.players.length;
  game.availableEvolutions = [];

  if (game.finalRoundTriggered && nextIndex === 0) {
    // End of final round -> compute rankings
    const rankings = game.players
      .map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isBot: p.isBot,
        points: getPlayerPoints(p),
        evolutions: p.evolvedHistory.length,
        caughtCount: p.caught.length,
        bonuses: getPlayerBonuses(p),
        caught: p.caught
      }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.evolutions !== a.evolutions) return b.evolutions - a.evolutions;
        return a.caughtCount - b.caughtCount;
      });

    game.status = 'FINISHED';
    game.phase = 'FINISHED';
    game.rankings = rankings;
    game.winner = rankings[0];
    addLog(game, `🏆 对局结束！冠军是 ${rankings[0].name}（${rankings[0].points} 分）！`, 'victory', rankings[0].id);
    return;
  }

  if (nextIndex === 0) {
    game.roundNumber += 1;
  }
  game.currentPlayerIndex = nextIndex;
  game.turnNumber += 1;
  game.phase = 'ACTION';
  game.turnStartedAt = Date.now();
}

function performAction(game, playerId, action) {
  if (game.status !== 'PLAYING') {
    return { ok: false, error: '对局已结束' };
  }

  const currentPlayer = game.players[game.currentPlayerIndex];
  if (currentPlayer.id !== playerId) {
    return { ok: false, error: '当前不是你的回合' };
  }

  // ---- PHASE: DISCARD ----
  if (game.phase === 'DISCARD') {
    if (action.type !== 'discard_tokens') {
      return { ok: false, error: '当前持有超过 10 个精灵球，请先归还多余的精灵球' };
    }
    const discard = action.balls || {};
    const currentTotal = totalBalls(currentPlayer.balls);
    const mustDiscard = currentTotal - 10;
    let discardTotal = 0;

    for (const c of ALL_BALLS) {
      const qty = Number(discard[c] || 0);
      if (!Number.isInteger(qty) || qty < 0) {
        return { ok: false, error: '归还数量无效' };
      }
      if (qty > (currentPlayer.balls[c] || 0)) {
        return { ok: false, error: '归还数量超过持有数量' };
      }
      discardTotal += qty;
    }

    if (discardTotal !== mustDiscard) {
      return { ok: false, error: `需要正好归还 ${mustDiscard} 个精灵球` };
    }

    for (const c of ALL_BALLS) {
      const qty = Number(discard[c] || 0);
      if (qty > 0) {
        currentPlayer.balls[c] -= qty;
        game.supply[c] += qty;
      }
    }

    game.lastAction = { playerId, type: 'discard_tokens', balls: discard };
    addLog(game, `${currentPlayer.name} 归还了 ${mustDiscard} 个超出上限的精灵球`, 'info', playerId);
    enterEvolutionOrFinishTurn(game);
    return { ok: true };
  }

  // ---- PHASE: EVOLVE ----
  if (game.phase === 'EVOLVE') {
    if (action.type === 'skip_evolve') {
      game.lastAction = { playerId, type: 'skip_evolve' };
      addLog(game, `${currentPlayer.name} 选择本回合暂不进化`, 'info', playerId);
      finishTurn(game);
      return { ok: true };
    }

    if (action.type !== 'evolve') {
      return { ok: false, error: '当前处于进化阶段，请选择一只宝可梦进化或跳过' };
    }

    const chosen = game.availableEvolutions.find(
      (e) => e.baseCardId === action.baseCardId && e.targetCardId === action.targetCardId
    );
    if (!chosen) {
      return { ok: false, error: '该进化选项不可用' };
    }

    // Remove base card from caught -> archive in evolvedHistory
    const baseIdx = currentPlayer.caught.findIndex((c) => c.id === chosen.baseCardId);
    if (baseIdx === -1) return { ok: false, error: '未找到基础宝可梦' };
    const [removedBase] = currentPlayer.caught.splice(baseIdx, 1);

    // Acquire target card from board or reserved
    let acquired = null;
    if (chosen.source === 'board') {
      const row = game.board[chosen.tier];
      const idx = row.findIndex((c) => c && c.id === chosen.targetCardId);
      if (idx === -1) return { ok: false, error: '场上未找到目标进化宝可梦' };
      acquired = row[idx];
      replenishSlot(game, chosen.tier, idx);
    } else {
      const rIdx = currentPlayer.reserved.findIndex((r) => r.card.id === chosen.targetCardId);
      if (rIdx === -1) return { ok: false, error: '预留区未找到目标进化宝可梦' };
      acquired = currentPlayer.reserved.splice(rIdx, 1)[0].card;
    }

    currentPlayer.caught.push(acquired);
    currentPlayer.evolvedHistory.push({
      fromCard: removedBase,
      toCardId: acquired.id,
      turn: game.turnNumber
    });

    game.lastAction = {
      playerId,
      type: 'evolve',
      fromName: removedBase.name,
      toName: acquired.name,
      toCard: acquired
    };
    addLog(
      game,
      `✨ ${currentPlayer.name} 将【${removedBase.name}】免费进化为【${acquired.name}】（+${acquired.points}分）！`,
      'evolve',
      playerId
    );
    finishTurn(game);
    return { ok: true };
  }

  // ---- PHASE: ACTION ----
  if (action.type === 'take_tokens') {
    const balls = action.balls || {};
    if ((balls.master || 0) > 0) {
      return { ok: false, error: '不能直接拿取大师球，只能通过预留卡牌获得' };
    }

    const picked = [];
    for (const c of COLORS) {
      const qty = Number(balls[c] || 0);
      if (!Number.isInteger(qty) || qty < 0) {
        return { ok: false, error: '精灵球数量无效' };
      }
      if (qty > 0) picked.push({ color: c, qty });
    }

    if (picked.length === 0) {
      return { ok: false, error: '请选择要拿取的精灵球' };
    }

    const totalPicked = picked.reduce((s, p) => s + p.qty, 0);
    const availableColors = COLORS.filter((c) => game.supply[c] > 0);

    if (picked.length === 1 && picked[0].qty === 2) {
      // Take 2 of the same color
      const c = picked[0].color;
      if (game.supply[c] < 4) {
        return { ok: false, error: '供应区该颜色精灵球不足 4 个，不能拿取 2 个同色' };
      }
      game.supply[c] -= 2;
      currentPlayer.balls[c] += 2;
    } else {
      // Take 3 different colors (or all available if < 3 colors left)
      if (picked.some((p) => p.qty !== 1)) {
        return { ok: false, error: '只能拿取 3 种不同颜色各 1 个，或同色 2 个' };
      }
      const maxAllowed = Math.min(3, availableColors.length);
      if (totalPicked > maxAllowed) {
        return { ok: false, error: '所选精灵球超过允许数量' };
      }
      if (totalPicked < maxAllowed) {
        return { ok: false, error: `请选择 ${maxAllowed} 种不同颜色的精灵球` };
      }
      for (const p of picked) {
        if (game.supply[p.color] < 1) {
          return { ok: false, error: '所选颜色精灵球已空' };
        }
      }
      for (const p of picked) {
        game.supply[p.color] -= 1;
        currentPlayer.balls[p.color] += 1;
      }
    }

    const ballDesc = picked
      .map((p) => `${p.qty}×${{ red: '红', blue: '蓝', yellow: '黄', pink: '粉', black: '黑' }[p.color]}球`)
      .join('、');
    game.lastAction = { playerId, type: 'take_tokens', balls };
    addLog(game, `${currentPlayer.name} 拿取了 ${ballDesc}`, 'tokens', playerId);
    advanceAfterAction(game);
    return { ok: true };
  }

  if (action.type === 'reserve_card') {
    if (currentPlayer.reserved.length >= 3) {
      return { ok: false, error: '预留区已满（最多 3 张）' };
    }

    const tier = action.tier;
    if (tier === 'rare' || tier === 'legendary') {
      return { ok: false, error: '稀有与传说宝可梦不可预留' };
    }
    if (![1, 2, 3].includes(tier)) {
      return { ok: false, error: '无效的卡牌等级' };
    }

    let reservedCard = null;
    let isBlind = false;

    if (action.source === 'deck') {
      if (!game.decks[tier] || game.decks[tier].length === 0) {
        return { ok: false, error: '该等级牌堆已空' };
      }
      reservedCard = game.decks[tier].shift();
      isBlind = true;
    } else {
      const row = game.board[tier] || [];
      const idx = row.findIndex((c) => c && c.id === action.cardId);
      if (idx === -1) {
        return { ok: false, error: '场上未找到该宝可梦卡' };
      }
      reservedCard = row[idx];
      replenishSlot(game, tier, idx);
    }

    currentPlayer.reserved.push({ card: reservedCard, isBlind });
    let gotMaster = false;
    if (game.supply.master > 0) {
      game.supply.master -= 1;
      currentPlayer.balls.master += 1;
      gotMaster = true;
    }

    game.lastAction = {
      playerId,
      type: 'reserve_card',
      tier,
      isBlind,
      cardName: isBlind ? `Lv.${tier} 盲抽卡` : reservedCard.name,
      gotMaster
    };
    addLog(
      game,
      `${currentPlayer.name} 预留了 ${isBlind ? `1 张 Lv.${tier} 暗牌` : `【${reservedCard.name}】`}${gotMaster ? ' 并获得 1 个大师球' : ''}`,
      'reserve',
      playerId
    );
    advanceAfterAction(game);
    return { ok: true };
  }

  if (action.type === 'catch_card') {
    let targetCard = null;
    let boardTier = null;
    let boardIdx = -1;
    let reservedIdx = -1;

    if (action.source === 'reserved') {
      reservedIdx = currentPlayer.reserved.findIndex((r) => r.card.id === action.cardId);
      if (reservedIdx === -1) {
        return { ok: false, error: '预留区未找到该宝可梦卡' };
      }
      targetCard = currentPlayer.reserved[reservedIdx].card;
    } else {
      for (const tier of [1, 2, 3, 'rare', 'legendary']) {
        const idx = (game.board[tier] || []).findIndex((c) => c && c.id === action.cardId);
        if (idx !== -1) {
          boardTier = tier;
          boardIdx = idx;
          targetCard = game.board[tier][idx];
          break;
        }
      }
      if (!targetCard) {
        return { ok: false, error: '场上未找到该宝可梦卡' };
      }
    }

    const pay = calculatePayment(currentPlayer, targetCard);
    if (!pay.canAfford) {
      return { ok: false, error: '精灵球不足，无法捕捉该宝可梦' };
    }

    // Pay tokens back to supply
    for (const c of ALL_BALLS) {
      if (pay.payment[c] > 0) {
        currentPlayer.balls[c] -= pay.payment[c];
        game.supply[c] += pay.payment[c];
      }
    }

    // Move card to player's caught collection
    if (action.source === 'reserved') {
      currentPlayer.reserved.splice(reservedIdx, 1);
    } else {
      replenishSlot(game, boardTier, boardIdx);
    }
    currentPlayer.caught.push(targetCard);

    game.lastAction = {
      playerId,
      type: 'catch_card',
      card: targetCard,
      fromReserved: action.source === 'reserved'
    };
    const ptsText = targetCard.points > 0 ? ` (+${targetCard.points}分)` : '';
    addLog(
      game,
      `🎯 ${currentPlayer.name} 捕捉了【${targetCard.name}】${ptsText}！`,
      'catch',
      playerId
    );
    advanceAfterAction(game);
    return { ok: true };
  }

  if (action.type === 'pass_turn') {
    // Only allow pass if player literally has no legal moves (edge case)
    const hasSupplyColor = COLORS.some((c) => game.supply[c] > 0);
    const canReserveAny =
      currentPlayer.reserved.length < 3 &&
      [1, 2, 3].some((t) => game.board[t].length > 0 || game.decks[t].length > 0);
    const canCatchAny =
      [...game.board[1], ...game.board[2], ...game.board[3], ...game.board.rare, ...game.board.legendary, ...currentPlayer.reserved.map((r) => r.card)]
        .some((c) => calculatePayment(currentPlayer, c).canAfford);

    if (hasSupplyColor || canReserveAny || canCatchAny) {
      return { ok: false, error: '当前仍有可执行操作，不能直接跳过回合' };
    }
    addLog(game, `${currentPlayer.name} 无可用行动，跳过回合`, 'info', playerId);
    finishTurn(game);
    return { ok: true };
  }

  return { ok: false, error: '未知的操作类型' };
}

/**
 * Returns a sanitized copy of game state for a specific viewer (hiding opponents' reserved cards & deck order)
 */
function sanitizeGameForPlayer(game, viewerPlayerId) {
  return {
    status: game.status,
    phase: game.phase,
    targetScore: game.targetScore,
    turnTimer: game.turnTimer,
    roundNumber: game.roundNumber,
    turnNumber: game.turnNumber,
    currentPlayerIndex: game.currentPlayerIndex,
    currentPlayerId: game.players[game.currentPlayerIndex]?.id,
    supply: { ...game.supply },
    deckCounts: {
      1: game.decks[1].length,
      2: game.decks[2].length,
      3: game.decks[3].length,
      rare: game.decks.rare.length,
      legendary: game.decks.legendary.length
    },
    board: {
      1: game.board[1],
      2: game.board[2],
      3: game.board[3],
      rare: game.board.rare,
      legendary: game.board.legendary
    },
    players: game.players.map((p) => {
      const isSelf = p.id === viewerPlayerId;
      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isBot: p.isBot,
        seatIndex: p.seatIndex,
        balls: { ...p.balls },
        ballCount: totalBalls(p.balls),
        bonuses: getPlayerBonuses(p),
        points: getPlayerPoints(p),
        caught: p.caught,
        evolutionsCount: p.evolvedHistory.length,
        reservedCount: p.reserved.length,
        // Official Splendor Pokémon rule: reserved cards are private to the holder
        reserved: isSelf
          ? p.reserved.map((r) => ({ card: r.card, isBlind: r.isBlind }))
          : p.reserved.map((r) => ({ hidden: true, tier: r.card.tier }))
      };
    }),
    availableEvolutions:
      game.players[game.currentPlayerIndex]?.id === viewerPlayerId ? game.availableEvolutions : [],
    finalRoundTriggered: game.finalRoundTriggered,
    finalRoundTriggerPlayer: game.finalRoundTriggerPlayer,
    rankings: game.rankings,
    winner: game.winner,
    lastAction: game.lastAction,
    logs: game.logs.slice(-30),
    turnStartedAt: game.turnStartedAt
  };
}

module.exports = {
  createGame,
  performAction,
  sanitizeGameForPlayer,
  calculatePayment,
  getPlayerBonuses,
  getPlayerPoints,
  totalBalls,
  findAvailableEvolutions
};
