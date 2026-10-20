// Client-facing projections over a snapshot / LAN view. The browser used to
// hard-code "I am seat 0", which left a LAN guest without action buttons; the
// host now stamps `you` on every response and these helpers answer the derived
// questions without the client repeating the seat arithmetic.
//
// Pure functions only — covered by test/table-view.test.mjs.
export function youSeat(state) {
  return Number.isInteger(state && state.you) ? state.you : 0
}

export function isMyTurn(state) {
  return !!state && state.status === 'playing' && state.toAct === youSeat(state)
}

export function seatIsMine(player, state) {
  return !!player && player.seat === youSeat(state)
}

// One line for the lobby once the session has joined a remote room. Fields are
// optional because an older host may only send the seat.
export function joinSummary(lan) {
  const joined = lan && lan.joined
  if (!joined) return ''
  const character = String(joined.character || '').trim()
  const seat = Number.isInteger(joined.seat) ? joined.seat : null
  const seatLabel = String(joined.seatLabel || '').trim() || (seat == null ? '' : '座位 ' + (seat + 1))
  if (character && seatLabel) return '你顶替了 ' + character + '（' + seatLabel + '）'
  if (character) return '你顶替了 ' + character
  if (seatLabel) return '你坐进了 ' + seatLabel
  return ''
}

// Host lobby lines: "2 号位 雷军 → 小明". The arrow only appears once the room
// knows which character the guest replaced (an older room may not say).
export function hostRoster(lan) {
  if (!lan || !lan.enabled) return []
  const guests = Array.isArray(lan.guests) ? lan.guests : []
  const rows = []
  for (const guest of guests) {
    if (!guest || !Number.isInteger(guest.seat)) continue
    const label = String(guest.seat + 1) + ' 号位'
    const character = String(guest.character || '').trim()
    const name = String(guest.name || '').trim()
    if (character && name && character !== name) rows.push(label + ' ' + character + ' → ' + name)
    else if (name || character) rows.push(label + ' ' + (name || character))
    else rows.push(label)
  }
  return rows
}
