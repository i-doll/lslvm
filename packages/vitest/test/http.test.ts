import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'

async function load(source: string) {
  return loadScript({ source })
}

describe('Phase 3 — HTTP requests and responses', () => {
  it('captures llHTTPRequest into s.httpRequests with deterministic keys', async () => {
    const s = await load(`
      key req = "";
      default {
        state_entry() {
          req = llHTTPRequest("https://example.test/api", [], "");
        }
      }
    `)
    s.start()
    expect(s.httpRequests).toHaveLength(1)
    const r = s.httpRequests[0]!
    expect(r.url).toBe('https://example.test/api')
    expect(r.method).toBe('GET')
    expect(r.body).toBe('')
    expect(s.global('req')).toBe(r.key)
    expect(r.key).toMatch(/^http-req-\d{8}$/)
  })

  it('parses HTTP_METHOD, HTTP_MIMETYPE, and HTTP_CUSTOM_HEADER from options', async () => {
    const s = await load(`
      default {
        state_entry() {
          llHTTPRequest(
            "https://example.test/post",
            [
              HTTP_METHOD, "POST",
              HTTP_MIMETYPE, "application/json",
              HTTP_CUSTOM_HEADER, "X-Caller", "logical-firefly"
            ],
            "{\\"hello\\":\\"world\\"}"
          );
        }
      }
    `)
    s.start()
    const r = s.httpRequests[0]!
    expect(r.method).toBe('POST')
    expect(r.mimetype).toBe('application/json')
    expect(r.headers).toEqual([['X-Caller', 'logical-firefly']])
    expect(r.body).toBe('{"hello":"world"}')
  })

  it('respondToHttp delivers an http_response event with the right payload', async () => {
    const s = await load(`
      integer status = 0;
      string body = "";
      key got = "";
      default {
        state_entry() {
          llHTTPRequest("https://example.test/", [], "");
        }
        http_response(key request_id, integer s, list metadata, string b) {
          got = request_id;
          status = s;
          body = b;
        }
      }
    `)
    s.start()
    const reqKey = s.httpRequests[0]!.key
    s.respondToHttp(reqKey, { status: 200, body: 'pong' })
    expect(s.global('status')).toBe(200)
    expect(s.global('body')).toBe('pong')
    expect(s.global('got')).toBe(reqKey)
    expect(s.httpRequests[0]!.fulfilled).toBe(true)
  })

  it('respondToLastHttp targets the most recent request', async () => {
    const s = await load(`
      integer count = 0;
      default {
        state_entry() {
          llHTTPRequest("https://a.test/", [], "");
          llHTTPRequest("https://b.test/", [], "");
        }
        http_response(key request_id, integer s, list metadata, string b) {
          count = count + 1;
        }
      }
    `)
    s.start()
    s.respondToLastHttp({ status: 200, body: 'b' })
    expect(s.global('count')).toBe(1)
    // The first request is still unfulfilled.
    expect(s.httpRequests[0]!.fulfilled).toBe(false)
    expect(s.httpRequests[1]!.fulfilled).toBe(true)
  })

  it('respondToHttp with an unknown key throws', async () => {
    const s = await load(`default { state_entry() {} }`)
    s.start()
    expect(() => s.respondToHttp('http-req-99999999', { status: 200 })).toThrow(
      /unknown HTTP request key/,
    )
  })

  it('multiple requests share a counter and get unique keys', async () => {
    const s = await load(`
      default {
        state_entry() {
          llHTTPRequest("https://example.test/a", [], "");
          llHTTPRequest("https://example.test/b", [], "");
          llHTTPRequest("https://example.test/c", [], "");
        }
      }
    `)
    s.start()
    const keys = s.httpRequests.map((r) => r.key)
    expect(new Set(keys).size).toBe(3)
    expect(keys[0]).toBe('http-req-00000001')
    expect(keys[2]).toBe('http-req-00000003')
  })
})
