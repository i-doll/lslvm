import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'

async function load(source: string) {
  return loadScript({ source })
}

describe('Phase 3 — listens and chat delivery', () => {
  it('llListen registers a handle visible via s.listens', async () => {
    const s = await load(`
      integer h = 0;
      default {
        state_entry() {
          h = llListen(7, "", NULL_KEY, "");
        }
      }
    `)
    s.start()
    expect(s.listens).toHaveLength(1)
    expect(s.listens[0]).toMatchObject({
      handle: 1,
      channel: 7,
      active: true,
    })
    expect(s.global('h')).toBe(1)
  })

  it('deliverChat fires listen handler when filters match', async () => {
    const s = await load(`
      string heard = "";
      key from = "";
      default {
        state_entry() {
          llListen(0, "", NULL_KEY, "");
        }
        listen(integer channel, string name, key id, string message) {
          heard = message;
          from = id;
        }
      }
    `)
    s.start()
    s.deliverChat({
      channel: 0,
      name: 'Alice',
      key: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      message: 'hello',
    })
    expect(s.global('heard')).toBe('hello')
    expect(s.global('from')).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
  })

  it('listen filter on speaker name only delivers matching speakers', async () => {
    const s = await load(`
      integer hits = 0;
      default {
        state_entry() {
          llListen(0, "Alice", NULL_KEY, "");
        }
        listen(integer c, string n, key i, string m) { hits = hits + 1; }
      }
    `)
    s.start()
    s.deliverChat({ channel: 0, name: 'Bob', key: '', message: 'hi' })
    s.deliverChat({ channel: 0, name: 'Alice', key: '', message: 'hi' })
    expect(s.global('hits')).toBe(1)
  })

  it('llListenControl(handle, FALSE) suppresses delivery', async () => {
    const s = await load(`
      integer hits = 0;
      default {
        state_entry() {
          integer h = llListen(0, "", NULL_KEY, "");
          llListenControl(h, FALSE);
        }
        listen(integer c, string n, key i, string m) { hits = hits + 1; }
      }
    `)
    s.start()
    s.deliverChat({ channel: 0, name: 'Alice', key: '', message: 'hi' })
    expect(s.global('hits')).toBe(0)
  })

  it('llListenRemove drops the listen entirely', async () => {
    const s = await load(`
      default {
        state_entry() {
          integer h = llListen(0, "", NULL_KEY, "");
          llListenRemove(h);
        }
      }
    `)
    s.start()
    expect(s.listens).toHaveLength(0)
  })

  it('multiple matching listens all fire', async () => {
    const s = await load(`
      integer hits = 0;
      default {
        state_entry() {
          llListen(0, "", NULL_KEY, "");
          llListen(0, "", NULL_KEY, "");
        }
        listen(integer c, string n, key i, string m) { hits = hits + 1; }
      }
    `)
    s.start()
    s.deliverChat({ channel: 0, name: 'A', key: '', message: 'hi' })
    expect(s.global('hits')).toBe(2)
  })

  it('exact-message filter requires exact match', async () => {
    const s = await load(`
      integer hits = 0;
      default {
        state_entry() {
          llListen(5, "", NULL_KEY, "go");
        }
        listen(integer c, string n, key i, string m) { hits = hits + 1; }
      }
    `)
    s.start()
    s.deliverChat({ channel: 5, name: 'A', key: '', message: 'go away' })
    s.deliverChat({ channel: 5, name: 'A', key: '', message: 'go' })
    expect(s.global('hits')).toBe(1)
  })

  it('NULL_KEY in filter matches any speaker key', async () => {
    const s = await load(`
      integer hits = 0;
      default {
        state_entry() {
          llListen(0, "", NULL_KEY, "");
        }
        listen(integer c, string n, key i, string m) { hits = hits + 1; }
      }
    `)
    s.start()
    s.deliverChat({ channel: 0, name: 'A', key: '11111111-2222-3333-4444-555555555555', message: 'hi' })
    s.deliverChat({ channel: 0, name: 'B', key: 'ffffffff-eeee-dddd-cccc-bbbbbbbbbbbb', message: 'hi' })
    expect(s.global('hits')).toBe(2)
  })
})
