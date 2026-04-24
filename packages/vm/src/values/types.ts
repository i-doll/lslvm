/**
 * LSL value types as represented at runtime.
 *
 * LSL has 7 types: integer, float, string, key, vector, rotation, list.
 * `quaternion` is an alias for `rotation` in some grids.
 * `void` is used here only as a return-type marker; LSL functions that "return void"
 * are actually statements with no value.
 */

export type LslType =
  | 'integer'
  | 'float'
  | 'string'
  | 'key'
  | 'vector'
  | 'rotation'
  | 'list'
  | 'void'

export interface Vector {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface Rotation {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly s: number
}

/**
 * Runtime value carried by the interpreter. We keep it loose because LSL
 * coerces freely between types; callers that need stricter typing should
 * look at the originating type tag from the AST.
 */
export type LslValue =
  | number
  | string
  | Vector
  | Rotation
  | ReadonlyArray<LslValue>

export const ZERO_VECTOR: Vector = Object.freeze({ x: 0, y: 0, z: 0 })
export const ZERO_ROTATION: Rotation = Object.freeze({ x: 0, y: 0, z: 0, s: 1 })
export const NULL_KEY = '00000000-0000-0000-0000-000000000000'

export function defaultValueFor(type: LslType): LslValue | undefined {
  switch (type) {
    case 'integer':
      return 0
    case 'float':
      return 0
    case 'string':
      return ''
    case 'key':
      return NULL_KEY
    case 'vector':
      return ZERO_VECTOR
    case 'rotation':
      return ZERO_ROTATION
    case 'list':
      return []
    case 'void':
      return undefined
  }
}
