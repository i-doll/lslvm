import { describe, it, expect } from 'vitest'
import { parse } from '../src/index.js'

describe('parser — Phase 1 minimum', () => {
  it('parses default { state_entry() { llSay(0, "hi"); } }', () => {
    const { script, diagnostics } = parse(
      `default { state_entry() { llSay(0, "hi"); } }`,
      'inline.lsl',
    )
    expect(diagnostics).toEqual([])
    expect(script.states).toHaveLength(1)
    const s = script.states[0]!
    expect(s.name).toBe('default')
    expect(s.handlers).toHaveLength(1)
    const h = s.handlers[0]!
    expect(h.name).toBe('state_entry')
    expect(h.params).toEqual([])
    expect(h.body.kind).toBe('BlockStatement')
    expect(h.body.body).toHaveLength(1)
    const stmt = h.body.body[0]!
    expect(stmt.kind).toBe('ExpressionStatement')
    if (stmt.kind !== 'ExpressionStatement') return
    expect(stmt.expression.kind).toBe('CallExpression')
    if (stmt.expression.kind !== 'CallExpression') return
    expect(stmt.expression.callee).toBe('llSay')
    expect(stmt.expression.args).toHaveLength(2)
    expect(stmt.expression.args[0]).toMatchObject({ kind: 'IntegerLiteral', value: 0 })
    expect(stmt.expression.args[1]).toMatchObject({ kind: 'StringLiteral', value: 'hi' })
  })

  it('parses an event with typed parameters', () => {
    const { script, diagnostics } = parse(
      `default { touch_start(integer num) { llSay(0, "ouch"); } }`,
      'inline.lsl',
    )
    expect(diagnostics).toEqual([])
    const h = script.states[0]!.handlers[0]!
    expect(h.params).toMatchObject([{ typeName: 'integer', name: 'num' }])
  })

  it('handles line/block comments and whitespace', () => {
    const { script, diagnostics } = parse(
      `// hello
      default { /* multi
        line */ state_entry() { llSay(0, "hi"); } }`,
      'inline.lsl',
    )
    expect(diagnostics).toEqual([])
    expect(script.states).toHaveLength(1)
  })

  it('reports a diagnostic with file:line:col on missing semicolon', () => {
    const { diagnostics } = parse(
      `default { state_entry() { llSay(0, "hi") } }`,
      'inline.lsl',
    )
    expect(diagnostics.length).toBeGreaterThan(0)
    const d = diagnostics[0]!
    expect(d.severity).toBe('error')
    expect(d.filename).toBe('inline.lsl')
    expect(d.message).toMatch(/expected ';'/)
    expect(d.loc.line).toBe(1)
  })
})
