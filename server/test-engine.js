const assert = require('assert');
const { CARDS, CARD_BY_ID } = require('../shared/cards');
const {
  createGame,
  performAction,
  sanitizeGameForPlayer,
  calculatePayment,
  getPlayerPoints,
  getPlayerBonuses
} = require('./gameEngine');
const { chooseBotAction } = require('./botAI');

console.log('🧪 Running Splendor: Pokémon Engine Tests...');

// 1. Deck integrity: exactly 90 cards, symmetric tiers & valid evolutions
assert.strictEqual(CARDS.length, 90, 'Total cards must be 90');
assert.strictEqual(CARDS.filter((c) => c.tier === 1).length, 35, 'Lv.1 must have 35 cards');
assert.strictEqual(CARDS.filter((c) => c.tier === 2).length, 30, 'Lv.2 must have 30 cards');
assert.strictEqual(CARDS.filter((c) => c.tier === 3).length, 15, 'Lv.3 must have 15 cards');
assert.strictEqual(CARDS.filter((c) => c.tier === 'rare').length, 5, 'Rare must have 5 cards');
assert.strictEqual(CARDS.filter((c) => c.tier === 'legendary').length, 5, 'Legendary must have 5 cards');

for (const c of CARDS) {
  if (c.evolvesTo) {
    assert(CARD_BY_ID[c.evolvesTo], `Invalid evolvesTo ${c.evolvesTo} on ${c.id}`);
    assert(c.evolveReq, `Missing evolveReq on ${c.id}`);
  }
}
console.log('✅ Deck integrity & evolution links verified (90 cards)');

// 2. Setup counts by player count
const g2 = createGame([{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }]);
assert.strictEqual(g2.supply.red, 4);
assert.strictEqual(g2.supply.master, 5);
assert.strictEqual(g2.board[1].length, 4);
assert.strictEqual(g2.board.rare.length, 1);
assert.strictEqual(g2.board.legendary.length, 1);

const g3 = createGame([{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }, { id: 'p3', name: 'C' }]);
assert.strictEqual(g3.supply.blue, 5);

const g4 = createGame([
  { id: 'p1', name: 'A' },
  { id: 'p2', name: 'B' },
  { id: 'p3', name: 'C' },
  { id: 'p4', name: 'D' }
]);
assert.strictEqual(g4.supply.yellow, 7);
console.log('✅ Player-count token supply setup verified (2/3/4 players)');

// 3. Token taking & Rare/Legendary reservation prohibition
let res = performAction(g2, 'p1', { type: 'reserve_card', source: 'board', tier: 'rare', cardId: g2.board.rare[0].id });
assert.strictEqual(res.ok, false, 'Should forbid reserving Rare card');

res = performAction(g2, 'p1', { type: 'take_tokens', balls: { red: 1, blue: 1, yellow: 1 } });
assert.strictEqual(res.ok, true);
assert.strictEqual(g2.currentPlayerIndex, 1);

// Taking 2 red when only 3 remain should fail
res = performAction(g2, 'p2', { type: 'take_tokens', balls: { red: 2 } });
assert.strictEqual(res.ok, false, 'Cannot take 2 of color when supply < 4');

// Taking 2 pink when 4 remain should succeed
res = performAction(g2, 'p2', { type: 'take_tokens', balls: { pink: 2 } });
assert.strictEqual(res.ok, true);
console.log('✅ Token rules & Rare reservation lock verified');

// 4. Mandatory Master Ball for Rare/Legendary
const p1 = g2.players[0];
const rareCard = g2.board.rare[0];
// Give p1 infinite color bonuses but 0 master balls -> cannot afford Rare!
p1.caught = [
  CARD_BY_ID.l1_charmander, CARD_BY_ID.l1_machop, CARD_BY_ID.l1_caterpie,
  CARD_BY_ID.l1_squirtle, CARD_BY_ID.l1_poliwag, CARD_BY_ID.l1_dratini,
  CARD_BY_ID.l1_bulbasaur, CARD_BY_ID.l1_pidgey, CARD_BY_ID.l1_bellsprout,
  CARD_BY_ID.l1_abra, CARD_BY_ID.l1_nidoran_f, CARD_BY_ID.l1_oddish,
  CARD_BY_ID.l1_gastly, CARD_BY_ID.l1_geodude, CARD_BY_ID.l1_nidoran_m
];
p1.balls = { red: 0, blue: 0, yellow: 0, pink: 0, black: 0, master: 0 };
assert.strictEqual(calculatePayment(p1, rareCard).canAfford, false, 'Rare requires real Master Ball');
p1.balls.master = 1;
assert.strictEqual(calculatePayment(p1, rareCard).canAfford, true, 'Rare affordable with 1 Master Ball');
console.log('✅ Rare/Legendary mandatory Master Ball rule verified');

// 5. Evolution flow: Charmander -> Charmeleon (requires 3 red bonuses)
const gEvo = createGame([{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }]);
gEvo.players[0].caught = [
  CARD_BY_ID.l1_charmander,
  CARD_BY_ID.l1_machop,
  CARD_BY_ID.l1_caterpie // total 3 red bonuses!
];
// Put Charmeleon on board Lv.2
gEvo.board[2][0] = CARD_BY_ID.l2_charmeleon;
res = performAction(gEvo, 'p1', { type: 'take_tokens', balls: { red: 1, blue: 1, yellow: 1 } });
assert.strictEqual(res.ok, true);
assert.strictEqual(gEvo.phase, 'EVOLVE', 'Should enter EVOLVE phase when eligible');
assert(gEvo.availableEvolutions.some((e) => e.baseCardId === 'l1_charmander' && e.targetCardId === 'l2_charmeleon'));

res = performAction(gEvo, 'p1', {
  type: 'evolve',
  baseCardId: 'l1_charmander',
  targetCardId: 'l2_charmeleon'
});
assert.strictEqual(res.ok, true);
assert(!gEvo.players[0].caught.some((c) => c.id === 'l1_charmander'), 'Base card removed from active tableau');
assert(gEvo.players[0].caught.some((c) => c.id === 'l2_charmeleon'), 'Evolved card added to active tableau');
assert.strictEqual(gEvo.players[0].evolvedHistory.length, 1);
assert.strictEqual(gEvo.phase, 'ACTION');
console.log('✅ Evolution phase & card replacement verified');

// 6. Sanitization hides opponent reserved cards
const sanP2 = sanitizeGameForPlayer(gEvo, 'p2');
assert.strictEqual(sanP2.availableEvolutions.length, 0);

// 7. Full AI simulation (3 players) to completion!
for (let sim = 0; sim < 3; sim++) {
  const gSim = createGame([
    { id: 'b1', name: 'Bot1', isBot: true },
    { id: 'b2', name: 'Bot2', isBot: true },
    { id: 'b3', name: 'Bot3', isBot: true }
  ]);
  let steps = 0;
  while (gSim.status === 'PLAYING' && steps < 600) {
    const cur = gSim.players[gSim.currentPlayerIndex];
    const act = chooseBotAction(gSim, cur.id);
    const r = performAction(gSim, cur.id, act);
    assert.strictEqual(r.ok, true, `Bot action failed at step ${steps}: ${r.error} | ${JSON.stringify(act)}`);
    steps++;
  }
  assert.strictEqual(gSim.status, 'FINISHED', `Simulation ${sim + 1} must reach FINISHED`);
  assert(gSim.winner.points >= 18, `Winner should have >= 18 VP, got ${gSim.winner.points}`);
  console.log(
    `✅ AI Simulation #${sim + 1} finished in ${gSim.roundNumber} rounds (${steps} steps) — Winner: ${gSim.winner.name} (${gSim.winner.points} VP, ${gSim.winner.evolutions} evos)`
  );
}

console.log('🎉 ALL TESTS PASSED!');
