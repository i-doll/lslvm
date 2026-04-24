import type {
  Expression,
  Statement,
  EventHandler,
  CallExpression,
} from '@lf/parser'
import type { BuiltinImpl, ScriptState } from './runtime.js'
import { callBuiltin } from './dispatch.js'
import type { LslValue } from './values/types.js'

/**
 * Tree-walking interpreter for the Phase 1 AST subset:
 * event handlers containing expression-statement `ll*` calls with
 * literal arguments. Larger language features land in Phase 2.
 */
export interface InterpreterContext {
  readonly state: ScriptState
  readonly mocks: Readonly<Record<string, BuiltinImpl>>
}

export function execHandler(ctx: InterpreterContext, handler: EventHandler): void {
  for (const stmt of handler.body) {
    execStatement(ctx, stmt)
  }
}

function execStatement(ctx: InterpreterContext, stmt: Statement): void {
  switch (stmt.kind) {
    case 'ExpressionStatement':
      evalExpression(ctx, stmt.expression)
      return
  }
}

function evalExpression(ctx: InterpreterContext, expr: Expression): LslValue | undefined {
  switch (expr.kind) {
    case 'IntegerLiteral':
      return expr.value
    case 'FloatLiteral':
      return expr.value
    case 'StringLiteral':
      return expr.value
    case 'Identifier':
      // Phase 2: variable lookup. For now, surface clearly.
      throw new Error(`identifiers in expression position are not yet supported: ${expr.name}`)
    case 'CallExpression':
      return evalCall(ctx, expr)
  }
}

function evalCall(ctx: InterpreterContext, call: CallExpression): LslValue | undefined {
  const args = call.args.map((a) => evalExpression(ctx, a)) as LslValue[]
  return callBuiltin(ctx.state, ctx.mocks, call.callee, args)
}
