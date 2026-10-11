import type { Grade, Palette } from '@cytoid/notes'
import type { ParsedChart } from './chart'
import type { Clock } from './clock'
import type { StageOptions } from './stage'
import { tokens } from '@cytoid/notes'
/**
 * Player controller: owns the Pixi application, the playback clock and the
 * parsed chart. Framework-agnostic — the Vue view only calls its API.
 *
 * Chart time ↔ track time mapping follows the original core:
 * `trackTime = chartTime + deviceOffset − musicOffset`.
 */
import { Application } from 'pixi.js'
import { parseChart } from './chart'
import { AudioClock, ManualClock } from './clock'
import { autoplayStats, JudgeEngine } from './judgement'
import { layoutBoard, layoutPlayer, NOTE_HEIGHT_RATIO } from './layout'
import { PlayStage } from './stage'

export interface PlayerOptions {
  palette: Palette
  scale: number
  judgement: boolean
  deviceOffset: number
  /** playback rate 0.25–2 */
  rate: number
  /** play mode: taps are judged; false = autoplay all-perfect */
  playMode?: boolean
  grades?: (index: number) => Grade
}

export class Player {
  readonly app = new Application()
  private stage: PlayStage
  private clock: Clock = new ManualClock()
  private audio: AudioClock | null = null
  private parsed: ParsedChart | null = null
  private judge: JudgeEngine | null = null
  private options: PlayerOptions
  private lastBoard = { x: 0, y: 0, width: 0, height: 0 }
  private lastScreen = { x: 0, y: 0, width: 0, height: 0 }
  private ro: ResizeObserver | null = null

  constructor(options: PlayerOptions) {
    this.options = { playMode: false, ...options }
    this.stage = new PlayStage(this.stageOptions)
  }

  private get stageOptions(): StageOptions {
    return {
      palette: this.options.palette,
      scale: this.options.scale,
      judgement: this.options.judgement,
      grades: this.options.playMode && this.judge
        ? n => this.judge!.gradeOf(n)
        : this.options.grades
          ? (_n, i) => this.options.grades!(i)
          : undefined,
    }
  }

  /** Init the renderer and mount the canvas. */
  async attach(el: HTMLElement) {
    await this.app.init({
      background: '#00000000',
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      resizeTo: el,
      autoDensity: true,
    })
    el.appendChild(this.app.canvas)
    this.app.stage.addChild(this.stage.root)
    this.app.ticker.add(() => this.tick())
    // Pixi's own resizeTo observation can miss late layout changes — track the
    // host ourselves and re-measure whenever it moves
    this.ro = new ResizeObserver(() => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (w > 0 && h > 0)
        this.app.renderer.resize(w, h)
    })
    this.ro.observe(el)
  }

  private tick() {
    if (!this.parsed)
      return
    const clock = this.clock
    if (clock instanceof ManualClock)
      clock.advance(this.app.ticker.deltaMS / 1000)
    if (this.judge) {
      this.judge.setBoard({ width: this.lastBoard.width, height: this.lastBoard.height })
      this.judge.update(this.time)
      if (this.time >= this.parsed.duration)
        this.judge.finalize(this.time)
    }
    this.render()
  }

  private render() {
    if (!this.parsed)
      return
    // logical (CSS px) size — with autoDensity the stage space IS client px,
    // never divide by resolution (v8 renderer.width is already logical)
    const w = this.app.canvas.clientWidth || this.lastScreen.width
    const h = this.app.canvas.clientHeight || this.lastScreen.height
    // player box aspect-clamped 4:3–22:9 + centred; note field inset within it
    this.lastScreen = layoutPlayer(w, h)
    this.lastBoard = layoutBoard(w, h)
    // note size derives from the play area height (core behaviour), the
    // slider is a multiplier on top — never a fixed pixel size
    const scalePx = (this.lastBoard.height * NOTE_HEIGHT_RATIO * this.options.scale) / tokens.unit
    this.judge?.setRadius((this.lastBoard.height * NOTE_HEIGHT_RATIO * this.options.scale) / 2)
    const stageOptions = { ...this.stageOptions, scale: scalePx }
    this.stage.setOptions(stageOptions)
    const stats = this.stats
    const hud = stats && stats.judged > 0
      ? {
          combo: stats.combo,
          accuracy: (100 * (stats.perfect + stats.great * 0.7 + stats.good * 0.3)) / stats.judged,
          judged: stats.judged,
        }
      : null
    this.stage.update(this.parsed, this.time, this.lastBoard, this.lastScreen, hud)
  }

  /** Map chart time → track position (may be negative: delayed audio start). */
  private trackTimeFor(t: number) {
    return t - this.trackOffset()
  }

  /** chart time = track time + musicOffset − deviceOffset */
  private trackOffset() {
    return (this.parsed?.musicOffset ?? 0) - this.options.deviceOffset
  }

  /** Load a parsed chart; replaces any previous one. */
  load(input: Parameters<typeof parseChart>[0], audio?: Blob | null) {
    this.parsed = parseChart(input)
    this.judge = this.options.playMode
      ? this.makeJudge()
      : null
    this.stage.clear()
    this.stage.setOptions(this.stageOptions)
    if (audio) {
      const a = this.audio ?? new AudioClock()
      this.audio = a
      void a.setup(audio)
      this.clock = a
    }
    else {
      this.clock = new ManualClock()
    }
    this.render()
  }

  private makeJudge(): JudgeEngine {
    return new JudgeEngine(this.parsed!, {
      radiusPx: (tokens.unit / 2) * this.options.scale,
      board: { width: this.lastBoard.width, height: this.lastBoard.height },
    })
  }

  get time() {
    if (this.audio && this.audio.ready && this.clock === this.audio)
      return this.audio.time - this.trackOffset()
    return this.clock.time
  }

  get playing() {
    return this.clock.playing
  }

  get duration() {
    if (this.audio && this.audio.ready)
      return this.audio.length + (this.parsed?.musicOffset ?? 0)
    return this.parsed?.duration ?? 0
  }

  updateOptions(o: Partial<PlayerOptions>) {
    const modeChanged = o.playMode !== undefined && o.playMode !== this.options.playMode
    Object.assign(this.options, o)
    if (modeChanged && this.parsed)
      this.judge = this.options.playMode ? this.makeJudge() : null
    if (o.scale !== undefined && this.judge)
      this.judge.setRadius((tokens.unit / 2) * this.options.scale)
    this.stage.setOptions(this.stageOptions)
    if (this.audio && o.deviceOffset !== undefined)
      this.reseedAudio()
  }

  private reseedAudio() {
    if (this.clock === this.audio && this.playing)
      this.play(this.time)
  }

  /** Register a press at board-local px; returns the judged note id or null. */
  press(x: number, y: number, pointerId: number): number | null {
    if (!this.judge)
      return null
    return this.judge.press(x - this.lastBoard.x, y - this.lastBoard.y, this.time, pointerId)
  }

  release(pointerId: number) {
    this.judge?.release(this.time, pointerId)
  }

  /** Pointer move (board-local px): feeds swipe detection for flicks. */
  move(x: number, y: number, pointerId: number): number | null {
    if (!this.judge)
      return null
    return this.judge.move(x - this.lastBoard.x, y - this.lastBoard.y, this.time, pointerId)
  }

  /** Live tally: judged in play mode, autoplay (perfect-at-timeout) otherwise. */
  get stats() {
    if (this.judge)
      return this.judge.score()
    if (!this.parsed)
      return null
    return autoplayStats(this.parsed, this.time, (_n, i) => this.options.grades?.(i) ?? 'perfect')
  }

  /** Player box rect in canvas px (for HUD overlays). */
  get screenRect() {
    return { ...this.lastScreen }
  }

  /** Note field rect in canvas px. */
  get boardRect() {
    return { ...this.lastBoard }
  }

  get playMode() {
    return this.options.playMode ?? false
  }

  setPalette(p: Palette) {
    this.updateOptions({ palette: p })
  }

  play(from?: number) {
    const t = from ?? this.time
    if (this.clock instanceof ManualClock) {
      this.clock.play(t)
    }
    else if (this.audio?.ready) {
      void this.audio.resumeCtx()
      this.audio.rate = this.options.rate
      this.audio.play(this.trackTimeFor(t))
    }
  }

  pause() {
    this.clock.pause()
    this.render()
  }

  /** Seek; keeps playing state. */
  seek(t: number) {
    const target = Math.max(0, t)
    if (this.playing) {
      this.play(target)
    }
    else {
      if (this.clock instanceof ManualClock)
        this.clock.set(target)
      else if (this.audio)
        this.audio.park(this.trackTimeFor(target))
      this.render()
    }
  }

  destroy() {
    this.ro?.disconnect()
    this.ro = null
    this.audio?.destroy()
    this.stage.destroy()
    this.app.destroy(true, { children: true })
  }
}
