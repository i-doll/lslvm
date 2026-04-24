import type { BuiltinImpl } from '../runtime.js'
import { llSay, llShout, llWhisper, llOwnerSay } from './chat.js'
import {
  llSetTimerEvent,
  llSleep,
  llGetTime,
  llGetAndResetTime,
  llResetTime,
} from './time.js'
import { llHTTPRequest, llHTTPResponse } from './http.js'

/**
 * Map of `ll*` name → real implementation. Anything not in this map falls
 * through to the auto-generated stub (returns the documented default value
 * and records the call). User mocks (script.mock(...)) override either.
 */
export const REAL_BUILTINS: Readonly<Record<string, BuiltinImpl>> = {
  llSay,
  llShout,
  llWhisper,
  llOwnerSay,
  llSetTimerEvent,
  llSleep,
  llGetTime,
  llGetAndResetTime,
  llResetTime,
  llHTTPRequest,
  llHTTPResponse,
}
