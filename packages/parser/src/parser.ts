import { lex } from './lexer.js'
import type { Token, TokenKind } from './lexer.js'
import type { Diagnostic, SourceLocation } from './diagnostics.js'
import type {
  Script,
  State,
  EventHandler,
  Param,
  Statement,
  Expression,
  CallExpression,
  ExpressionStatement,
} from './ast.js'

const TYPE_KEYWORDS = new Set([
  'integer',
  'float',
  'string',
  'key',
  'vector',
  'rotation',
  'quaternion',
  'list',
])

class Parser {
  private pos = 0
  private readonly diags: Diagnostic[] = []

  constructor(
    private readonly tokens: ReadonlyArray<Token>,
    private readonly filename: string,
  ) {}

  parseScript(): { script: Script; diagnostics: Diagnostic[] } {
    const start = this.peek().loc
    const states: State[] = []
    while (!this.isEOF()) {
      const s = this.parseState()
      if (s) states.push(s)
      else this.recoverToTopLevel()
    }
    return {
      script: { kind: 'Script', loc: start, states },
      diagnostics: this.diags,
    }
  }

  private parseState(): State | null {
    const tok = this.peek()
    let name: string
    let nameLoc: SourceLocation
    if (tok.kind === 'keyword' && tok.text === 'default') {
      name = 'default'
      nameLoc = tok.loc
      this.advance()
    } else if (tok.kind === 'keyword' && tok.text === 'state') {
      this.advance()
      const id = this.expect('identifier', 'expected state name after `state`')
      if (!id) return null
      name = id.text
      nameLoc = id.loc
    } else {
      this.diag(`expected state declaration, got '${tok.text}'`, tok.loc)
      return null
    }

    if (!this.expect('lbrace', "expected '{' to open state body")) return null

    const handlers: EventHandler[] = []
    while (!this.check('rbrace') && !this.isEOF()) {
      const h = this.parseEventHandler()
      if (h) handlers.push(h)
      else this.recoverInsideState()
    }
    this.expect('rbrace', "expected '}' to close state body")

    return { kind: 'State', loc: nameLoc, name, handlers }
  }

  private parseEventHandler(): EventHandler | null {
    const id = this.expect('identifier', 'expected event handler name')
    if (!id) return null
    if (!this.expect('lparen', "expected '(' after event handler name")) return null

    const params: Param[] = []
    while (!this.check('rparen') && !this.isEOF()) {
      const p = this.parseParam()
      if (!p) return null
      params.push(p)
      if (this.check('comma')) this.advance()
      else break
    }
    if (!this.expect('rparen', "expected ')' to close parameter list")) return null
    if (!this.expect('lbrace', "expected '{' to open handler body")) return null

    const body: Statement[] = []
    while (!this.check('rbrace') && !this.isEOF()) {
      const s = this.parseStatement()
      if (s) body.push(s)
      else this.recoverInsideBlock()
    }
    this.expect('rbrace', "expected '}' to close handler body")

    return {
      kind: 'EventHandler',
      loc: id.loc,
      name: id.text,
      params,
      body,
    }
  }

  private parseParam(): Param | null {
    const t = this.peek()
    if (t.kind !== 'keyword' || !TYPE_KEYWORDS.has(t.text)) {
      this.diag(`expected parameter type, got '${t.text}'`, t.loc)
      return null
    }
    this.advance()
    const name = this.expect('identifier', 'expected parameter name')
    if (!name) return null
    return { kind: 'Param', loc: t.loc, typeName: t.text, name: name.text }
  }

  private parseStatement(): Statement | null {
    // Phase 1 only supports expression statements (used for ll* calls).
    const expr = this.parseExpression()
    if (!expr) return null
    if (!this.expect('semi', "expected ';' after expression statement")) return null
    const stmt: ExpressionStatement = {
      kind: 'ExpressionStatement',
      loc: expr.loc,
      expression: expr,
    }
    return stmt
  }

  private parseExpression(): Expression | null {
    return this.parsePrimary()
  }

  private parsePrimary(): Expression | null {
    const t = this.peek()
    if (t.kind === 'integer') {
      this.advance()
      return { kind: 'IntegerLiteral', loc: t.loc, value: t.value as number }
    }
    if (t.kind === 'float') {
      this.advance()
      return { kind: 'FloatLiteral', loc: t.loc, value: t.value as number }
    }
    if (t.kind === 'string') {
      this.advance()
      return { kind: 'StringLiteral', loc: t.loc, value: t.value as string }
    }
    if (t.kind === 'identifier') {
      this.advance()
      // Function call?
      if (this.check('lparen')) {
        this.advance()
        const args: Expression[] = []
        while (!this.check('rparen') && !this.isEOF()) {
          const a = this.parseExpression()
          if (!a) return null
          args.push(a)
          if (this.check('comma')) this.advance()
          else break
        }
        if (!this.expect('rparen', "expected ')' to close call argument list")) return null
        const call: CallExpression = {
          kind: 'CallExpression',
          loc: t.loc,
          callee: t.text,
          args,
        }
        return call
      }
      return { kind: 'Identifier', loc: t.loc, name: t.text }
    }
    this.diag(`unexpected token '${t.text}' in expression`, t.loc)
    return null
  }

  // ---- token helpers ----

  private peek(): Token {
    return this.tokens[this.pos]!
  }

  private advance(): Token {
    const t = this.tokens[this.pos]!
    if (t.kind !== 'eof') this.pos++
    return t
  }

  private isEOF(): boolean {
    return this.peek().kind === 'eof'
  }

  private check(kind: TokenKind): boolean {
    return this.peek().kind === kind
  }

  private expect(kind: TokenKind, message: string): Token | null {
    const t = this.peek()
    if (t.kind === kind) {
      return this.advance()
    }
    this.diag(`${message} (got '${t.text}')`, t.loc)
    return null
  }

  private diag(message: string, loc: SourceLocation): void {
    this.diags.push({ severity: 'error', message, filename: this.filename, loc })
  }

  // ---- recovery (very basic for Phase 1) ----

  private recoverToTopLevel(): void {
    while (!this.isEOF()) {
      const t = this.peek()
      if (t.kind === 'keyword' && (t.text === 'default' || t.text === 'state')) return
      this.advance()
    }
  }

  private recoverInsideState(): void {
    let depth = 0
    while (!this.isEOF()) {
      const t = this.peek()
      if (t.kind === 'lbrace') depth++
      else if (t.kind === 'rbrace') {
        if (depth === 0) return
        depth--
      }
      this.advance()
    }
  }

  private recoverInsideBlock(): void {
    while (!this.isEOF()) {
      const t = this.peek()
      if (t.kind === 'semi') {
        this.advance()
        return
      }
      if (t.kind === 'rbrace') return
      this.advance()
    }
  }
}

export interface ParseResult {
  readonly script: Script
  readonly diagnostics: ReadonlyArray<Diagnostic>
}

export function parse(source: string, filename: string): ParseResult {
  const lexed = lex(source, filename)
  const parser = new Parser(lexed.tokens, filename)
  const { script, diagnostics } = parser.parseScript()
  return {
    script,
    diagnostics: [...lexed.diagnostics, ...diagnostics],
  }
}
