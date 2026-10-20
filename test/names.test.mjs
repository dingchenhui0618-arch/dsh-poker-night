// Nickname helpers: generated names look like a poker table, typed names are
// normalized before they can reach a log line or the roster.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NICK_ADJ, NICK_NOUN, normalizeNickname, randomNickname, uniqueNickname } from '../src/names.js'

test('nickname word lists are large enough to feel varied', () => {
  assert.ok(Array.isArray(NICK_ADJ) && NICK_ADJ.length >= 12, 'at least 12 adjectives')
  assert.ok(Array.isArray(NICK_NOUN) && NICK_NOUN.length >= 12, 'at least 12 nouns')
  assert.equal(new Set(NICK_ADJ).size, NICK_ADJ.length)
  assert.equal(new Set(NICK_NOUN).size, NICK_NOUN.length)
  for (const adj of NICK_ADJ) {
    assert.ok(adj.length >= 1 && adj.length <= 3, 'adjective length: ' + adj)
    // The joiner adds the 的 itself, so a stored trailing 的 would double it.
    assert.equal(/的$/.test(adj), false, 'adjective must not end with 的: ' + adj)
  }
  for (const noun of NICK_NOUN) assert.ok(noun.length >= 1 && noun.length <= 3, 'noun length: ' + noun)
})

test('randomNickname composes 形容词 + 的 + 名词 within 2-6 characters', () => {
  assert.equal(randomNickname(() => 0), NICK_ADJ[0] + '的' + NICK_NOUN[0])
  assert.equal(randomNickname(() => 0.999999), NICK_ADJ[NICK_ADJ.length - 1] + '的' + NICK_NOUN[NICK_NOUN.length - 1])
  // A custom random that returns exactly 1 must not fall out of the array.
  assert.equal(randomNickname(() => 1), NICK_ADJ[NICK_ADJ.length - 1] + '的' + NICK_NOUN[NICK_NOUN.length - 1])
  for (let i = 0; i < 50; i++) {
    const name = randomNickname()
    assert.match(name, /^[^的]+的[^的]+$/u)
    const length = Array.from(name).length
    assert.ok(length >= 2 && length <= 6, '2-6 characters, got ' + length + ': ' + name)
  }
  for (const adj of NICK_ADJ) {
    for (const noun of NICK_NOUN) {
      const length = Array.from(adj + '的' + noun).length
      assert.ok(length >= 2 && length <= 6, adj + '的' + noun + ' is ' + length)
    }
  }
})

test('normalizeNickname trims edges, drops control characters, and caps at 12 glyphs', () => {
  assert.equal(normalizeNickname('  小明  '), '小明')
  assert.equal(normalizeNickname('小明！'), '小明')
  assert.equal(normalizeNickname('「小明」'), '小明')
  assert.equal(normalizeNickname('小.明'), '小.明')
  assert.equal(normalizeNickname('  小明\u0000  '), '小明')
  assert.equal(normalizeNickname('小\n明'), '小明')
  // 12 glyphs is plenty for a table name; longer input is cut, not rejected.
  assert.equal(normalizeNickname('abcdefghijklmnop'), 'abcdefghijkl')
  assert.equal(normalizeNickname('!!!abcdefghijklmno'), 'abcdefghijkl')
  // Truncation counts code points, so a surrogate pair is never split.
  const mixed = normalizeNickname('一😀二三四五六七八九十甲乙丙丁')
  assert.equal(Array.from(mixed).length, 12)
  assert.ok(mixed.includes('😀'))
  assert.equal(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(mixed), false)
})

test('normalizeNickname falls back when nothing usable is left', () => {
  assert.equal(normalizeNickname(''), '')
  assert.equal(normalizeNickname('   '), '')
  assert.equal(normalizeNickname('！！！？？？'), '')
  assert.equal(normalizeNickname(null), '')
  assert.equal(normalizeNickname(undefined), '')
  assert.equal(normalizeNickname('', '小明'), '小明')
  assert.equal(normalizeNickname('！！！', '小明'), '小明')
  assert.equal(normalizeNickname(null, '小明'), '小明')
  // An undefined fallback is treated as "no fallback", not the string 'undefined'.
  assert.equal(normalizeNickname('  ', undefined), '')
})

test('uniqueNickname avoids every taken name', () => {
  const first = randomNickname(() => 0)
  assert.equal(uniqueNickname([], () => 0), first)
  assert.equal(uniqueNickname(null, () => 0), first)
  assert.equal(uniqueNickname(new Set(), () => 0), first)
  const taken = new Set([first])
  const second = uniqueNickname(taken, () => 0)
  assert.notEqual(second, first)
  // random() === 0 always yields the same name, so the bounded retries are
  // exhausted and a numeric suffix breaks the tie.
  assert.equal(second, first + '2')
})

test('uniqueNickname keeps trying before falling back to a suffix', () => {
  let calls = 0
  const random = () => {
    calls++
    return calls <= 2 ? 0 : 0.5
  }
  const taken = new Set([randomNickname(() => 0)])
  const picked = uniqueNickname(taken, random)
  assert.equal(picked, randomNickname(() => 0.5))
  assert.equal(calls, 4)
})

test('uniqueNickname skips suffixes that are already taken and stays bounded', () => {
  const base = randomNickname(() => 0)
  const taken = new Set([base, base + '2'])
  let calls = 0
  const picked = uniqueNickname(taken, () => { calls++; return 0 })
  assert.equal(picked, base + '3')
  // 50 name attempts (two draws each) then one more name for the suffix —
  // never unbounded.
  assert.equal(calls, 102)
})
