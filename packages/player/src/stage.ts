import type { Direction, Palette } from '@cytoid/notes'
import type { ParsedChart } from './chart'
import type { BoardRect } from './layout'
import type { DerivedFrame, DerivedNote, DeriveOptions, Position } from './state'
import { clamp01, createContext, dragLine, group, holdBody, longHoldBody, renderNote } from '@cytoid/notes'
/**
 * Pixi stage for the player: turns `deriveFrame` output into display
 * objects drawn with the design library's vector clips — live, no baking.
 *
 * Layout maps Cytoid ratios to a board rectangle: x 0..1 across the width,
 * ratio y 0..1 bottom→top. Layers bottom→top: drag lines, notes, scanline,
 * bursts. Every visible object is pooled per id and re-synced through the
 * Pixi scene adapter each frame.
 */
import { Container, Text } from 'pixi.js'
import { SceneView } from './pixi-render'
import { deriveFrame, notePos } from './state'

export interface StageOptions {
  palette: Palette
  /** px per design px (1 → click note = 128 px) */
  scale: number
  /** draw judgement text with clear/miss effects */
  judgement: boolean
  /** draw the FAST / SLOW timing label (independent of `judgement`) */
  timing: boolean
  grades?: DeriveOptions['grades']
  timings?: DeriveOptions['timings']
}

/** Which text layers ride on clear / miss effects. */
interface TextOptions { judgement: boolean, timing: boolean }

/** Live play stats for the in-game HUD (play mode only). */
export interface HudData {
  combo: number
  /** 0–100, one decimal */
  accuracy: number
  /** notes judged so far (gates visibility) */
  judged: number
}

/** System UI stack, mirroring the core player's DOM font. */
const HUD_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

/** Layers bottom→top: drag lines, notes, scanline, HUD (bursts ride inside their note view). */
const LAYER_ORDER = ['lines', 'notes', 'scanline', 'hud'] as const

export class PlayStage {
  readonly root = new Container()
  private layers = {
    lines: new Container(),
    notes: new Container(),
    scanline: new Container(),
    hud: new Container(),
  }

  private noteViews = new Map<number, SceneView>()
  private segmentViews = new Map<string, SceneView>()
  private scanlineView = new SceneView()
  private bordersView = new SceneView()
  /** HUD uses plain system-UI text (like the core's DOM combo/score), not the vector font. */
  private comboView = new Container()
  private accView = new Container()
  private comboText = new Text({
    text: '',
    style: { fontFamily: HUD_FONT, fontSize: 20, fill: '#ffffff' },
  })

  private accText = new Text({
    text: '',
    style: { fontFamily: HUD_FONT, fontSize: 20, fill: '#d9dce4' },
  })

  private lastHud: HudData | null = null
  private lastComboChangeT = 0
  private options: StageOptions

  constructor(options: StageOptions) {
    this.options = options
    this.root.addChild(...LAYER_ORDER.map(k => this.layers[k]))
    // borders live at the very bottom of the stack, under drag lines
    this.layers.lines.addChild(this.bordersView)
    this.layers.scanline.addChild(this.scanlineView)
    this.comboText.anchor.set(0.5)
    this.accText.anchor.set(1, 0.5)
    this.comboView.addChild(this.comboText)
    this.accView.addChild(this.accText)
    this.layers.hud.addChild(this.comboView, this.accView)
  }

  setOptions(options: StageOptions) {
    this.options = options
  }

  /** One frame: derive + sync. `board` = note field, `screen` = player box (scanline spans it). */
  update(parsed: ParsedChart, t: number, board: BoardRect, screen: BoardRect, hud?: HudData | null) {
    const { palette, scale, judgement, timing, grades, timings } = this.options
    const frame = deriveFrame(parsed, t, { board, grades, timings })

    this.root.position.set(board.x, board.y)

    // top/bottom boundary lines: 2 px across the full note field, 50% white at
    // the centre fading to the edges (core `#borders` linear gradient,
    // approximated with segmented opacity — flat allows opacity, not gradients)
    this.bordersView.setScene(bordersScene(board.width, board.height))

    // scanline spans the full player width (core `#scanline-position`), not the note field
    if (frame.scanline != null) {
      this.scanlineView.visible = true
      this.scanlineView.position.set(screen.x - board.x, (1 - frame.scanline) * board.height)
      this.scanlineView.setScene(scanlineScene(screen.width))
    }
    else {
      this.scanlineView.visible = false
    }

    this.syncSegments(frame, palette, scale, board)
    this.syncNotes(frame, palette, scale, { judgement, timing }, board, screen)
    this.syncHud(hud ?? null, board, screen, t)
    this.cullUnseen(frame)
  }

  /**
   * Combo + accuracy in the top margin, styled after the core's
   * #combo/#score: system-UI text, font = 0.24 × top margin (one notch
   * smaller than the core's 0.3), `Nx` suffix, a 0.5 s jump on every
   * increment.
   */
  private syncHud(hud: HudData | null, board: BoardRect, screen: BoardRect, t: number) {
    const zoneH = board.y - screen.y
    // sit toward the top of the margin zone (the core pads 15%, we hang at 35%)
    const cy = screen.y - board.y + zoneH * 0.35
    const fontSize = zoneH * 0.24
    const pad = zoneH * 0.24
    if (!hud || hud.combo <= 0) {
      this.comboView.visible = false
    }
    else {
      this.comboView.visible = true
      if (hud.combo !== this.lastHud?.combo)
        this.lastComboChangeT = t
      // core `text-jump`: 0→5% of 0.5s rises to the peak, then settles
      const u = clamp01((t - this.lastComboChangeT) / 0.5)
      const bell = u < 0.05 ? u / 0.05 : 1 - (u - 0.05) / 0.95
      this.comboView.position.set(
        screen.x - board.x + screen.width / 2,
        cy - 0.045 * zoneH * bell,
      )
      this.comboView.scale.set(1 + 0.15 * bell)
      const text = `${hud.combo}x`
      if (this.comboText.text !== text)
        this.comboText.text = text
      this.setHudFontSize(this.comboText, fontSize)
    }
    if (!hud || hud.judged <= 0) {
      this.accView.visible = false
    }
    else {
      this.accView.visible = true
      const text = `${hud.accuracy.toFixed(2)}%`
      if (this.accText.text !== text)
        this.accText.text = text
      this.setHudFontSize(this.accText, fontSize)
      this.accView.position.set(screen.x - board.x + screen.width - pad, cy)
    }
    this.lastHud = hud
  }

  private setHudFontSize(text: Text, px: number) {
    if (Math.abs(Number(text.style.fontSize) - px) > 0.5)
      text.style.fontSize = px
  }

  private syncSegments(frame: DerivedFrame, palette: Palette, scale: number, board: BoardRect) {
    const seen = new Set<string>()
    for (const seg of frame.segments) {
      seen.add(seg.key)
      let view = this.segmentViews.get(seg.key)
      if (!view) {
        view = new SceneView()
        this.segmentViews.set(seg.key, view)
        this.layers.lines.addChild(view)
      }
      const ctx = createContext('drag-child', { palette, direction: seg.direction, scale })
      view.setScene(dragLine(
        {
          x1: seg.from.x - board.x,
          y1: seg.from.y - board.y,
          x2: seg.to.x - board.x,
          y2: seg.to.y - board.y,
          lead: seg.lead,
          trail: seg.trail,
        },
        ctx,
      ))
    }
    for (const [key, view] of this.segmentViews) {
      if (!seen.has(key))
        this.dropSegment(key, view)
    }
  }

  private syncNotes(
    frame: DerivedFrame,
    palette: Palette,
    scale: number,
    text: TextOptions,
    board: BoardRect,
    screen: BoardRect,
  ) {
    // frame.notes is ordered latest→earliest (bottom→top painting order)
    for (let i = 0; i < frame.notes.length; i++) {
      const d = frame.notes[i]!
      let view = this.noteViews.get(d.note.id)
      if (!view) {
        view = new SceneView()
        this.noteViews.set(d.note.id, view)
        this.layers.notes.addChild(view)
      }
      this.layers.notes.setChildIndex(view, i)
      this.syncNote(view, d, palette, scale, text, board, screen)
    }
  }

  private syncNote(
    view: SceneView,
    d: DerivedNote,
    palette: Palette,
    scale: number,
    text: TextOptions,
    board: BoardRect,
    screen: BoardRect,
  ) {
    const note = d.note
    const dir: Direction = note.direction === -1 ? 'down' : 'up'
    const base = { palette, direction: dir, scale, approach: note.duration.fadein }
    const ctx = createContext(d.kind, { ...base, heading: d.heading })
    const parts = []

    // hold body under the head (board-fixed: grows toward the hold end)
    if ((note.kind === 'hold' || note.kind === 'long_hold') && d.state && (d.state.phase === 'enter' || d.state.phase === 'holding')) {
      const progress = d.state.phase === 'holding' ? d.state.progress : 0
      const appear = d.state.phase === 'enter' ? d.state.p : 1
      if (note.kind === 'long_hold') {
        // the pillar spans the full player height (screen), not just the note field
        parts.push(longHoldBody(
          {
            top: Math.max(0, d.pos.y - screen.y),
            bottom: Math.max(0, screen.y + screen.height - d.pos.y),
            progress,
            appear,
            t: d.state.phase === 'holding' ? d.state.t : 0,
            holdDuration: note.timeout - note.time,
          },
          ctx,
        ))
      }
      else {
        const endPos = notePos(note, note.position.endY, board)
        const bodyCtx = createContext(d.kind, { ...base, bodyDirection: endPos.y <= d.pos.y ? 'up' : 'down' })
        parts.push(holdBody(
          {
            length: Math.abs(endPos.y - d.pos.y),
            progress,
            appear,
            t: d.state.phase === 'holding' ? d.state.t : 0,
          },
          bodyCtx,
        ))
      }
    }

    // the note sprite (steady pose while a triggered head follows the chain)
    if (d.follow) {
      parts.push(renderNote(d.kind, { phase: 'enter', p: 1 }, ctx, { judgement: false }))
      // the clear/miss burst stays at the trigger point, on top — only while
      // the effect is actually playing (not after it faded)
      if (d.state) {
        parts.push(group([renderNote(d.kind, d.state, ctx, text)], {
          transform: { x: d.pos.x - d.follow.x, y: d.pos.y - d.follow.y },
        }))
      }
    }
    else if (d.state) {
      // hold clears play where the scanline is the moment the hold ends:
      // the burst is anchored at the note's end position
      const tail = clearAnchor(d, board)
      parts.push(tail
        ? group([renderNote(d.kind, d.state, ctx, text)], { transform: { x: tail.x - d.pos.x, y: tail.y - d.pos.y } })
        : renderNote(d.kind, d.state, ctx, text))
    }

    const live = d.follow ?? d.pos
    view.position.set(live.x - board.x, live.y - board.y)
    view.setScene(parts.length > 1 ? group(parts) : parts[0]!)
  }

  private dropSegment(key: string, view: SceneView) {
    view.destroyView()
    view.destroy()
    this.segmentViews.delete(key)
  }

  private cullUnseen(frame: DerivedFrame) {
    const seenNotes = new Set(frame.notes.map(d => d.note.id))
    for (const [id, view] of this.noteViews) {
      if (!seenNotes.has(id)) {
        view.destroyView()
        view.destroy()
        this.noteViews.delete(id)
      }
    }
    const seenSegs = new Set(frame.segments.map(s => s.key))
    for (const [key, view] of this.segmentViews) {
      if (!seenSegs.has(key))
        this.dropSegment(key, view)
    }
  }

  /** Drop all pooled views (level switch). */
  clear() {
    for (const view of [...this.noteViews.values(), ...this.segmentViews.values(), this.scanlineView, this.bordersView]) {
      view.destroyView()
    }
    for (const view of this.noteViews.values())
      view.destroy()
    this.noteViews.clear()
    for (const view of this.segmentViews.values())
      view.destroy()
    this.segmentViews.clear()
    this.scanlineView.destroyView()
    this.bordersView.destroyView()
  }

  destroy() {
    this.clear()
    this.root.destroy({ children: true })
  }
}

/**
 * Top/bottom boundary lines (core `#borders`): 2 px lines riding the note
 * field's top and bottom edges, white at 50% alpha in the centre fading to
 * transparent at both ends. The CSS linear gradient is approximated with
 * opacity-graded segments (flat convention: opacity yes, gradients no).
 */
/**
 * Board-space anchor of a hold's clear burst: the note's end position — where the
 *  scanline is the moment the hold completes (for the
 *  full-height long-hold pillar that is a line position mid-board, not the screen
 *  edge). Null = play on the note (misses stay on the head: an early release
 *  happens at the scanline).
 */
function clearAnchor(d: DerivedNote, board: BoardRect): Position | null {
  if (d.state?.phase !== 'clear')
    return null
  if (d.note.kind === 'hold' || d.note.kind === 'long_hold')
    return notePos(d.note, d.note.position.endY, board)
  return null
}

function bordersScene(width: number, height: number) {
  const segments = 14
  const line = (y: number) => group(Array.from({ length: segments }, (_, i) => {
    const t = (i + 0.5) / segments
    return {
      type: 'line' as const,
      x1: (width * i) / segments,
      y1: y,
      x2: (width * (i + 1)) / segments,
      y2: y,
      stroke: '#ffffff',
      strokeWidth: 2,
      opacity: 0.5 * (1 - Math.abs(t - 0.5) * 2),
    }
  }))
  return group([line(0), line(height)])
}

/** Horizontal scanline with end caps (board-local, y = 0 at the line). */
function scanlineScene(width: number) {
  const capW = 6
  return group([
    { type: 'line', x1: 0, y1: 0, x2: width, y2: 0, stroke: '#e1e5f5', strokeWidth: 1.5 },
    { type: 'rect', x: -2, y: -capW / 2, w: capW, h: capW, fill: '#e1e5f5' },
    { type: 'rect', x: width + 2 - capW, y: -capW / 2, w: capW, h: capW, fill: '#e1e5f5' },
  ])
}
