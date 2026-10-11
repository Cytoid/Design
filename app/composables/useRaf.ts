import { onMounted, onUnmounted } from 'vue'

export interface Tick { time: number, dt: number }
const listeners = new Set<(tick: Tick) => void>()
let handle = 0
let previous = 0
let time = 0
function frame(now: number) {
  const dt = previous ? Math.min((now - previous) / 1000, 0.05) : 0
  previous = now
  time += dt
  for (const listener of listeners) listener({ time, dt })
  handle = requestAnimationFrame(frame)
}
export function useRaf(callback: (tick: Tick) => void) {
  onMounted(() => {
    listeners.add(callback)
    if (listeners.size === 1) {
      previous = 0
      handle = requestAnimationFrame(frame)
    }
  })
  onUnmounted(() => {
    listeners.delete(callback)
    if (!listeners.size)
      cancelAnimationFrame(handle)
  })
}
