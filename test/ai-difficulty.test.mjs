// Difficulty policy, as pure functions. The engine feeds both levels the same
// hand snapshot (src/host.js aiState), so these tests pin the only thing that
// differs between "普通" and "老练": the decision policy itself.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTIES,
  difficultyLabel,
  isDifficulty,
  normalChoice,
  sharpChoice,
} from '../src/ai-difficulty.js'

function spot(over) {
  return Object.assign({
    equity: 0.5,
    loose: 0.1,
    bet: 0,
    stack: 100,
    agg: 0.5,
    bluff: 0.1,
    toCall: 0,
    potNow: 30,
    odds: 0,
    currentBet: 0,
    minRaise: 20,
    bb: 20,
    actors: 8,
    roll: 0.5,
  }, over)
}

test('both levels ship and the sharper one is the default', () => {
  assert.deepEqual(DIFFICULTIES.map((d) => d.id), ['normal', 'sharp'])
  assert.equal(DEFAULT_DIFFICULTY, 'sharp')
  assert.equal(isDifficulty('sharp'), true)
  assert.equal(isDifficulty('normal'), true)
  assert.equal(isDifficulty('insane'), false)
  assert.equal(difficultyLabel('normal'), '普通')
  assert.equal(difficultyLabel('sharp'), '老练')
})

test('老练 folds a price that 普通 pays off', () => {
  // Calling 40 into 60 lays 40% break-even equity; the hand has ~33%.
  // 普通 only needs equity >= odds - 0.08 - loose/2, so it calls. 老练 needs
  // equity >= odds + 0.04, so it folds.
  const thin = spot({ equity: 0.33, toCall: 40, potNow: 60, odds: 0.4, currentBet: 40, roll: 0.9, bluff: 0 })
  assert.equal(normalChoice(thin).type, 'call')
  assert.equal(sharpChoice(thin).type, 'fold')
})

test('老练 calls a price it actually beats', () => {
  // Calling 20 into 80 lays 20% break-even equity; the hand has 35%.
  const good = spot({ equity: 0.35, toCall: 20, potNow: 80, odds: 0.2, currentBet: 20, roll: 0.9, bluff: 0 })
  assert.equal(sharpChoice(good).type, 'call')
})

test('老练 bluffs a short table where 普通 just checks', () => {
  // Same hand, same roll: only the number of players still able to act differs.
  const base = { equity: 0.2, toCall: 0, potNow: 30, bluff: 0.2, agg: 0.5, roll: 0.2 }
  assert.equal(sharpChoice(spot(Object.assign({ actors: 2 }, base))).type, 'raise')
  assert.equal(sharpChoice(spot(Object.assign({ actors: 8 }, base))).type, 'check')
  // 普通 never fires a bluff below its own strength threshold.
  assert.equal(normalChoice(spot(Object.assign({ actors: 2 }, base))).type, 'check')
})

test('老练 value-bets a strong hand by pot fraction instead of the whole stack', () => {
  const strong = spot({ equity: 0.8, toCall: 0, potNow: 100, bet: 0, agg: 0.6, roll: 0.1 })
  const choice = sharpChoice(strong)
  assert.equal(choice.type, 'raise')
  // 0.55 + 0.6 * 0.3 = 0.73 of the pot.
  assert.equal(choice.amount, 73)
})

test('老练 semi-bluffs a draw into a bet instead of folding it', () => {
  // 40% equity against a 33% price, but an unmade hand: a raise is legal and
  // the bluff branch fires below the value threshold (0.72).
  const draw = spot({ equity: 0.4, toCall: 30, potNow: 60, odds: 0.333, currentBet: 30, bluff: 0.3, roll: 0.1 })
  const choice = sharpChoice(draw)
  assert.equal(choice.type, 'raise')
})
