// End-to-end room test on ephemeral ports: a real guest joins a real table, and
// the only hole cards it can ever read are its own.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { apply, createTable } from '../src/host.js'
import { GUEST_TTL_MS, createRoom, remoteAct, remoteInfo, remoteJoin, remoteLeave, remoteState } from '../src/lan.js'

function stubCtx() {
  return {
    effect(fn) { fn() },
    timeout() { return function () {} },
    get() { return undefined },
  }
}

function cardsOf(snap, seat) {
  const p = snap.players.find((row) => row.seat === seat)
  assert.ok(p, 'seat ' + seat + ' must exist')
  return p.cards.length
}

test('a guest joins by room code, plays the seat it took over, and gives it back', async () => {
  const table = createTable(stubCtx())
  table.start()
  const room = createRoom({ table, name: '测试牌桌', code: '424242', port: 0 })
  const port = await room.start()
  try {
    assert.ok(port > 0)
    const hello = await remoteInfo('127.0.0.1', port)
    assert.equal(hello.room.code, '424242')
    assert.equal(hello.room.players, 8)

    // Wrong code: refused, and no seat is handed out.
    await assert.rejects(() => remoteJoin('127.0.0.1', port, '111111', '闯入者'), (err) => err.status === 403)
    assert.equal(room.guestCount(), 0)

    const joined = await remoteJoin('127.0.0.1', port, '424242', '远程玩家')
    assert.ok(joined.ticket)
    assert.ok(joined.seat > 0, 'a guest never takes the human seat')
    assert.equal(room.guestCount(), 1)

    // The seat is now remote-controlled, so the engine stops betting it.
    const hostSeats = table.availableSeats()
    assert.equal(hostSeats.includes(joined.seat), false)
    const atSeat = table.snapshot(0).players.find((p) => p.seat === joined.seat)
    assert.equal(atSeat.kind, 'guest')
    assert.equal(atSeat.remote, true)

    // ... and gives it back when the guest leaves.
    await remoteLeave('127.0.0.1', port, joined.ticket)
    assert.equal(room.guestCount(), 0)
    assert.equal(table.availableSeats().includes(joined.seat), true)
    assert.equal(table.snapshot(0).players.find((p) => p.seat === joined.seat).kind, 'ai')
  } finally {
    await room.stop()
    table.dispose()
  }
})

test('a guest sees its own hole cards and nobody else sees them', async () => {
  const table = createTable(stubCtx())
  table.start()
  const room = createRoom({ table, name: '测试牌桌', code: '515151', port: 0 })
  await room.start()
  try {
    const port = room.port
    const joined = await remoteJoin('127.0.0.1', port, '515151', '远程玩家')
    const view = await remoteState('127.0.0.1', port, joined.ticket)
    assert.equal(view.seat, joined.seat)
    assert.equal(view.state.status, 'playing')
    // Own two cards, blind to everything else — including the host's own seat.
    assert.equal(cardsOf(view.state, joined.seat), 2)
    for (const p of view.state.players) {
      if (p.seat === joined.seat) continue
      assert.equal(p.cards.length, 0, 'guest must not see seat ' + p.seat)
    }
    const hostView = table.snapshot(0)
    assert.equal(cardsOf(hostView, 0), 2)
    assert.equal(cardsOf(hostView, joined.seat), 0, 'the host must not see the guest cards either')

    // No ticket, no state.
    await assert.rejects(() => remoteState('127.0.0.1', port, ''), (err) => err.status === 401)
    await assert.rejects(() => remoteAct('127.0.0.1', port, '', { type: 'fold' }), (err) => err.status === 401)
  } finally {
    await room.stop()
    table.dispose()
  }
})

test('a guest that stops polling hands its seat back to the bot', async () => {
  const table = createTable(stubCtx())
  table.start()
  let clock = 5_000_000
  const room = createRoom({ table, name: '测试牌桌', code: '626262', port: 0, now: () => clock })
  await room.start()
  try {
    const joined = room.join({ code: '626262', name: '掉线玩家' })
    assert.equal(room.guestCount(), 1)
    assert.equal(table.availableSeats().includes(joined.seat), false)
    // Silence for longer than the TTL: the seat goes back to its character.
    clock += GUEST_TTL_MS + 1
    assert.equal(room.guestCount(), 0)
    assert.equal(table.availableSeats().includes(joined.seat), true)
  } finally {
    await room.stop()
    table.dispose()
  }
})

test('closing a room releases every guest seat and frees the port', async () => {
  const table = createTable(stubCtx())
  table.start()
  const room = createRoom({ table, name: '测试牌桌', code: '737373', port: 0 })
  const port = await room.start()
  const a = room.join({ code: '737373' })
  const b = room.join({ code: '737373' })
  assert.equal(room.guestCount(), 2)
  await room.stop()
  // Two guests never share a seat, and both seats come back to the table.
  assert.notEqual(a.seat, b.seat)
  assert.equal(table.availableSeats().includes(a.seat), true)
  assert.equal(table.availableSeats().includes(b.seat), true)
  await assert.rejects(() => remoteInfo('127.0.0.1', port, 700), () => true)
  table.dispose()
})

test('a guest joins with a nickname, takes over a character, and gets it back', async () => {
  const table = createTable(stubCtx())
  table.start()
  // The table before the guest arrives: who sits where, under which sponsor tag.
  const before = table.snapshot(0).players.map((p) => ({ seat: p.seat, name: p.name, tag: p.tag }))
  const room = createRoom({ table, name: '夜牌', code: '818181', port: 0 })
  const port = await room.start()
  try {
    assert.equal(room.info().name, '夜牌')
    assert.deepEqual(room.info().roster, [])

    const joined = await remoteJoin('127.0.0.1', port, '818181', '  小明！ ')
    // Typed nicknames are normalized before they reach the table.
    assert.equal(joined.nickname, '小明')
    assert.ok(joined.seat > 0, 'a guest never takes the human seat')
    assert.equal(joined.seatLabel, '座位 ' + (joined.seat + 1))
    const original = before.find((p) => p.seat === joined.seat)
    assert.equal(joined.character, original.name)

    const atSeat = table.snapshot(0).players.find((p) => p.seat === joined.seat)
    assert.equal(atSeat.name, '小明')
    assert.equal(atSeat.tag, '远程')
    assert.equal(atSeat.kind, 'guest')
    assert.equal(atSeat.remote, true)

    const view = await remoteState('127.0.0.1', port, joined.ticket)
    assert.equal(view.seat, joined.seat)
    assert.equal(view.nickname, '小明')
    assert.equal(view.character, original.name)
    // The guest's own view identifies that seat as `you`.
    assert.equal(view.state.you, joined.seat)
    assert.equal(view.state.players.find((p) => p.seat === joined.seat).name, '小明')

    const expectedRoster = [{
      seat: joined.seat,
      seatLabel: '座位 ' + (joined.seat + 1),
      name: '小明',
      character: original.name,
    }]
    const info = room.info()
    assert.deepEqual(info.roster, expectedRoster)
    assert.equal(info.guests, 1)
    assert.deepEqual((await remoteInfo('127.0.0.1', port)).room.roster, expectedRoster)

    await remoteLeave('127.0.0.1', port, joined.ticket)
    const restored = table.snapshot(0).players.find((p) => p.seat === joined.seat)
    assert.equal(restored.name, original.name)
    assert.equal(restored.tag, original.tag)
    assert.equal(restored.kind, 'ai')
    assert.equal(restored.remote, false)
    assert.deepEqual(room.info().roster, [])
  } finally {
    await room.stop()
    table.dispose()
  }
})

test('two guests take different seats and the roster tracks both', async () => {
  const table = createTable(stubCtx())
  table.start()
  const room = createRoom({ table, name: '夜牌', code: '919191', port: 0 })
  await room.start()
  try {
    const first = room.join({ code: '919191', name: '甲' })
    const second = room.join({ code: '919191', name: '乙' })
    assert.notEqual(first.seat, second.seat)
    assert.notEqual(first.character, second.character)
    assert.equal(first.seatLabel, '座位 ' + (first.seat + 1))
    assert.equal(second.seatLabel, '座位 ' + (second.seat + 1))

    const roster = room.info().roster
    assert.equal(roster.length, 2)
    // Rows are ordered by seat, so match them by seat instead of join order.
    assert.deepEqual(roster.map((row) => row.seat), [first.seat, second.seat].sort((a, b) => a - b))
    const nameAt = new Map(roster.map((row) => [row.seat, row.name]))
    assert.equal(nameAt.get(first.seat), first.nickname)
    assert.equal(nameAt.get(second.seat), second.nickname)
    for (const row of roster) assert.equal(row.seatLabel, '座位 ' + (row.seat + 1))
  } finally {
    await room.stop()
    table.dispose()
  }
})

test('a guest without a nickname gets a generated one', async () => {
  const table = createTable(stubCtx())
  table.start()
  const room = createRoom({ table, name: '夜牌', code: '929292', port: 0 })
  await room.start()
  try {
    const joined = room.join({ code: '929292' })
    assert.match(joined.nickname, /^[^的]+的[^的]+$/u)
    assert.equal(joined.character.length > 0, true)
    assert.equal(room.info().roster[0].name, joined.nickname)
  } finally {
    await room.stop()
    table.dispose()
  }
})

test('the table stamps `you` and can claim, rename and release a seat', () => {
  const table = createTable(stubCtx())
  try {
    assert.equal(table.snapshot().you, 0)
    assert.equal(table.snapshot(3).you, 3)

    const original = table.snapshot(0).players.find((p) => p.seat === 3)
    assert.equal(table.claimSeat(3, '  小明！ '), original.name)
    const claimed = table.snapshot(0).players.find((p) => p.seat === 3)
    assert.equal(claimed.name, '小明')
    assert.equal(claimed.tag, '远程')
    assert.equal(claimed.kind, 'guest')
    assert.equal(claimed.remote, true)
    // A claimed seat cannot be claimed twice, and the human seat is never sold.
    assert.equal(table.claimSeat(3, '阿离'), false)
    assert.equal(table.claimSeat(0, '阿离'), false)

    assert.equal(table.releaseSeat(3), true)
    const restored = table.snapshot(0).players.find((p) => p.seat === 3)
    assert.equal(restored.name, original.name)
    assert.equal(restored.tag, original.tag)
    assert.equal(restored.kind, 'ai')
    assert.equal(restored.remote, false)
    assert.equal(table.releaseSeat(3), false)

    const botsBefore = table.snapshot(0).players.filter((p) => p.seat > 0).map((p) => p.name)
    const renamed = table.setNickname('  老王  ')
    assert.equal(renamed.you, 0)
    assert.equal(renamed.players.find((p) => p.seat === 0).name, '老王')
    assert.deepEqual(renamed.players.filter((p) => p.seat > 0).map((p) => p.name), botsBefore)
    // Empty or punctuation-only renames leave the current name alone.
    assert.equal(table.setNickname('  ').players.find((p) => p.seat === 0).name, '老王')
    assert.equal(table.setNickname('！！！').players.find((p) => p.seat === 0).name, '老王')
  } finally {
    table.dispose()
  }
})

// ------------------------------------------------------- host HTTP surface

class TestResponse {
  constructor() {
    this.status = 0
    this.headers = {}
    this.body = ''
    this.headersSent = false
  }

  writeHead(status, headers) {
    this.status = status
    this.headers = headers || {}
    this.headersSent = true
  }

  end(body) {
    if (body) this.body += String(body)
  }

  destroy() {}
}

function hostServer() {
  let route = null
  const cleanups = []
  const ctx = {
    effect(fn) {
      const cleanup = fn()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
      return cleanup
    },
    timeout() {
      return function () {}
    },
    get() {
      return undefined
    },
    webServer: {
      register(spec) {
        route = spec.handler
        return function () { route = null }
      },
    },
  }
  apply(ctx)
  return {
    route() {
      assert.ok(route)
      return route
    },
    dispose() {
      for (let i = cleanups.length - 1; i >= 0; i--) cleanups[i]()
    },
  }
}

async function hostRequest(route, options = {}) {
  const body = options.body == null ? '' : options.body
  const req = Readable.from(body ? [Buffer.from(body)] : [])
  req.method = options.method || 'GET'
  req.url = options.url || '/dsh-poker-night'
  req.headers = Object.assign({ host: 'holdem.test' }, options.headers || {})
  if (req.method === 'POST') req.headers['content-length'] = String(Buffer.byteLength(body))
  req.socket = { encrypted: false }
  const res = new TestResponse()
  await route(req, res)
  let parsed = null
  try { parsed = JSON.parse(res.body) } catch (err) {}
  return { res, body: parsed }
}

test('LAN mode scans, hosts, renames and stops over the HTTP surface', async (t) => {
  const server = hostServer()
  t.after(() => server.dispose())
  const route = server.route()
  const boot = await hostRequest(route)
  const session = {
    cookie: boot.res.headers['set-cookie'][0].split(';', 1)[0],
    csrf: boot.res.headers['x-csrf-token'],
  }
  const post = (args) => hostRequest(route, {
    method: 'POST',
    url: '/dsh-poker-night/lan',
    headers: {
      'content-type': 'application/json',
      cookie: session.cookie,
      'x-csrf-token': session.csrf,
      origin: 'http://holdem.test',
    },
    body: JSON.stringify(args),
  })

  // Every browser-facing response says which seat this browser owns.
  assert.equal(boot.body.you, 0)
  assert.deepEqual(boot.body.lan.roster, [])
  assert.deepEqual(boot.body.lan.guests, [])
  assert.equal(boot.body.lan.discovery, '')

  // Scanning for tables works without opening a room, and announces nothing.
  const scan = await post({ mode: 'scan' })
  assert.equal(scan.res.status, 200)
  assert.equal(scan.body.lan.enabled, false)
  assert.equal(scan.body.lan.code, '')
  assert.equal(scan.body.lan.port, 0)
  assert.ok(['udp', 'degraded'].includes(scan.body.lan.discovery))
  assert.equal(scan.body.you, 0)

  // Hosting adopts the room name as the host's own nickname.
  const enabled = await post({ mode: 'enable', name: '  夜牌  ', port: 0 })
  assert.equal(enabled.res.status, 200)
  assert.equal(enabled.body.lan.enabled, true)
  assert.equal(enabled.body.lan.name, '夜牌')
  assert.match(enabled.body.lan.code, /^[0-9]{6}$/)
  assert.ok(enabled.body.lan.port > 0)
  assert.ok(['udp', 'degraded'].includes(enabled.body.lan.discovery))
  assert.equal(enabled.body.players.find((p) => p.seat === 0).name, '夜牌')
  assert.equal(enabled.body.you, 0)

  // Only the host may rename, and the new name lands on seat 0.
  const renamed = await post({ mode: 'rename', name: '老王' })
  assert.equal(renamed.res.status, 200)
  assert.equal(renamed.body.players.find((p) => p.seat === 0).name, '老王')
  assert.equal(renamed.body.you, 0)

  const disabled = await post({ mode: 'disable' })
  assert.equal(disabled.res.status, 200)
  assert.equal(disabled.body.lan.enabled, false)
  assert.equal(disabled.body.lan.discovery, '')

  // A joiner (no room) cannot rename.
  const denied = await post({ mode: 'rename', name: '老王' })
  assert.equal(denied.res.status, 400)
  assert.equal(denied.body.error, '只有主机可以改名')

  // A custom room code must be exactly six digits.
  const badCode = await post({ mode: 'enable', code: '12', port: 0 })
  assert.equal(badCode.res.status, 400)
  assert.equal(badCode.body.error, '房间号需要 6 位数字')
  const fixedCode = await post({ mode: 'enable', code: '123 456', port: 0 })
  assert.equal(fixedCode.res.status, 200)
  assert.equal(fixedCode.body.lan.code, '123456')
  assert.equal(fixedCode.body.lan.name.length > 0, true)
  await post({ mode: 'disable' })
})

async function hostSession(route) {
  const boot = await hostRequest(route)
  return {
    cookie: boot.res.headers['set-cookie'][0].split(';', 1)[0],
    csrf: boot.res.headers['x-csrf-token'],
    boot,
  }
}

function lobbyPost(route, session, args) {
  return hostRequest(route, {
    method: 'POST',
    url: '/dsh-poker-night/lan',
    headers: {
      'content-type': 'application/json',
      cookie: session.cookie,
      'x-csrf-token': session.csrf,
      origin: 'http://holdem.test',
    },
    body: JSON.stringify(args),
  })
}

test('a joining session plays the host table and knows its own seat', async (t) => {
  const server = hostServer()
  t.after(() => server.dispose())
  const route = server.route()
  const host = await hostSession(route)
  const guest = await hostSession(route)

  const enabled = await lobbyPost(route, host, { mode: 'enable', name: '夜牌', port: 0 })
  assert.equal(enabled.res.status, 200)
  const port = enabled.body.lan.port
  const code = enabled.body.lan.code

  try {
    const joined = await lobbyPost(route, guest, {
      mode: 'join',
      host: '127.0.0.1',
      port: port,
      code: code,
      name: '  小明！ ',
    })
    assert.equal(joined.res.status, 200)
    const joinedSeat = joined.body.lan.joined.seat
    // The browser learns its seat from `you`, not from seat 0.
    assert.ok(joinedSeat > 0)
    assert.equal(joined.body.you, joinedSeat)
    assert.equal(joined.body.lan.joined.seatLabel, '座位 ' + (joinedSeat + 1))
    assert.equal(joined.body.lan.joined.nickname, '小明')
    assert.equal(joined.body.lan.joined.table, '夜牌')
    assert.equal(joined.body.lan.joined.character.length > 0, true)

    const mine = joined.body.players.find((p) => p.seat === joinedSeat)
    assert.equal(mine.name, '小明')
    assert.equal(mine.kind, 'guest')
    assert.equal(mine.remote, true)
    // Nobody else's seat is marked as the guest's.
    assert.equal(joined.body.players.filter((p) => p.seat === joinedSeat).length, 1)

    // The next poll keeps the same identity.
    const poll = await hostRequest(route, {
      headers: { cookie: guest.cookie, 'x-csrf-token': guest.csrf },
    })
    assert.equal(poll.body.you, joinedSeat)
    assert.equal(poll.body.lan.joined.seat, joinedSeat)

    // The host sees who took which character.
    const hostView = await hostRequest(route, { headers: { cookie: host.cookie } })
    assert.equal(hostView.body.you, 0)
    assert.deepEqual(hostView.body.lan.roster.map((row) => row.seat), [joinedSeat])
    assert.equal(hostView.body.lan.roster[0].name, '小明')
    assert.equal(hostView.body.lan.roster[0].character, joined.body.lan.joined.character)
    assert.deepEqual(hostView.body.lan.guests, hostView.body.lan.roster)

    // Leaving hands the seat back and returns this browser to seat 0.
    const left = await lobbyPost(route, guest, { mode: 'leave' })
    assert.equal(left.res.status, 200)
    assert.equal(left.body.you, 0)
    assert.equal(left.body.lan.joined, null)
    const restored = await hostRequest(route, { headers: { cookie: host.cookie } })
    assert.deepEqual(restored.body.lan.roster, [])
    assert.equal(restored.body.players.find((p) => p.seat === joinedSeat).kind, 'ai')
  } finally {
    await lobbyPost(route, host, { mode: 'disable' })
  }
})

test('a guest whose ticket expired falls back to its own table', async () => {
  // The room clock is injectable, so the guest TTL can pass without waiting.
  let clock = 1_000_000
  const table = createTable(stubCtx())
  const room = createRoom({ table, name: '夜牌', code: '939393', port: 0, now: () => clock })
  const port = await room.start()
  const server = hostServer()
  try {
    const route = server.route()
    const guest = await hostSession(route)
    const joined = await lobbyPost(route, guest, {
      mode: 'join',
      host: '127.0.0.1',
      port: port,
      code: '939393',
      name: '小明',
    })
    assert.equal(joined.res.status, 200)
    const seat = joined.body.lan.joined.seat
    assert.ok(seat > 0)
    assert.equal(joined.body.you, seat)
    assert.equal(room.guestCount(), 1)

    // Past the guest TTL the host forgets the ticket, so the next poll is a 401.
    clock += GUEST_TTL_MS + 1
    let view = null
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
      view = await hostRequest(route, { headers: { cookie: guest.cookie, 'x-csrf-token': guest.csrf } })
      if (view.body.lan.joined === null) break
      await new Promise((resolve) => setTimeout(resolve, 40))
    }

    // The proxy is dropped, the browser is back on its own seat, and the reason
    // stays visible in the LAN panel instead of an endless retry loop.
    assert.ok(view, 'a view came back')
    assert.equal(view.body.lan.joined, null)
    assert.equal(view.body.you, 0)
    assert.equal(view.body.lan.error, '与主机失去联系，已退回自己的牌桌')
    assert.equal(view.body.lan.enabled, false)
    assert.equal(view.body.players.length, 8)
    // The host gave the seat back when the ticket expired.
    assert.equal(room.guestCount(), 0)
    assert.equal(table.availableSeats().includes(seat), true)
    // The local table is usable again: no more "joined a remote table" refusal.
    const started = await hostRequest(route, {
      method: 'POST',
      url: '/dsh-poker-night/start',
      headers: {
        'content-type': 'application/json',
        cookie: guest.cookie,
        'x-csrf-token': guest.csrf,
        origin: 'http://holdem.test',
      },
      body: '{}',
    })
    assert.equal(started.res.status, 200)
    assert.equal(started.body.status, 'playing')
    assert.equal(started.body.you, 0)
  } finally {
    await room.stop()
    server.dispose()
  }
})

test('a plain connection failure keeps the guest on the remote table', async () => {
  const table = createTable(stubCtx())
  const room = createRoom({ table, name: '夜牌', code: '949494', port: 0 })
  const port = await room.start()
  const server = hostServer()
  try {
    const route = server.route()
    const guest = await hostSession(route)
    const joined = await lobbyPost(route, guest, {
      mode: 'join',
      host: '127.0.0.1',
      port: port,
      code: '949494',
      name: '小明',
    })
    assert.equal(joined.res.status, 200)
    // The host goes away without ever rejecting the ticket (network trouble).
    await room.stop()
    let view = null
    const deadline = Date.now() + 4000
    while (Date.now() < deadline) {
      view = await hostRequest(route, { headers: { cookie: guest.cookie, 'x-csrf-token': guest.csrf } })
      if (view.body.lan.error) break
      await new Promise((resolve) => setTimeout(resolve, 40))
    }
    assert.ok(view.body.lan.error, 'the failure is reported')
    assert.match(view.body.lan.error, /^与主机失去联系/)
    // Only a rejected ticket drops the proxy; a dropped connection keeps waiting.
    assert.ok(view.body.lan.joined)
    assert.equal(view.body.you, joined.body.you)
    // Manual leave still cleans up.
    const left = await lobbyPost(route, guest, { mode: 'leave' })
    assert.equal(left.body.lan.joined, null)
    assert.equal(left.body.you, 0)
  } finally {
    await room.stop()
    server.dispose()
  }
})
