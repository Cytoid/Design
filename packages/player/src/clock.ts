/**
 * Playback clocks. `AudioClock` anchors track time to the WebAudio hardware
 * clock (buffer sources are drift-free — the old player's periodic resync is
 * not needed); `ManualClock` is deterministic for tests and silent previews.
 *
 * `AudioClock` works purely in *track time* (position inside the decoded
 * buffer, may be negative to express "starts later"). Mapping track time ↔
 * chart time (`music_offset`, device offset) belongs to the player.
 */

export interface Clock {
  /** current time in seconds */
  readonly time: number
  readonly playing: boolean
  /** playback rate (0.25–2) */
  rate: number
  play: (from?: number) => void
  pause: () => void
}

/** Deterministic clock driven by `advance()` — for tests and silent preview. */
export class ManualClock implements Clock {
  private _time = 0
  private _playing = false
  rate = 1

  get time() {
    return this._time
  }

  get playing() {
    return this._playing
  }

  play(from?: number) {
    if (from !== undefined)
      this._time = from
    this._playing = true
  }

  pause() {
    this._playing = false
  }

  /** Advance by `dt` seconds of wall time if playing. */
  advance(dt: number) {
    if (this._playing)
      this._time += dt * this.rate
  }

  /** Hard-set the time (seek while paused). */
  set(t: number) {
    this._time = t
  }
}

/**
 * WebAudio-backed clock. Time = track position:
 * `t(w) = start + max(0, w − when) × rate`, anchored to the audio context —
 * no drift by construction.
 */
export class AudioClock implements Clock {
  private ctx: AudioContext | null = null
  private buffer: AudioBuffer | null = null
  private source: AudioBufferSourceNode | null = null
  /** ctx.currentTime the source actually starts at (including delay) */
  private when = 0
  /** track position at `when` */
  private start = 0
  private pausedAt = 0
  private _playing = false
  rate = 1

  /** Decode an audio blob; safe to call again to swap the track. */
  async setup(blob: Blob): Promise<void> {
    this.ctx ??= new AudioContext()
    const arrayBuffer = await blob.arrayBuffer()
    this.buffer = await this.ctx.decodeAudioData(arrayBuffer)
  }

  get ready() {
    return this.buffer != null
  }

  /** Length of the decoded track in seconds (0 when not loaded). */
  get length() {
    return this.buffer?.duration ?? 0
  }

  get playing() {
    return this._playing
  }

  get time() {
    if (!this._playing || !this.ctx)
      return this.pausedAt
    const w = this.ctx.currentTime
    return this.start + Math.max(0, w - this.when) * this.rate
  }

  /** (Re)start playback at `audioTime` (negative = delayed start). */
  play(from?: number) {
    if (!this.ctx || !this.buffer)
      return
    const at = from ?? this.time
    this.stopSource()
    const source = this.ctx.createBufferSource()
    source.buffer = this.buffer
    source.playbackRate.value = this.rate
    source.connect(this.ctx.destination)
    const delay = Math.max(-at, 0)
    const offset = Math.max(at, 0)
    this.when = this.ctx.currentTime + delay
    this.start = at
    source.start(this.when, offset)
    source.onended = () => {
      // natural end (not an explicit stop): park at the end of the buffer
      if (this.source === source && this.ctx && this.ctx.currentTime >= this.when)
        this.pauseAt(this.length)
    }
    this.source = source
    this._playing = true
  }

  private pauseAt(t: number) {
    this.pausedAt = t
    this._playing = false
  }

  private stopSource() {
    if (this.source) {
      this.source.onended = null
      try {
        this.source.stop()
      }
      catch {
        // already stopped
      }
      this.source.disconnect()
      this.source = null
    }
  }

  pause() {
    if (this._playing)
      this.pausedAt = this.time
    this.stopSource()
  }

  /** Reposition while paused (paused seek). */
  park(t: number) {
    this.stopSource()
    this.pausedAt = t
  }

  async resumeCtx() {
    if (this.ctx && this.ctx.state === 'suspended')
      await this.ctx.resume()
  }

  destroy() {
    this.stopSource()
    void this.ctx?.close()
    this.ctx = null
    this.buffer = null
  }
}
