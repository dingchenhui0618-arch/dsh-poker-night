// Difficulty and seat rotation at the table level: the two requirements that
// made this release — every restart re-seats the characters, and the stronger
// level is the default while the old one stays one click away.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTable } from '../src/host.js'
import { finishHand, harness, playBots, post, seedRandom, state } from './harness.mjs'

// Minimal ctx stub: no llm (bots stay heuristic), no timer, no server.
function stubCtx() {
  return {
    effect(fn) { fn() },
    timeout() { return function () {} },
    get() { return undefined },
  }
}

function seating(snap) {
  return snap.players.map((p) => p.name).join(',')
}

test('a fresh table starts on 老练 and still offers 普通', () => {
  const snap = createTable(stubCtx()).snapshot()
  assert.equal(snap.difficulty, 'sharp')
  assert.deepEqual(snap.difficultyOptions.map((o) => o.id), ['normal', 'sharp'])
})

test('switching levels is reflected in the snapshot', () => {
  const table = createTable(stubCtx())
  table.setDifficulty('normal')
  assert.equal(table.snapshot().difficulty, 'normal')
  table.setDifficulty('sharp')
  assert.equal(table.snapshot().difficulty, 'sharp')
})

test('an unknown level is rejected', () => {
  const table = createTable(stubCtx())
  assert.throws(() => table.setDifficulty('insane'), /unknown difficulty/)
})

test('start and reset both return to the default level', () => {
  const table = createTable(stubCtx())
  table.setDifficulty('normal')
  table.start()
  assert.equal(table.snapshot().difficulty, 'sharp', 'a new table is 老练 again')
  table.setDifficulty('normal')
  table.reset()
  assert.equal(table.snapshot().difficulty, 'sharp', 'a reset is 老练 again')
})

test('every start re-seats the characters, with no fixed order', () => {
  const real = Math.random
  try {
    Math.random = seedRandom(11)
    const first = seating(createTable(stubCtx()).start())
    Math.random = seedRandom(12)
    const second = seating(createTable(stubCtx()).start())
    assert.notEqual(first, second, 'two tables must not share one seating: ' + first)
    // Same seed, same order: the shuffle draws from Math.random instead of
    // replaying a constant list that merely looks random.
    Math.random = seedRandom(12)
    const again = seating(createTable(stubCtx()).start())
    assert.equal(again, second)
  } finally {
    Math.random = real
  }
})

test('the hero stays in seat 0 however the bots are seated', () => {
  const real = Math.random
  try {
    for (let seed = 1; seed <= 8; seed++) {
      Math.random = seedRandom(seed)
      const snap = createTable(stubCtx()).start()
      const hero = snap.players.filter((p) => p.seat === 0)
      assert.equal(hero.length, 1)
      assert.equal(hero[0].kind, 'human')
      assert.equal(hero[0].name, 'you')
      const bots = snap.players.filter((p) => p.seat > 0).map((p) => p.name)
      assert.equal(bots.length, 7)
      assert.equal(new Set(bots).size, 7, 'each character sits exactly once')
    }
  } finally {
    Math.random = real
  }
})

test('reset re-seats too, so 重置 visibly moves people', () => {
  const real = Math.random
  try {
    const table = createTable(stubCtx())
    table.start()
    const before = seating(table.snapshot())
    let changed = false
    for (let seed = 100; seed < 108 && !changed; seed++) {
      Math.random = seedRandom(seed)
      table.reset()
      if (seating(table.snapshot()) !== before) changed = true
    }
    assert.ok(changed, 'reset never changed the seating')
  } finally {
    Math.random = real
  }
})

test('the 老练 prompt carries the break-even price', async () => {
  const h = harness({ type: 'call', talk: '看看' })
  try {
    const snap = await playBots(h, 1)
    assert.equal(snap.difficulty, 'sharp')
    const prompt = h.prompts[h.prompts.length - 1]
    assert.match(prompt, /底池赔率（老练档）/)
  } finally {
    h.dispose()
  }
})

test('switching to 普通 drops the price line from the prompt', async () => {
  const h = harness({ type: 'call', talk: '看看' })
  try {
    await playBots(h, 1)
    const over = await finishHand(h, 'fold')
    await post(h, 'difficulty', { value: 'normal' })
    assert.equal((await state(h)).difficulty, 'normal')
    const before = h.prompts.length
    if (over.status === 'hand-over') await post(h, 'next-hand')
    for (let i = 0; i < 400 && h.prompts.length === before; i++) {
      const snap = await state(h)
      if (snap.status !== 'playing') break
      if (snap.toAct === 0) {
        await post(h, 'act', { type: 'fold' })
        continue
      }
      await new Promise((r) => setTimeout(r, 3))
    }
    const prompt = h.prompts[h.prompts.length - 1]
    assert.ok(prompt, 'the bots should have been asked again')
    assert.ok(!/底池赔率/.test(prompt), '普通 must keep the original prompt')
  } finally {
    h.dispose()
  }
})
