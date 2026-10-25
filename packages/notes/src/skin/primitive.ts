import type { Frame, Properties } from './schema'

type Bindings<T> = T extends unknown ? {
  [K in keyof T]: K extends keyof Properties ? Exclude<Properties[K], undefined> : T[K]
} : never

/** Internal bound frame, evaluated directly without an intermediate document grammar. */
export type Primitive = Bindings<Exclude<Frame, { type: 'group' }>>
  | (Omit<Bindings<Extract<Frame, { type: 'group' }>>, 'children'> & { children?: Primitive[] })
