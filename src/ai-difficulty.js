// Difficulty is the "how well do the bots play" dial, kept separate from each
// character's persona (loose/agg/bluff). Two levels ship:
//
//   normal — the original feel: chunky thresholds, rarely bluffs, mostly reads
//            its own cards.
//   sharp  — prices the pot: compares equity against the odds the pot lays,
//            value-bets by pot fraction, and takes occasional bluffs when the
//            table is short-handed enough for them to work.
//
// Both choice functions are pure: the caller computes the hand snapshot once,
// so the same inputs are unit-testable without a running table.

export const DIFFICULTIES = [
  {
    id: 'normal',
    label: '普通',
    hint: '按牌力和直觉打，很少诈唬',
  },
  {
    id: 'sharp',
    label: '老练',
    hint: '算底池赔率，会偶尔诈唬',
  },
]

// New tables start here; `reset()` restores it, so the old level stays one
// click away instead of becoming a hidden mode.
export const DEFAULT_DIFFICULTY = 'sharp'

export function isDifficulty(id) {
  return DIFFICULTIES.some((d) => d.id === id)
}

export function difficultyLabel(id) {
  const hit = DIFFICULTIES.find((d) => d.id === id)
  return hit ? hit.label : ''
}

// `equity` is the bot's own rough strength in [0,1] plus its looseness;
// `odds` is the break-even equity for a call: toCall / (pot + toCall).
export function normalChoice(s) {
  const hs = s.equity
  const roll = s.roll
  const toCall = s.toCall
  if (toCall === 0) {
    if (hs > 0.62 && roll < s.agg) {
      const size = Math.floor(s.potNow * (0.5 + s.agg * 0.4))
      return { type: 'raise', amount: Math.max(s.bb, s.bet + size) }
    }
    if (hs > 0.5 && roll < s.bluff * 1.4) {
      return { type: 'raise', amount: s.bet + Math.max(s.bb, Math.floor(s.potNow * 0.66)) }
    }
    return { type: 'check' }
  }
  if (hs + 0.08 < s.odds && toCall > s.stack * 0.12 && roll > s.bluff) return { type: 'fold' }
  if (hs > 0.7 && roll < s.agg) {
    const size = Math.floor((s.potNow + toCall) * (0.6 + s.agg * 0.5))
    return { type: 'raise', amount: s.currentBet + Math.max(s.minRaise, size) }
  }
  if (hs > 0.55 && roll < s.bluff + 0.15) {
    return { type: 'raise', amount: s.currentBet + Math.max(s.minRaise, Math.floor((s.potNow + toCall) * 0.75)) }
  }
  if (toCall >= s.stack) return { type: 'call' }
  if (hs + s.loose * 0.5 >= s.odds - 0.08) return { type: 'call' }
  if (toCall <= s.bb && hs > 0.28) return { type: 'call' }
  return { type: 'fold' }
}

export function sharpChoice(s) {
  const toCall = s.toCall
  const roll = s.roll
  const equity = s.equity
  const potNow = s.potNow
  // Short-handed is when a bluff actually folds people out; with a crowd behind
  // you it mostly burns chips, so the rate is cut (but never to zero — the
  // human must stay unsure whether the bet means anything).
  const shortHanded = s.actors <= 2
  const bluffRate = Math.min(0.42, s.bluff * 1.6 * (shortHanded ? 1 : 0.45))

  if (toCall === 0) {
    if (equity > 0.66) {
      const size = Math.floor(potNow * (0.55 + s.agg * 0.3))
      return { type: 'raise', amount: Math.max(s.bb, s.bet + size) }
    }
    // Thin value / probe: a smaller bet keeps worse hands in and cheaply
    // denies free cards.
    if (equity > 0.45 && roll < s.agg * 0.55) {
      return { type: 'raise', amount: Math.max(s.bb, s.bet + Math.floor(potNow * 0.4)) }
    }
    if (roll < bluffRate) {
      return { type: 'raise', amount: Math.max(s.bb, s.bet + Math.floor(potNow * 0.6)) }
    }
    return { type: 'check' }
  }

  if (equity > 0.72 && roll < s.agg) {
    const size = Math.floor((potNow + toCall) * (0.7 + s.agg * 0.3))
    return { type: 'raise', amount: s.currentBet + Math.max(s.minRaise, size) }
  }
  // Semi-bluff: an unmade hand with outs, raised because a fold is worth as
  // much as the draw.
  if (equity > 0.34 && roll < bluffRate) {
    return { type: 'raise', amount: s.currentBet + Math.max(s.minRaise, Math.floor((potNow + toCall) * 0.7)) }
  }
  // Cards speak: call only when the price is genuinely beaten.
  if (equity >= s.odds + 0.04) return { type: 'call' }
  // A cheap completion with a live hand is not a losing call.
  if (toCall <= s.bb * 1.5 && equity > 0.3) return { type: 'call' }
  return { type: 'fold' }
}
