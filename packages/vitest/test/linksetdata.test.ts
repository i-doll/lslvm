import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'

async function load(source: string) {
  return loadScript({ source })
}

describe('Linkset Data', () => {
  it('write / read round-trips and returns LINKSETDATA_OK', async () => {
    const s = await load(`
      integer rc = -1;
      string got = "";
      default {
        state_entry() {
          rc = llLinksetDataWrite("k", "v");
          got = llLinksetDataRead("k");
        }
      }
    `)
    s.start()
    expect(s.global('rc')).toBe(0)
    expect(s.global('got')).toBe('v')
    expect(s.linksetData.get('k')).toMatchObject({ value: 'v', password: '' })
  })

  it('re-writing the same value returns LINKSETDATA_NOUPDATE and does not fire event', async () => {
    const s = await load(`
      integer events = 0;
      integer rc = -1;
      default {
        state_entry() {
          llLinksetDataWrite("k", "v");
          rc = llLinksetDataWrite("k", "v");
        }
        linkset_data(integer action, string name, string value) {
          events = events + 1;
        }
      }
    `)
    s.start()
    expect(s.global('rc')).toBe(5)
    expect(s.global('events')).toBe(1)
  })

  it('write fires linkset_data with action UPDATE for the writing script', async () => {
    const s = await load(`
      integer act = -1;
      string seenKey = "";
      default {
        state_entry() {
          llLinksetDataWrite("hello", "world");
        }
        linkset_data(integer action, string name, string value) {
          act = action;
          seenKey = name;
        }
      }
    `)
    s.start()
    expect(s.global('act')).toBe(1)
    expect(s.global('seenKey')).toBe('hello')
  })

  it('delete fires DELETE; subsequent read returns ""', async () => {
    const s = await load(`
      integer act = -1;
      string after = "x";
      default {
        state_entry() {
          llLinksetDataWrite("k", "v");
          llLinksetDataDelete("k");
          after = llLinksetDataRead("k");
        }
        linkset_data(integer action, string name, string value) {
          act = action;
        }
      }
    `)
    s.start()
    expect(s.global('act')).toBe(2)
    expect(s.global('after')).toBe('')
  })

  it('protected: read with correct password works, plain read and wrong password return ""', async () => {
    const s = await load(`
      string a = "x";
      string b = "x";
      string c = "x";
      default {
        state_entry() {
          llLinksetDataWriteProtected("k", "v", "pw");
          a = llLinksetDataRead("k");
          b = llLinksetDataReadProtected("k", "pw");
          c = llLinksetDataReadProtected("k", "wrong");
        }
      }
    `)
    s.start()
    expect(s.global('a')).toBe('')
    expect(s.global('b')).toBe('v')
    expect(s.global('c')).toBe('')
  })

  it('ReadProtected returns unprotected entry value regardless of password', async () => {
    const s = await load(`
      string a = "x";
      string b = "x";
      default {
        state_entry() {
          llLinksetDataWrite("k", "v");
          a = llLinksetDataReadProtected("k", "");
          b = llLinksetDataReadProtected("k", "ignored");
        }
      }
    `)
    s.start()
    expect(s.global('a')).toBe('v')
    expect(s.global('b')).toBe('v')
  })

  it('empty-value write to a missing key returns LINKSETDATA_NOTFOUND', async () => {
    const s = await load(`
      integer rc = -1;
      integer events = 0;
      default {
        state_entry() {
          rc = llLinksetDataWrite("missing", "");
        }
        linkset_data(integer action, string name, string value) {
          events = events + 1;
        }
      }
    `)
    s.start()
    expect(s.global('rc')).toBe(4)
    expect(s.global('events')).toBe(0)
  })

  it('plain write over a protected key returns EPROTECTED', async () => {
    const s = await load(`
      integer rc = -1;
      default {
        state_entry() {
          llLinksetDataWriteProtected("k", "v", "pw");
          rc = llLinksetDataWrite("k", "other");
        }
      }
    `)
    s.start()
    expect(s.global('rc')).toBe(3)
    expect(s.linksetData.get('k')?.value).toBe('v')
  })

  it('Reset clears all keys and fires RESET', async () => {
    const s = await load(`
      integer act = -1;
      integer countAfter = -1;
      default {
        state_entry() {
          llLinksetDataWrite("a", "1");
          llLinksetDataWrite("b", "2");
          llLinksetDataReset();
          countAfter = llLinksetDataCountKeys();
        }
        linkset_data(integer action, string name, string value) {
          if (action == 0) act = action;
        }
      }
    `)
    s.start()
    expect(s.global('act')).toBe(0)
    expect(s.global('countAfter')).toBe(0)
    expect(s.linksetData.size).toBe(0)
  })

  it('ListKeys returns keys in insertion order; FindKeys regex-filters', async () => {
    const s = await load(`
      list all = [];
      list found = [];
      default {
        state_entry() {
          llLinksetDataWrite("foo1", "a");
          llLinksetDataWrite("bar",  "b");
          llLinksetDataWrite("foo2", "c");
          all = llLinksetDataListKeys(0, -1);
          found = llLinksetDataFindKeys("^foo", 0, -1);
        }
      }
    `)
    s.start()
    expect(s.global('all')).toEqual(['foo1', 'bar', 'foo2'])
    expect(s.global('found')).toEqual(['foo1', 'foo2'])
  })

  it('LSD persists across llResetScript', async () => {
    const s = await load(`
      string got = "";
      default {
        state_entry() {
          if (llLinksetDataRead("seed") == "") {
            llLinksetDataWrite("seed", "kept");
            llResetScript();
          }
          got = llLinksetDataRead("seed");
        }
      }
    `)
    s.start()
    expect(s.global('got')).toBe('kept')
  })

  it('CountFound counts pattern matches', async () => {
    const s = await load(`
      integer n = -1;
      default {
        state_entry() {
          llLinksetDataWrite("a1", "x");
          llLinksetDataWrite("a2", "x");
          llLinksetDataWrite("b1", "x");
          n = llLinksetDataCountFound("^a");
        }
      }
    `)
    s.start()
    expect(s.global('n')).toBe(2)
  })
})
