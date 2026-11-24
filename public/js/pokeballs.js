export const COLORS = ['red', 'blue', 'yellow', 'pink', 'black'];
export const ALL_BALLS = ['red', 'blue', 'yellow', 'pink', 'black', 'master'];

export const BALL_INFO = {
  red: { id: 'red', name: '精灵球', short: '红', color: '#E53935', bg: '#FFEBEE', text: '#C62828' },
  blue: { id: 'blue', name: '超级球', short: '蓝', color: '#1E88E5', bg: '#E3F2FD', text: '#1565C0' },
  yellow: { id: 'yellow', name: '先机球', short: '黄', color: '#F59E0B', bg: '#FEF9C3', text: '#B45309' },
  pink: { id: 'pink', name: '治愈球', short: '粉', color: '#EC407A', bg: '#FCE4EC', text: '#AD1457' },
  black: { id: 'black', name: '高级球', short: '黑', color: '#2E3440', bg: '#ECEFF1', text: '#1E242B' },
  master: { id: 'master', name: '大师球', short: '大师', color: '#7B1FA2', bg: '#F3E5F5', text: '#6A1B9A' }
};

export const AVATAR_CHOICES = [
  { dexId: 25, name: '皮卡丘' },
  { dexId: 4, name: '小火龙' },
  { dexId: 7, name: '杰尼龟' },
  { dexId: 1, name: '妙蛙种子' },
  { dexId: 133, name: '伊布' },
  { dexId: 143, name: '卡比兽' },
  { dexId: 94, name: '耿鬼' },
  { dexId: 151, name: '梦幻' }
];

/**
 * Generates crisp, authentic Poké Ball inline SVG for any of the 6 ball types.
 */
export function renderBallSVG(type, size = 28) {
  const uid = `b_${type}_${Math.random().toString(36).slice(2, 6)}`;
  const topMap = {
    red: '#E53935',
    blue: '#1E88E5',
    yellow: '#FBC02D',
    pink: '#F06292',
    black: '#2D343E',
    master: '#7B1FA2'
  };
  const topColor = topMap[type] || '#E53935';

  let pattern = '';
  if (type === 'blue') {
    // Great Ball iconic red angled stripes
    pattern = `
      <path d="M10 14 L22 24 L17 29 L6 20 Z" fill="#E53935"/>
      <path d="M54 14 L42 24 L47 29 L58 20 Z" fill="#E53935"/>
    `;
  } else if (type === 'yellow') {
    // Quick Ball blue accents on yellow dome
    pattern = `
      <path d="M25 4 L39 4 L36 22 L28 22 Z" fill="#1E88E5" opacity="0.88"/>
      <path d="M8 22 L20 22 L18 30 L5 30 Z" fill="#1E88E5" opacity="0.85"/>
      <path d="M56 22 L44 22 L46 30 L59 30 Z" fill="#1E88E5" opacity="0.85"/>
    `;
  } else if (type === 'pink') {
    // Heal Ball warm gold & pale blue crescent trim
    pattern = `
      <path d="M12 15 Q32 4 52 15 Q32 13 12 15 Z" fill="#FFF59D"/>
      <circle cx="17" cy="23" r="4" fill="#81D4FA" opacity="0.9"/>
      <circle cx="47" cy="23" r="4" fill="#81D4FA" opacity="0.9"/>
    `;
  } else if (type === 'black') {
    // Ultra Ball signature yellow H-band
    pattern = `
      <path d="M17 7 L24 5 L24 30 L17 30 Z" fill="#FDD835"/>
      <path d="M40 5 L47 7 L47 30 L40 30 Z" fill="#FDD835"/>
      <rect x="22" y="13" width="20" height="5.5" rx="2" fill="#FDD835"/>
    `;
  } else if (type === 'master') {
    // Master Ball pink pods + crisp white M
    pattern = `
      <ellipse cx="15" cy="18" rx="6.5" ry="5" transform="rotate(-25 15 18)" fill="#EC407A"/>
      <ellipse cx="49" cy="18" rx="6.5" ry="5" transform="rotate(25 49 18)" fill="#EC407A"/>
      <path d="M24 25 L24 12 L32 20 L40 12 L40 25" fill="none" stroke="#FFFFFF" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
    `;
  }

  return `
    <svg class="ball-svg" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <clipPath id="${uid}_clip"><circle cx="32" cy="32" r="29"/></clipPath>
      </defs>
      <g clip-path="url(#${uid}_clip)">
        <rect x="0" y="0" width="64" height="33" fill="${topColor}"/>
        <rect x="0" y="33" width="64" height="31" fill="#F8FAFC"/>
        ${pattern}
        <!-- Subtle glossy dome highlight -->
        <ellipse cx="22" cy="14" rx="10" ry="5.5" transform="rotate(-24 22 14)" fill="#FFFFFF" opacity="0.28"/>
        <!-- Center belt -->
        <rect x="0" y="28.5" width="64" height="7" fill="#1E2430"/>
      </g>
      <circle cx="32" cy="32" r="29" fill="none" stroke="#1E2430" stroke-width="3.2"/>
      <circle cx="32" cy="32" r="9.5" fill="#1E2430"/>
      <circle cx="32" cy="32" r="6.2" fill="#FFFFFF"/>
      <circle cx="32" cy="32" r="3.2" fill="#E2E8F0"/>
    </svg>
  `;
}

export function avatarUrl(dexId) {
  return `/assets/pokemon/${dexId || 25}.webp`;
}
