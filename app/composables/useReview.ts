import type { Direction, Grade } from '@cytoid/notes'
import { reactive } from 'vue'

export const review = reactive({ direction: 'up' as Direction, grade: 'perfect' as Grade, speed: 1, scale: 0.75, background: 'dark', playing: true, judgement: true })
