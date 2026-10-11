import type { Chart, LevelJson } from './types'
/**
 * Level loading: unpack a `.cytoidlevel` (zip) or fetch a level folder by
 * URL, mirroring the original Cytusol-player behaviour (level.json, per
 * difficulty chart with optional music_override, background blob).
 * Legacy C1 chart text is rejected for now (converter port pending).
 */
import JSZip from 'jszip'

export interface LoadedDifficulty {
  type: string
  name: string
  difficulty: number
  chart: Chart | null
  /** null when the chart is legacy C1 text (needs the converter) */
  legacy: string | null
  audio: Blob | null
}

export interface LoadedLevel {
  title: string
  artist: string
  charter: string
  background: Blob | null
  difficulties: LoadedDifficulty[]
}

function toBlob(data: Blob | null | undefined): Blob | null {
  return data ?? null
}

export async function loadLevelFromZip(file: Blob): Promise<LoadedLevel> {
  const zip = await JSZip.loadAsync(file)
  const levelJsonText = await zip.file('level.json')?.async('string')
  if (!levelJsonText)
    throw new Error('level.json not found in level archive')
  const meta = JSON.parse(levelJsonText) as LevelJson

  const background = toBlob(await zip.file(meta.background?.path)?.async('blob'))

  const difficulties: LoadedDifficulty[] = []
  for (const entry of meta.charts ?? []) {
    const text = await zip.file(entry.path)?.async('string')
    let chart: Chart | null = null
    let legacy: string | null = null
    if (text) {
      try {
        chart = JSON.parse(text) as Chart
        if (!chart.note_list)
          throw new Error('not a C2 chart')
      }
      catch {
        legacy = text
      }
    }
    const audioPath = entry.music_override?.path ?? meta.music?.path
    const audio = toBlob(await zip.file(audioPath)?.async('blob'))
    difficulties.push({
      type: entry.type,
      name: entry.name || entry.type,
      difficulty: entry.difficulty,
      chart,
      legacy,
      audio,
    })
  }
  return {
    title: meta.title ?? '',
    artist: meta.artist ?? '',
    charter: meta.charter ?? '',
    background,
    difficulties,
  }
}

/** Load a level directory served over HTTP (`level.json` + siblings). */
export async function loadLevelFromUrl(baseUrl: string): Promise<LoadedLevel> {
  // plain path concatenation — `new URL(path, base)` breaks when the document
  // base URI is unusable (proxies, custom schemes)
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const res = await fetch(`${base}level.json`)
  if (!res.ok)
    throw new Error(`level.json not found at ${base}`)
  const meta = await res.json() as LevelJson

  const [background, ...pairs] = await Promise.all([
    fetch(encodeURI(`${base}${meta.background.path}`)).then(r => (r.ok ? r.blob() : null)),
    ...meta.charts.map(async (entry) => {
      const chartRes = await fetch(encodeURI(`${base}${entry.path}`))
      const text = chartRes.ok ? await chartRes.text() : null
      let chart: Chart | null = null
      let legacy: string | null = null
      if (text) {
        try {
          chart = JSON.parse(text) as Chart
          if (!chart.note_list)
            throw new Error('not a C2 chart')
        }
        catch {
          legacy = text
        }
      }
      const audioPath = entry.music_override?.path ?? meta.music.path
      const audioRes = await fetch(encodeURI(`${base}${audioPath}`))
      const audio = audioRes.ok ? await audioRes.blob() : null
      return {
        type: entry.type,
        name: entry.name || entry.type,
        difficulty: entry.difficulty,
        chart,
        legacy,
        audio,
      } satisfies LoadedDifficulty
    }),
  ])

  return {
    title: meta.title ?? '',
    artist: meta.artist ?? '',
    charter: meta.charter ?? '',
    background,
    difficulties: pairs,
  }
}
