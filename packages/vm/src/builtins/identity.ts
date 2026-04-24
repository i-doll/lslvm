import type { BuiltinImpl } from '../runtime.js'

/** llGetOwner() — script's configured owner key. */
export const llGetOwner: BuiltinImpl = (ctx) => ctx.state.identity.owner
/** llGetCreator() — for our purposes the same as the owner. */
export const llGetCreator: BuiltinImpl = (ctx) => ctx.state.identity.owner
/** llGetKey() — the prim's key (= owner by default; configurable). */
export const llGetKey: BuiltinImpl = (ctx) => ctx.state.identity.objectKey
/** llGetObjectName() — the prim's name. */
export const llGetObjectName: BuiltinImpl = (ctx) => ctx.state.identity.objectName

/** llSetObjectName(string name) — mutates the prim's name. */
export const llSetObjectName: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  ctx.state.identity.objectName = name
  return undefined
}

/** llGetScriptName() — the script's filename (e.g. "greeter.lsl"). */
export const llGetScriptName: BuiltinImpl = (ctx) => ctx.state.identity.scriptName
