import type { NoteAppearance, NoteSkin } from '@cytoid/notes'
import { loadSkin as compileDocument } from '@cytoid/notes'
import * as bodies from './bodies'
import * as judgement from './judgement'
import { createPalette } from './palette'
import * as render from './render'
import * as timing from './timing'
import { tokens } from './tokens'

export * from './bodies'
export * from './judgement'
export * from './palette'
export * from './render'
export * from './skin'
export * from './timing'
export * from './tokens'

const appearance = { ...bodies, ...judgement, ...timing, ...render, createPalette, metrics: tokens }
export const flat = appearance satisfies NoteAppearance

export function loadSkin(json: unknown, fallback: NoteSkin = render.designs): NoteSkin {
  return compileDocument(json, fallback)
}
