import type { SourceLocation } from './diagnostics.js'

export interface Node {
  readonly loc: SourceLocation
}

// ---- Top level ----

export interface Script extends Node {
  readonly kind: 'Script'
  readonly states: ReadonlyArray<State>
}

export interface State extends Node {
  readonly kind: 'State'
  /** "default" for the default state, otherwise the user-defined name. */
  readonly name: string
  readonly handlers: ReadonlyArray<EventHandler>
}

export interface EventHandler extends Node {
  readonly kind: 'EventHandler'
  readonly name: string
  readonly params: ReadonlyArray<Param>
  readonly body: ReadonlyArray<Statement>
}

export interface Param extends Node {
  readonly kind: 'Param'
  readonly typeName: string
  readonly name: string
}

// ---- Statements ----

export type Statement = ExpressionStatement

export interface ExpressionStatement extends Node {
  readonly kind: 'ExpressionStatement'
  readonly expression: Expression
}

// ---- Expressions ----

export type Expression =
  | IntegerLiteral
  | FloatLiteral
  | StringLiteral
  | Identifier
  | CallExpression

export interface IntegerLiteral extends Node {
  readonly kind: 'IntegerLiteral'
  readonly value: number
}

export interface FloatLiteral extends Node {
  readonly kind: 'FloatLiteral'
  readonly value: number
}

export interface StringLiteral extends Node {
  readonly kind: 'StringLiteral'
  readonly value: string
}

export interface Identifier extends Node {
  readonly kind: 'Identifier'
  readonly name: string
}

export interface CallExpression extends Node {
  readonly kind: 'CallExpression'
  readonly callee: string
  readonly args: ReadonlyArray<Expression>
}
