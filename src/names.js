// Nicknames for LAN guests and rooms: "沉着的河马", "安静的麋鹿" — two ideas
// that read like a poker table name rather than a random handle. Pure helpers,
// covered by test/names.test.mjs.
export const NICK_ADJ = [
  '沉着',
  '安静',
  '锐利',
  '耐心',
  '从容',
  '寡言',
  '清醒',
  '低调',
  '果决',
  '温和',
  '机敏',
  '挺拔',
  '内敛',
  '冷静',
  '敏捷',
  '倔强',
]

export const NICK_NOUN = [
  '河马',
  '白鹭',
  '山猫',
  '灰狼',
  '野兔',
  '海豚',
  '猎隼',
  '麋鹿',
  '游隼',
  '棕熊',
  '沙狐',
  '山雀',
  '岩羊',
  '水獭',
  '夜枭',
  '鲸鱼',
  '长颈鹿',
]

export function randomNickname(random = Math.random) {
  function pick(list) {
    const at = Math.floor(random() * list.length)
    return list[Math.min(Math.max(at, 0), list.length - 1)]
  }
  return pick(NICK_ADJ) + '的' + pick(NICK_NOUN)
}

// Control characters are never part of a display name: drop them instead of
// letting them reach the log or the roster. Punctuation and symbols may sit
// inside a name but not at its edges, where they read as leftover typing.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g
const EDGE_GLYPHS = /^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu

export function normalizeNickname(input, fallback = '') {
  if (input == null) return fallback == null ? '' : String(fallback)
  let text = String(input).replace(CONTROL_CHARS, '')
  text = text.replace(EDGE_GLYPHS, '')
  // Count glyphs, not UTF-16 units, so a truncation never splits an emoji or a
  // surrogate pair in half.
  text = Array.from(text).slice(0, 12).join('')
  text = text.replace(EDGE_GLYPHS, '')
  if (text) return text
  return fallback == null ? '' : String(fallback)
}

// Picks a nickname nobody at the table has yet. Fifty draws is enough for a
// table of eight; when randomness keeps colliding a numeric suffix guarantees
// a fresh name (and also keeps the loop deterministic and bounded).
export function uniqueNickname(taken, random = Math.random) {
  const used = new Set()
  if (taken && typeof taken !== 'string' && typeof taken[Symbol.iterator] === 'function') {
    for (const name of taken) used.add(String(name))
  }
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = randomNickname(random)
    if (!used.has(candidate)) return candidate
  }
  const base = randomNickname(random)
  let suffix = 2
  while (used.has(base + suffix) && suffix < 1000) suffix++
  return base + suffix
}
