const { COLORS, ALL_BALLS } = require('../shared/cards');
const { calculatePayment, getPlayerBonuses, totalBalls } = require('./gameEngine');

/**
 * Smart heuristic AI for Splendor: Pokémon (also used for turn-timeout fallback).
 */
function chooseBotAction(game, playerId) {
  const player = game.players.find((p) => p.id === playerId);
  if (!player) return null;

  // 1. DISCARD phase: drop least-needed non-master balls first
  if (game.phase === 'DISCARD') {
    const mustDiscard = totalBalls(player.balls) - 10;
    const discard = { red: 0, blue: 0, yellow: 0, pink: 0, black: 0, master: 0 };
    let remaining = mustDiscard;
    // Prefer discarding colors with highest held count, avoid discarding master unless forced
    const order = [...COLORS].sort((a, b) => player.balls[b] - player.balls[a]);
    order.push('master');
    while (remaining > 0) {
      let dropped = false;
      for (const c of order) {
        if (player.balls[c] - discard[c] > 0 && remaining > 0) {
          discard[c] += 1;
          remaining -= 1;
          dropped = true;
          break;
        }
      }
      if (!dropped) break;
    }
    return { type: 'discard_tokens', balls: discard };
  }

  // 2. EVOLVE phase: always evolve the highest VP gain!
  if (game.phase === 'EVOLVE') {
    if (game.availableEvolutions.length > 0) {
      const sorted = [...game.availableEvolutions].sort((a, b) => {
        const gainA = a.targetCard.points - a.baseCard.points;
        const gainB = b.targetCard.points - b.baseCard.points;
        return gainB - gainA;
      });
      return {
        type: 'evolve',
        baseCardId: sorted[0].baseCardId,
        targetCardId: sorted[0].targetCardId
      };
    }
    return { type: 'skip_evolve' };
  }

  // 3. ACTION phase
  const bonuses = getPlayerBonuses(player);

  // Collect all catchable cards (board + reserved)
  const catchCandidates = [];
  for (const tier of ['legendary', 'rare', 3, 2, 1]) {
    for (const c of game.board[tier] || []) {
      const pay = calculatePayment(player, c);
      if (pay.canAfford) {
        catchCandidates.push({ source: 'board', card: c, pay });
      }
    }
  }
  for (const r of player.reserved) {
    const pay = calculatePayment(player, r.card);
    if (pay.canAfford) {
      catchCandidates.push({ source: 'reserved', card: r.card, pay });
    }
  }

  if (catchCandidates.length > 0) {
    // Score each catchable card: VP + double bonus + evolution chain synergy - master ball waste
    catchCandidates.sort((a, b) => {
      const scoreCard = (item) => {
        const c = item.card;
        let s = c.points * 4.5 + (c.bonusCount || 1) * 2.2;
        if (c.evolvesTo) {
          // Bonus if target evolution is visible on board
          const nextVisible = [...game.board[2], ...game.board[3]].some((x) => x.id === c.evolvesTo);
          if (nextVisible) s += 2.5;
        }
        // Slight penalty for spending master balls on 0-point cards
        if (c.points === 0 && item.pay.payment.master > 0) s -= 2.0;
        return s;
      };
      return scoreCard(b) - scoreCard(a);
    });
    const best = catchCandidates[0];
    return { type: 'catch_card', source: best.source, cardId: best.card.id };
  }

  // Consider reserving a strong card if we have space & master ball is available
  if (player.reserved.length < 2 && game.supply.master > 0 && Math.random() < 0.22) {
    // Prefer reserving an evolution target for a Pokémon we already own!
    for (const owned of player.caught) {
      if (!owned.evolvesTo) continue;
      for (const tier of [2, 3]) {
        const match = game.board[tier].find((c) => c.id === owned.evolvesTo);
        if (match) {
          return { type: 'reserve_card', source: 'board', tier, cardId: match.id };
        }
      }
    }
  }

  // Otherwise pick the most useful tokens toward our closest target cards
  const desired = { red: 0, blue: 0, yellow: 0, pink: 0, black: 0 };
  const targetPool = [
    ...player.reserved.map((r) => ({ card: r.card, weight: 3 })),
    ...game.board[1].map((c) => ({ card: c, weight: 2.2 })),
    ...game.board[2].map((c) => ({ card: c, weight: 1.5 })),
    ...game.board[3].map((c) => ({ card: c, weight: 0.8 }))
  ];

  for (const { card, weight } of targetPool) {
    let deficitTotal = 0;
    const deficits = {};
    for (const c of COLORS) {
      const need = Math.max(0, (card.cost[c] || 0) - (bonuses[c] || 0) - (player.balls[c] || 0));
      deficits[c] = need;
      deficitTotal += need;
    }
    if (deficitTotal > 0 && deficitTotal <= 5) {
      const factor = weight / deficitTotal;
      for (const c of COLORS) {
        desired[c] += deficits[c] * factor;
      }
    }
  }

  const availableColors = COLORS.filter((c) => game.supply[c] > 0);
  if (availableColors.length > 0) {
    const ranked = [...availableColors].sort((a, b) => desired[b] - desired[a]);
    // If top needed color has >= 4 and we really need 2 of it
    if (game.supply[ranked[0]] >= 4 && desired[ranked[0]] > 1.8 && (ranked.length < 3 || Math.random() < 0.35)) {
      return { type: 'take_tokens', balls: { [ranked[0]]: 2 } };
    }
    const pickCount = Math.min(3, ranked.length);
    const balls = {};
    for (let i = 0; i < pickCount; i++) {
      balls[ranked[i]] = 1;
    }
    return { type: 'take_tokens', balls };
  }

  // Fallback: reserve any board card
  if (player.reserved.length < 3) {
    for (const tier of [1, 2, 3]) {
      if (game.board[tier].length > 0) {
        return { type: 'reserve_card', source: 'board', tier, cardId: game.board[tier][0].id };
      }
      if (game.decks[tier].length > 0) {
        return { type: 'reserve_card', source: 'deck', tier };
      }
    }
  }

  return { type: 'pass_turn' };
}

module.exports = { chooseBotAction };
