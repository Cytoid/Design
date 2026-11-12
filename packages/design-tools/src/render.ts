import { Resvg } from '@resvg/resvg-js'

export function rasterizeSvg(svg: string, options: { loadSystemFonts?: boolean } = {}) {
  return new Resvg(svg, { fitTo: { mode: 'original' }, font: { loadSystemFonts: options.loadSystemFonts ?? false } }).render().asPng()
}
