import type {
  Expression,
  Statement,
  EventHandler,
  CallExpression,
  BinaryExpression,
  UnaryExpression,
  AssignmentExpression,
  CastExpression,
  MemberExpression,
  UpdateExpression,
  VectorLiteral,
  RotationLiteral,
  ListLiteral,
  IfStatement,
  WhileStatement,
  DoWhileStatement,
  ForStatement,
  BlockStatement,
  VariableDeclaration,
  TypeName,
} from '@lf/parser'
import type { BuiltinImpl, ScriptState } from './runtime.js'
import { callBuiltin, specFor } from './dispatch.js'
import type { EvalResult, LslType, LslValue, Vector, Rotation } from './values/types.js'
import { defaultEvalFor, isVector, isRotation } from './values/types.js'
import { coerce } from './values/coerce.js'
import { applyBinary, applyUnary, reduceCompound, truthy } from './values/ops.js'
import { Env } from './env.js'

/**
 * Tree-walking interpreter for the language subset shipped in Phase 2.
 * Supports: variables (locals + globals), all binary/unary/assignment/cast/
 * update operators, vector/rotation/list literals, member access, control
 * flow (if/while/do-while/for), `return` (no-op for event handlers), and
 * dispatch into mocked / built-in / stubbed `ll*` functions.
 *
 * Out of scope (deferred to next PR): user function calls, multi-state
 * transitions, jump/labels.
 */

export interface InterpreterContext {
  readonly state: ScriptState
  readonly mocks: Readonly<Record<string, BuiltinImpl>>
  /** Globals environment shared across all event invocations. */
  readonly globals: Env
}

class ReturnSignal {
  constructor(public readonly value: EvalResult | null) {}
}

export function execHandler(
  ctx: InterpreterContext,
  handler: EventHandler,
  args: ReadonlyArray<EvalResult> = [],
): void {
  const env = ctx.globals.push()
  // Bind handler params (each carries declared LSL type).
  handler.params.forEach((p, i) => {
    const a = args[i] ?? defaultEvalFor(p.typeName as LslType)
    env.declare(p.name, p.typeName as LslType, a)
  })
  try {
    execBlock(ctx, env, handler.body)
  } catch (e) {
    if (e instanceof ReturnSignal) return
    throw e
  }
}

function execBlock(ctx: InterpreterContext, env: Env, block: BlockStatement): void {
  const child = env.push()
  for (const stmt of block.body) {
    execStatement(ctx, child, stmt)
  }
}

function execStatement(ctx: InterpreterContext, env: Env, stmt: Statement): void {
  switch (stmt.kind) {
    case 'BlockStatement':
      execBlock(ctx, env, stmt)
      return
    case 'VariableDeclaration':
      execVariableDeclaration(ctx, env, stmt)
      return
    case 'ExpressionStatement':
      evalExpression(ctx, env, stmt.expression)
      return
    case 'IfStatement':
      execIf(ctx, env, stmt)
      return
    case 'WhileStatement':
      execWhile(ctx, env, stmt)
      return
    case 'DoWhileStatement':
      execDoWhile(ctx, env, stmt)
      return
    case 'ForStatement':
      execFor(ctx, env, stmt)
      return
    case 'ReturnStatement': {
      const value = stmt.argument ? evalExpression(ctx, env, stmt.argument) : null
      throw new ReturnSignal(value)
    }
  }
}

function execVariableDeclaration(
  ctx: InterpreterContext,
  env: Env,
  stmt: VariableDeclaration,
): void {
  const init = stmt.init ? evalExpression(ctx, env, stmt.init) : undefined
  env.declare(stmt.name, stmt.typeName as LslType, init)
}

function execIf(ctx: InterpreterContext, env: Env, stmt: IfStatement): void {
  if (truthy(evalExpression(ctx, env, stmt.test))) {
    execStatement(ctx, env, stmt.consequent)
  } else if (stmt.alternate) {
    execStatement(ctx, env, stmt.alternate)
  }
}

function execWhile(ctx: InterpreterContext, env: Env, stmt: WhileStatement): void {
  while (truthy(evalExpression(ctx, env, stmt.test))) {
    execStatement(ctx, env, stmt.body)
  }
}

function execDoWhile(ctx: InterpreterContext, env: Env, stmt: DoWhileStatement): void {
  do {
    execStatement(ctx, env, stmt.body)
  } while (truthy(evalExpression(ctx, env, stmt.test)))
}

function execFor(ctx: InterpreterContext, env: Env, stmt: ForStatement): void {
  const child = env.push()
  for (const e of stmt.init) evalExpression(ctx, child, e)
  while (true) {
    if (stmt.test) {
      if (!truthy(evalExpression(ctx, child, stmt.test))) break
    }
    execStatement(ctx, child, stmt.body)
    for (const e of stmt.update) evalExpression(ctx, child, e)
  }
}

// ---- Expressions ----

function evalExpression(ctx: InterpreterContext, env: Env, expr: Expression): EvalResult {
  switch (expr.kind) {
    case 'IntegerLiteral':
      return { type: 'integer', value: expr.value | 0 }
    case 'FloatLiteral':
      return { type: 'float', value: expr.value }
    case 'StringLiteral':
      return { type: 'string', value: expr.value }
    case 'VectorLiteral':
      return evalVectorLiteral(ctx, env, expr)
    case 'RotationLiteral':
      return evalRotationLiteral(ctx, env, expr)
    case 'ListLiteral':
      return evalListLiteral(ctx, env, expr)
    case 'Identifier':
      return env.get(expr.name)
    case 'CallExpression':
      return evalCall(ctx, env, expr)
    case 'UnaryExpression':
      return applyUnary(expr.operator, evalExpression(ctx, env, expr.argument))
    case 'BinaryExpression':
      return evalBinary(ctx, env, expr)
    case 'AssignmentExpression':
      return evalAssignment(ctx, env, expr)
    case 'CastExpression':
      return coerce(evalExpression(ctx, env, expr.argument), expr.targetType as LslType)
    case 'MemberExpression':
      return evalMember(ctx, env, expr)
    case 'UpdateExpression':
      return evalUpdate(ctx, env, expr)
  }
}

function evalVectorLiteral(ctx: InterpreterContext, env: Env, e: VectorLiteral): EvalResult {
  const x = coerce(evalExpression(ctx, env, e.x), 'float').value as number
  const y = coerce(evalExpression(ctx, env, e.y), 'float').value as number
  const z = coerce(evalExpression(ctx, env, e.z), 'float').value as number
  return { type: 'vector', value: { x, y, z } }
}

function evalRotationLiteral(ctx: InterpreterContext, env: Env, e: RotationLiteral): EvalResult {
  const x = coerce(evalExpression(ctx, env, e.x), 'float').value as number
  const y = coerce(evalExpression(ctx, env, e.y), 'float').value as number
  const z = coerce(evalExpression(ctx, env, e.z), 'float').value as number
  const s = coerce(evalExpression(ctx, env, e.s), 'float').value as number
  return { type: 'rotation', value: { x, y, z, s } }
}

function evalListLiteral(ctx: InterpreterContext, env: Env, e: ListLiteral): EvalResult {
  const elements = e.elements.map((el) => evalExpression(ctx, env, el).value)
  return { type: 'list', value: elements }
}

function evalBinary(ctx: InterpreterContext, env: Env, e: BinaryExpression): EvalResult {
  // LSL: && and || are NOT short-circuit. Eager evaluation matches the language.
  const left = evalExpression(ctx, env, e.left)
  const right = evalExpression(ctx, env, e.right)
  return applyBinary(e.operator, left, right)
}

function evalAssignment(
  ctx: InterpreterContext,
  env: Env,
  e: AssignmentExpression,
): EvalResult {
  const newValue = evalExpression(ctx, env, e.value)
  return assignTo(ctx, env, e.target, e.operator, newValue)
}

function assignTo(
  ctx: InterpreterContext,
  env: Env,
  target: Expression,
  op: '=' | '+=' | '-=' | '*=' | '/=' | '%=',
  rhs: EvalResult,
): EvalResult {
  if (target.kind === 'Identifier') {
    if (op === '=') return env.set(target.name, rhs)
    const current = env.get(target.name)
    return env.set(target.name, reduceCompound(op, current, rhs))
  }
  if (target.kind === 'MemberExpression') {
    return assignToMember(ctx, env, target, op, rhs)
  }
  throw new Error(`invalid assignment target: ${target.kind}`)
}

function assignToMember(
  ctx: InterpreterContext,
  env: Env,
  target: MemberExpression,
  op: '=' | '+=' | '-=' | '*=' | '/=' | '%=',
  rhs: EvalResult,
): EvalResult {
  if (target.object.kind !== 'Identifier') {
    throw new Error('member assignment supported only on identifier targets')
  }
  const current = env.get(target.object.name)
  if (!isVector(current.value) && !isRotation(current.value)) {
    throw new Error(`cannot access member on ${current.type}`)
  }
  const obj = current.value as Vector | Rotation
  const member = target.property
  if (!['x', 'y', 'z', 's'].includes(member)) {
    throw new Error(`unknown member '${member}' (expected x|y|z|s)`)
  }
  if (member === 's' && !isRotation(obj)) {
    throw new Error(`vector has no '.s' component`)
  }
  const oldField: EvalResult = {
    type: 'float',
    value: (obj as unknown as Record<string, number>)[member]!,
  }
  const newField =
    op === '='
      ? coerce(rhs, 'float')
      : reduceCompound(op, oldField, rhs)
  const updated: Record<string, number> = { ...obj, [member]: newField.value as number }
  const wrapped: EvalResult = isRotation(obj)
    ? {
        type: 'rotation',
        value: {
          x: updated.x!,
          y: updated.y!,
          z: updated.z!,
          s: updated.s!,
        },
      }
    : {
        type: 'vector',
        value: { x: updated.x!, y: updated.y!, z: updated.z! },
      }
  env.set(target.object.name, wrapped)
  return newField
}

function evalMember(ctx: InterpreterContext, env: Env, e: MemberExpression): EvalResult {
  const obj = evalExpression(ctx, env, e.object)
  if (!isVector(obj.value) && !isRotation(obj.value)) {
    throw new Error(`cannot access member on ${obj.type}`)
  }
  const v = obj.value as Vector | Rotation
  const member = e.property
  if (member === 's' && !isRotation(v)) {
    throw new Error(`vector has no '.s' component`)
  }
  if (!['x', 'y', 'z', 's'].includes(member)) {
    throw new Error(`unknown member '${member}' (expected x|y|z|s)`)
  }
  return { type: 'float', value: (v as unknown as Record<string, number>)[member]! }
}

function evalUpdate(ctx: InterpreterContext, env: Env, e: UpdateExpression): EvalResult {
  if (e.argument.kind !== 'Identifier' && e.argument.kind !== 'MemberExpression') {
    throw new Error('++/-- only valid on identifiers or member expressions')
  }
  // Get current value
  const current = evalExpression(ctx, env, e.argument)
  const delta: EvalResult = { type: 'integer', value: e.operator === '++' ? 1 : -1 }
  const updated = reduceCompound('+=', current, delta)
  // Write back
  assignTo(ctx, env, e.argument, '=', updated)
  return e.prefix ? updated : current
}

function evalCall(ctx: InterpreterContext, env: Env, call: CallExpression): EvalResult {
  // Evaluate args eagerly (matches LSL semantics).
  const evalArgs = call.args.map((a) => evalExpression(ctx, env, a))
  const rawArgs: LslValue[] = evalArgs.map((r) => r.value)
  const result = callBuiltin(ctx.state, ctx.mocks, call.callee, rawArgs)
  const spec = specFor(call.callee)
  const returnType = (spec?.returnType ?? 'void') as LslType
  if (returnType === 'void') return { type: 'void', value: 0 }
  return { type: returnType, value: result ?? defaultEvalFor(returnType).value }
}
