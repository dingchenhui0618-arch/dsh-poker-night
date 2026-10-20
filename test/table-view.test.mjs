// Client-facing projections: which seat is mine, whose turn is it, and the
// lobby lines built from the LAN view.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hostRoster, isMyTurn, joinSummary, seatIsMine, youSeat } from '../src/table-view.js'

test('youSeat trusts only an integer stamp, defaulting to seat 0', () => {
  assert.equal(youSeat({ you: 3 }), 3)
  assert.equal(youSeat({ you: 0 }), 0)
  assert.equal(youSeat({}), 0)
  assert.equal(youSeat(null), 0)
  assert.equal(youSeat(undefined), 0)
  assert.equal(youSeat({ you: '3' }), 0)
  assert.equal(youSeat({ you: 2.5 }), 0)
})

test('isMyTurn compares the acting seat with the stamped seat', () => {
  assert.equal(isMyTurn({ status: 'playing', toAct: 2, you: 2 }), true)
  assert.equal(isMyTurn({ status: 'playing', toAct: 2, you: 3 }), false)
  assert.equal(isMyTurn({ status: 'playing', toAct: 0 }), true)
  assert.equal(isMyTurn({ status: 'idle', toAct: 2, you: 2 }), false)
  assert.equal(isMyTurn(null), false)
  assert.equal(isMyTurn({ status: 'playing' }), false)
})

test('seatIsMine marks the player at the stamped seat', () => {
  assert.equal(seatIsMine({ seat: 0 }, {}), true)
  assert.equal(seatIsMine({ seat: 2 }, { you: 2 }), true)
  assert.equal(seatIsMine({ seat: 2 }, { you: 3 }), false)
  assert.equal(seatIsMine(null, { you: 2 }), false)
  assert.equal(seatIsMine({}, { you: 0 }), false)
})

test('joinSummary explains who the guest replaced', () => {
  assert.equal(joinSummary(null), '')
  assert.equal(joinSummary({}), '')
  assert.equal(joinSummary({ joined: null }), '')
  assert.equal(
    joinSummary({ joined: { seat: 2, seatLabel: '座位 3', character: '雷军', nickname: '小明' } }),
    '你顶替了 雷军（座位 3）',
  )
  // An older host may omit the seat label; the seat number rebuilds it.
  assert.equal(joinSummary({ joined: { seat: 2, character: '雷军' } }), '你顶替了 雷军（座位 3）')
  assert.equal(joinSummary({ joined: { character: '雷军' } }), '你顶替了 雷军')
  assert.equal(joinSummary({ joined: { seat: 2 } }), '你坐进了 座位 3')
  assert.equal(joinSummary({ joined: { seatLabel: '座位 5' } }), '你坐进了 座位 5')
  assert.equal(joinSummary({ joined: { seat: 2, character: '  ' } }), '你坐进了 座位 3')
})

test('hostRoster lists guests with the character they replaced', () => {
  assert.deepEqual(hostRoster(null), [])
  assert.deepEqual(hostRoster({ enabled: false, guests: [{ seat: 1, name: '小明' }] }), [])
  assert.deepEqual(hostRoster({ enabled: true }), [])
  assert.deepEqual(hostRoster({ enabled: true, guests: [] }), [])
  assert.deepEqual(hostRoster({
    enabled: true,
    guests: [
      { seat: 1, seatLabel: '座位 2', name: '小明', character: '雷军' },
      { seat: 4, seatLabel: '座位 5', name: '阿离', character: '黄仁勋' },
    ],
  }), ['2 号位 雷军 → 小明', '5 号位 黄仁勋 → 阿离'])
  // Older or partial rows degrade instead of printing "undefined".
  assert.deepEqual(hostRoster({
    enabled: true,
    guests: [
      { seat: 1, name: '小明' },
      { seat: 2, character: '达里奥' },
      { seat: 3, name: '同名', character: '同名' },
      { seat: 'x', name: '坏行' },
      null,
    ],
  }), ['2 号位 小明', '3 号位 达里奥', '4 号位 同名'])
})
