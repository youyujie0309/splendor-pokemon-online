/**
 * 《璀璨宝石：宝可梦》关都地区 90 张完整卡组数据
 * 5 种颜色（红/蓝/黄/粉/黑）完全对称：
 * - Lv.1: 35 张 (每色 7 张: 3条三阶线初阶 + 3条二阶线初阶 + 1只独立宝可梦)
 * - Lv.2: 30 张 (每色 6 张: 3条三阶线中阶 + 3条二阶线终阶)
 * - Lv.3: 15 张 (每色 3 张: 3条三阶线终阶)
 * - Rare (稀有): 5 张 (每色 1 张，需消耗大师球，不可预留，提供 2 个永久图标 + 1 分)
 * - Legendary (传说): 5 张 (每色 1 张，需消耗大师球，不可预留，提供 2 个永久图标 + 3 分)
 */

const COLORS = ['red', 'blue', 'yellow', 'pink', 'black'];
const ALL_BALLS = ['red', 'blue', 'yellow', 'pink', 'black', 'master'];

const BALL_META = {
  red: { id: 'red', name: '精灵球', short: '红', color: '#E53935', light: '#FFEBEE', border: '#EF9A9A' },
  blue: { id: 'blue', name: '超级球', short: '蓝', color: '#1E88E5', light: '#E3F2FD', border: '#90CAF9' },
  yellow: { id: 'yellow', name: '先机球', short: '黄', color: '#F9A825', light: '#FFFDE7', border: '#FFE082' },
  pink: { id: 'pink', name: '治愈球', short: '粉', color: '#EC407A', light: '#FCE4EC', border: '#F48FB1' },
  black: { id: 'black', name: '高级球', short: '黑', color: '#37474F', light: '#ECEFF1', border: '#B0BEC5' },
  master: { id: 'master', name: '大师球', short: '紫', color: '#7B1FA2', light: '#F3E5F5', border: '#CE93D8' }
};

function card(id, dexId, name, tier, bonus, points, cost, opts = {}) {
  return {
    id,
    dexId,
    name,
    tier, // 1 | 2 | 3 | 'rare' | 'legendary'
    bonus, // 'red' | 'blue' | 'yellow' | 'pink' | 'black'
    bonusCount: opts.bonusCount || 1,
    points,
    cost, // { red?, blue?, yellow?, pink?, black?, master? }
    evolvesTo: opts.evolvesTo || null,
    evolveReq: opts.evolveReq || null,
    reservable: tier !== 'rare' && tier !== 'legendary',
    image: `/assets/pokemon/${dexId}.webp`
  };
}

const CARDS = [
  // ==================== LEVEL 1 (35 张, 每色 7 张) ====================
  // RED (7)
  card('l1_charmander', 4, '小火龙', 1, 'red', 0, { blue: 1, yellow: 1, pink: 1 }, {
    evolvesTo: 'l2_charmeleon', evolveReq: { red: 3 }
  }),
  card('l1_machop', 66, '腕力', 1, 'red', 0, { black: 2, yellow: 1 }, {
    evolvesTo: 'l2_machoke', evolveReq: { red: 2, black: 1 }
  }),
  card('l1_caterpie', 10, '绿毛虫', 1, 'red', 0, { yellow: 1, pink: 1, black: 1 }, {
    evolvesTo: 'l2_metapod', evolveReq: { yellow: 2, red: 1 }
  }),
  card('l1_growlithe', 58, '卡蒂狗', 1, 'red', 0, { blue: 2, pink: 1, black: 1 }, {
    evolvesTo: 'l2_arcanine', evolveReq: { red: 3, yellow: 1 }
  }),
  card('l1_vulpix', 37, '六尾', 1, 'red', 0, { blue: 1, yellow: 1, pink: 1, black: 1 }, {
    evolvesTo: 'l2_ninetales', evolveReq: { red: 2, pink: 2 }
  }),
  card('l1_ponyta', 77, '小火马', 1, 'red', 1, { yellow: 4 }, {
    evolvesTo: 'l2_rapidash', evolveReq: { red: 3 }
  }),
  card('l1_pinsir', 127, '凯罗斯', 1, 'red', 1, { blue: 2, black: 2 }),

  // BLUE (7)
  card('l1_squirtle', 7, '杰尼龟', 1, 'blue', 0, { red: 1, yellow: 1, black: 1 }, {
    evolvesTo: 'l2_wartortle', evolveReq: { blue: 3 }
  }),
  card('l1_poliwag', 60, '蚊香蝌蚪', 1, 'blue', 0, { red: 2, pink: 1 }, {
    evolvesTo: 'l2_poliwhirl', evolveReq: { blue: 2, pink: 1 }
  }),
  card('l1_dratini', 147, '迷你龙', 1, 'blue', 0, { red: 1, pink: 1, black: 1 }, {
    evolvesTo: 'l2_dragonair', evolveReq: { blue: 2, black: 1 }
  }),
  card('l1_magikarp', 129, '鲤鱼王', 1, 'blue', 0, { yellow: 2, red: 1, black: 1 }, {
    evolvesTo: 'l2_gyarados', evolveReq: { blue: 3, red: 1 }
  }),
  card('l1_psyduck', 54, '可达鸭', 1, 'blue', 0, { red: 1, yellow: 1, pink: 1, black: 1 }, {
    evolvesTo: 'l2_golduck', evolveReq: { blue: 2, yellow: 2 }
  }),
  card('l1_staryu', 120, '海星星', 1, 'blue', 1, { pink: 4 }, {
    evolvesTo: 'l2_starmie', evolveReq: { blue: 3 }
  }),
  card('l1_farfetchd', 83, '大葱鸭', 1, 'blue', 1, { yellow: 2, red: 2 }),

  // YELLOW (7)
  card('l1_bulbasaur', 1, '妙蛙种子', 1, 'yellow', 0, { red: 1, blue: 1, pink: 1 }, {
    evolvesTo: 'l2_ivysaur', evolveReq: { yellow: 3 }
  }),
  card('l1_pidgey', 16, '波波', 1, 'yellow', 0, { blue: 2, black: 1 }, {
    evolvesTo: 'l2_pidgeotto', evolveReq: { yellow: 2, blue: 1 }
  }),
  card('l1_bellsprout', 69, '喇叭芽', 1, 'yellow', 0, { red: 1, blue: 1, black: 1 }, {
    evolvesTo: 'l2_weepinbell', evolveReq: { yellow: 2, pink: 1 }
  }),
  card('l1_pikachu', 25, '皮卡丘', 1, 'yellow', 0, { red: 2, blue: 1, pink: 1 }, {
    evolvesTo: 'l2_raichu', evolveReq: { yellow: 3, blue: 1 }
  }),
  card('l1_magnemite', 81, '小磁怪', 1, 'yellow', 0, { red: 1, blue: 1, pink: 1, black: 1 }, {
    evolvesTo: 'l2_magneton', evolveReq: { yellow: 2, black: 2 }
  }),
  card('l1_meowth', 52, '喵喵', 1, 'yellow', 1, { black: 4 }, {
    evolvesTo: 'l2_persian', evolveReq: { yellow: 3 }
  }),
  card('l1_scyther', 123, '飞天螳螂', 1, 'yellow', 1, { pink: 2, blue: 2 }),

  // PINK (7)
  card('l1_abra', 63, '凯西', 1, 'pink', 0, { blue: 1, yellow: 1, black: 1 }, {
    evolvesTo: 'l2_kadabra', evolveReq: { pink: 3 }
  }),
  card('l1_nidoran_f', 29, '尼多兰', 1, 'pink', 0, { yellow: 2, red: 1 }, {
    evolvesTo: 'l2_nidorina', evolveReq: { pink: 2, red: 1 }
  }),
  card('l1_oddish', 43, '走路草', 1, 'pink', 0, { red: 1, blue: 1, yellow: 1 }, {
    evolvesTo: 'l2_gloom', evolveReq: { pink: 2, yellow: 1 }
  }),
  card('l1_jigglypuff', 39, '胖丁', 1, 'pink', 0, { black: 2, blue: 1, yellow: 1 }, {
    evolvesTo: 'l2_wigglytuff', evolveReq: { pink: 3, black: 1 }
  }),
  card('l1_slowpoke', 79, '呆呆兽', 1, 'pink', 0, { red: 1, blue: 1, yellow: 1, black: 1 }, {
    evolvesTo: 'l2_slowbro', evolveReq: { pink: 2, blue: 2 }
  }),
  card('l1_clefairy', 35, '皮皮', 1, 'pink', 1, { red: 4 }, {
    evolvesTo: 'l2_clefable', evolveReq: { pink: 3 }
  }),
  card('l1_mr_mime', 122, '魔墙人偶', 1, 'pink', 1, { black: 2, yellow: 2 }),

  // BLACK (7)
  card('l1_gastly', 92, '鬼斯', 1, 'black', 0, { red: 1, blue: 1, pink: 1 }, {
    evolvesTo: 'l2_haunter', evolveReq: { black: 3 }
  }),
  card('l1_geodude', 74, '小拳石', 1, 'black', 0, { pink: 2, yellow: 1 }, {
    evolvesTo: 'l2_graveler', evolveReq: { black: 2, yellow: 1 }
  }),
  card('l1_nidoran_m', 32, '尼多朗', 1, 'black', 0, { blue: 1, yellow: 1, pink: 1 }, {
    evolvesTo: 'l2_nidorino', evolveReq: { black: 2, red: 1 }
  }),
  card('l1_rhyhorn', 111, '独角犀牛', 1, 'black', 0, { pink: 2, red: 1, yellow: 1 }, {
    evolvesTo: 'l2_rhydon', evolveReq: { black: 3, pink: 1 }
  }),
  card('l1_koffing', 109, '瓦斯弹', 1, 'black', 0, { red: 1, blue: 1, yellow: 1, pink: 1 }, {
    evolvesTo: 'l2_weezing', evolveReq: { black: 2, red: 2 }
  }),
  card('l1_cubone', 104, '卡拉卡拉', 1, 'black', 1, { blue: 4 }, {
    evolvesTo: 'l2_marowak', evolveReq: { black: 3 }
  }),
  card('l1_tauros', 128, '肯泰罗', 1, 'black', 1, { red: 2, pink: 2 }),

  // ==================== LEVEL 2 (30 张, 每色 6 张) ====================
  // RED (6)
  card('l2_charmeleon', 5, '火恐龙', 2, 'red', 1, { blue: 2, yellow: 2, black: 3 }, {
    evolvesTo: 'l3_charizard', evolveReq: { red: 4 }
  }),
  card('l2_machoke', 67, '豪力', 2, 'red', 2, { yellow: 4, black: 2 }, {
    evolvesTo: 'l3_machamp', evolveReq: { red: 3, black: 2 }
  }),
  card('l2_metapod', 11, '铁甲蛹', 2, 'red', 1, { pink: 3, yellow: 2, blue: 2 }, {
    evolvesTo: 'l3_butterfree', evolveReq: { red: 2, yellow: 2 }
  }),
  card('l2_arcanine', 59, '风速狗', 2, 'red', 3, { red: 6 }),
  card('l2_ninetales', 38, '九尾', 2, 'red', 2, { pink: 5 }),
  card('l2_rapidash', 78, '烈焰马', 2, 'red', 2, { blue: 3, yellow: 5 }),

  // BLUE (6)
  card('l2_wartortle', 8, '卡咪龟', 2, 'blue', 1, { red: 2, yellow: 3, pink: 2 }, {
    evolvesTo: 'l3_blastoise', evolveReq: { blue: 4 }
  }),
  card('l2_poliwhirl', 61, '蚊香君', 2, 'blue', 2, { red: 4, pink: 2 }, {
    evolvesTo: 'l3_poliwrath', evolveReq: { blue: 3, pink: 2 }
  }),
  card('l2_dragonair', 148, '哈克龙', 2, 'blue', 2, { black: 3, red: 2, yellow: 2 }, {
    evolvesTo: 'l3_dragonite', evolveReq: { blue: 3, black: 2 }
  }),
  card('l2_gyarados', 130, '暴鲤龙', 2, 'blue', 3, { blue: 6 }),
  card('l2_golduck', 55, '哥达鸭', 2, 'blue', 2, { black: 5 }),
  card('l2_starmie', 121, '宝石海星', 2, 'blue', 2, { pink: 3, red: 5 }),

  // YELLOW (6)
  card('l2_ivysaur', 2, '妙蛙草', 2, 'yellow', 1, { red: 3, blue: 2, black: 2 }, {
    evolvesTo: 'l3_venusaur', evolveReq: { yellow: 4 }
  }),
  card('l2_pidgeotto', 17, '比比鸟', 2, 'yellow', 1, { blue: 4, pink: 2 }, {
    evolvesTo: 'l3_pidgeot', evolveReq: { yellow: 3, blue: 1 }
  }),
  card('l2_weepinbell', 70, '口呆花', 2, 'yellow', 2, { pink: 3, black: 2, red: 2 }, {
    evolvesTo: 'l3_victreebel', evolveReq: { yellow: 3, pink: 2 }
  }),
  card('l2_raichu', 26, '雷丘', 2, 'yellow', 3, { yellow: 6 }),
  card('l2_magneton', 82, '三合一磁怪', 2, 'yellow', 2, { red: 5 }),
  card('l2_persian', 53, '猫老大', 2, 'yellow', 2, { black: 3, blue: 5 }),

  // PINK (6)
  card('l2_kadabra', 64, '勇基拉', 2, 'pink', 2, { blue: 3, yellow: 2, black: 2 }, {
    evolvesTo: 'l3_alakazam', evolveReq: { pink: 4 }
  }),
  card('l2_nidorina', 30, '尼多娜', 2, 'pink', 1, { black: 4, red: 2 }, {
    evolvesTo: 'l3_nidoqueen', evolveReq: { pink: 3, red: 2 }
  }),
  card('l2_gloom', 44, '臭臭花', 2, 'pink', 1, { yellow: 3, blue: 2, red: 2 }, {
    evolvesTo: 'l3_vileplume', evolveReq: { pink: 2, yellow: 2 }
  }),
  card('l2_wigglytuff', 40, '胖可丁', 2, 'pink', 3, { pink: 6 }),
  card('l2_slowbro', 80, '呆壳兽', 2, 'pink', 2, { blue: 5 }),
  card('l2_clefable', 36, '皮可西', 2, 'pink', 2, { red: 3, black: 5 }),

  // BLACK (6)
  card('l2_haunter', 93, '鬼斯通', 2, 'black', 2, { red: 2, pink: 3, yellow: 2 }, {
    evolvesTo: 'l3_gengar', evolveReq: { black: 4 }
  }),
  card('l2_graveler', 75, '隆隆石', 2, 'black', 1, { pink: 4, blue: 2 }, {
    evolvesTo: 'l3_golem', evolveReq: { black: 3, yellow: 2 }
  }),
  card('l2_nidorino', 33, '尼多力诺', 2, 'black', 2, { blue: 2, yellow: 2, red: 3 }, {
    evolvesTo: 'l3_nidoking', evolveReq: { black: 3, red: 2 }
  }),
  card('l2_rhydon', 112, '钻角犀兽', 2, 'black', 3, { black: 6 }),
  card('l2_weezing', 110, '双弹瓦斯', 2, 'black', 2, { yellow: 5 }),
  card('l2_marowak', 105, '嘎啦嘎啦', 2, 'black', 2, { yellow: 3, pink: 5 }),

  // ==================== LEVEL 3 (15 张, 每色 3 张) ====================
  // RED (3)
  card('l3_charizard', 6, '喷火龙', 3, 'red', 5, { yellow: 7, red: 3 }),
  card('l3_machamp', 68, '怪力', 3, 'red', 4, { black: 7 }),
  card('l3_butterfree', 12, '巴大蝶', 3, 'red', 3, { blue: 3, yellow: 5, pink: 3, black: 3 }),

  // BLUE (3)
  card('l3_blastoise', 9, '水箭龟', 3, 'blue', 5, { red: 7, blue: 3 }),
  card('l3_dragonite', 149, '快龙', 3, 'blue', 4, { black: 6, blue: 3, red: 3 }),
  card('l3_poliwrath', 62, '蚊香泳士', 3, 'blue', 3, { red: 5, yellow: 3, pink: 3, black: 3 }),

  // YELLOW (3)
  card('l3_venusaur', 3, '妙蛙花', 3, 'yellow', 5, { blue: 7, yellow: 3 }),
  card('l3_victreebel', 71, '大食花', 3, 'yellow', 4, { pink: 7 }),
  card('l3_pidgeot', 18, '大比鸟', 3, 'yellow', 3, { red: 3, blue: 5, pink: 3, black: 3 }),

  // PINK (3)
  card('l3_alakazam', 65, '胡地', 3, 'pink', 5, { black: 7, pink: 3 }),
  card('l3_nidoqueen', 31, '尼多后', 3, 'pink', 4, { red: 6, pink: 3, yellow: 3 }),
  card('l3_vileplume', 45, '霸王花', 3, 'pink', 3, { red: 3, blue: 3, yellow: 5, black: 3 }),

  // BLACK (3)
  card('l3_gengar', 94, '耿鬼', 3, 'black', 5, { pink: 7, black: 3 }),
  card('l3_nidoking', 34, '尼多王', 3, 'black', 4, { yellow: 6, black: 3, blue: 3 }),
  card('l3_golem', 76, '隆隆岩', 3, 'black', 3, { red: 3, blue: 3, yellow: 3, pink: 5 }),

  // ==================== RARE 稀有宝可梦 (5 张, 每色 1 张) ====================
  card('rare_aerodactyl', 142, '化石翼龙', 'rare', 'red', 1, { red: 2, black: 2, master: 1 }, { bonusCount: 2 }),
  card('rare_lapras', 131, '拉普拉斯', 'rare', 'blue', 1, { blue: 2, pink: 2, master: 1 }, { bonusCount: 2 }),
  card('rare_eevee', 133, '伊布', 'rare', 'yellow', 1, { yellow: 2, red: 2, master: 1 }, { bonusCount: 2 }),
  card('rare_chansey', 113, '吉利蛋', 'rare', 'pink', 1, { pink: 2, yellow: 2, master: 1 }, { bonusCount: 2 }),
  card('rare_snorlax', 143, '卡比兽', 'rare', 'black', 1, { black: 2, blue: 2, master: 1 }, { bonusCount: 2 }),

  // ==================== LEGENDARY 传说/幻之宝可梦 (5 张, 每色 1 张) ====================
  card('leg_moltres', 146, '火焰鸟', 'legendary', 'red', 3, { red: 4, yellow: 3, master: 1 }, { bonusCount: 2 }),
  card('leg_articuno', 144, '急冻鸟', 'legendary', 'blue', 3, { blue: 4, pink: 3, master: 1 }, { bonusCount: 2 }),
  card('leg_zapdos', 145, '闪电鸟', 'legendary', 'yellow', 3, { yellow: 4, black: 3, master: 1 }, { bonusCount: 2 }),
  card('leg_mew', 151, '梦幻', 'legendary', 'pink', 3, { pink: 4, blue: 3, master: 1 }, { bonusCount: 2 }),
  card('leg_mewtwo', 150, '超梦', 'legendary', 'black', 3, { black: 4, red: 3, master: 1 }, { bonusCount: 2 })
];

const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));

// Precompute reverse evolution lookup (evolvesFrom) for UI badges
const EVOLVES_FROM = {};
for (const c of CARDS) {
  if (c.evolvesTo && CARD_BY_ID[c.evolvesTo]) {
    EVOLVES_FROM[c.evolvesTo] = c.id;
  }
}

module.exports = {
  COLORS,
  ALL_BALLS,
  BALL_META,
  CARDS,
  CARD_BY_ID,
  EVOLVES_FROM
};
