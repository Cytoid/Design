# cytoid-design

Design & documentation site for Cytoid, built with [Nuxt 4](https://nuxt.com) and the [Nuxt UI docs template](https://docs-template.nuxt.dev) ([Nuxt UI v4](https://ui.nuxt.com) + [Nuxt Content v3](https://content.nuxt.com)).

## Toolchain

- **Node.js** — latest LTS (v24), see `.node-version`
- **pnpm** — latest (v12), pinned via `packageManager`
- **ESLint** — formatting & linting via [`@antfu/eslint-config`](https://github.com/antfu/eslint-config), composed with the Nuxt-generated config and `eslint-plugin-better-tailwindcss`

## Setup

```bash
pnpm install
```

## Development

```bash
pnpm dev
```

## Production build

```bash
pnpm build
pnpm preview
```

## Quality checks

```bash
pnpm lint        # check
pnpm lint:fix    # auto-fix / format
pnpm typecheck
```

## Skin format

The default note skin uses the frame → animation → slot format. Regenerate it with `pnpm --filter @cytoid/skin-flat gen-skin`.

Colors are strings: Hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`), `ring:50`, `theme:400`, or a named scale such as `click:400` / `perfect:400`. Shade levels are 50, 100, 200, 300, 400, 500, 600, 700, 800, 900 and 950. Named scales cover note families and judgement grades; note family colors follow the scan direction. `theme` selects the current note palette in note slots and the grade palette in `clear:*` / `miss` slots, including nested animations. Ring colors use the neutral ring scale; edge shadows remain fixed Hex.

Color tracks use string key values and bind to `fill` / `stroke` through `{ "track": "color" }`. Interpolation happens in OKLab after resolving palette references, with premultiplied alpha. They support the same key timing, easing, offset and rate as numeric key tracks; an optional numeric `driver` samples the color ramp instead of the animation clock.

```json
{
  "type": "layers",
  "tracks": {
    "color": {
      "keys": [
        { "at": 0, "value": "theme:400" },
        { "at": 1, "value": "perfect:400", "ease": { "type": "outCubic" } }
      ]
    }
  },
  "layers": [{ "source": { "frame": "dot" }, "properties": { "fill": { "track": "color" } } }]
}
```

### Images and frame sequences

Animations have an explicit `type`: `layers` for vector composition, or `sequence` for frame playback. A sequence can reference any static frame, including image or group frames:

```json
{
  "frames": {
    "vector-ring": { "type": "circle", "r": 48, "stroke": "theme:400", "strokeWidth": 4 },
    "spark-0": { "type": "image", "src": "assets/spark/000.png", "x": -64, "y": -64, "w": 128, "h": 128 },
    "spark-1": { "type": "image", "src": "assets/spark/001.png", "x": -64, "y": -64, "w": 128, "h": 128 }
  },
  "animations": {
    "spark": { "type": "sequence", "fps": 30, "frames": ["spark-0", "spark-1"] },
    "mixed": {
      "type": "layers",
      "layers": [
        { "source": { "frame": "vector-ring" } },
        { "source": { "animation": "spark" }, "at": 0.1, "until": 0.8, "blend": "add", "properties": { "opacity": 0.75 } }
      ]
    }
  }
}
```

Image rectangles use design coordinates, independently of source pixel resolution. `src` accepts a PNG path relative to the skin JSON or a `data:image/png;base64,...` URI. Images use their original colors; no runtime fonts, atlas coordinates, or tint masks are required.

With `fps`, sequences sample **elapsed seconds**, using `min(floor(max(0, elapsed) * fps), frames.length - 1)`. Without `fps`, a sequence distributes all frames evenly over its parent window: `min(floor(progress * frames.length), frames.length - 1)`. This lets a fully pre-rendered enter sequence adapt to any actual approach duration. With `fps`, a short sequence holds its final frame until the parent window ends; append a transparent frame to hide early. A long sequence stops at the window end without jumping to its last frame. Layer windows preserve an explicitly specified fps; adaptive sequences fit the local window. Explicit `source.sample` mappings opt into retiming: for a sequence, 0..1 maps to its natural `frames.length / fps` duration, so 1..0 plays backwards. Slots retain their fixed duration; approach clips use the actual approach window in seconds.

Prepare resources before compiling; drawing never reads files or fetches images:

```ts
// Browser: baseURL is the absolute URL of skin.json.
const loaded = await loadSkinResources(document, { baseURL })
const skin = compileSkin(loaded)
// For direct previews, specify both clocks; the default is a one-second window.
const preview = compileAnimation(loaded, 'mixed')
preview(0.5, context, { elapsed: 1, duration: 2 })
// After consumers stop using the skin, release decoded images and Pixi textures.
loaded.dispose()
```

`loadSkinFile(filename)` from `@cytoid/design-tools` provides a Node filesystem adapter; the bake CLI's `--skin` option uses it automatically. ZIP/custom loaders can supply `loadSkinResources(document, { resolve, decode })`. Browsers decode PNGs before drawing; a custom platform can supply its own Canvas-compatible decoder. SVG/native baking embeds the prepared PNG data directly. Assets have bounded byte/pixel sizes, and relative paths cannot leave the skin directory.

Normalized clips containing sequences include their zero-time pose when baked, so a source's first frame is preserved. The baked manifest records this sampling rule. The baker's output fps and a sequence's source fps are independent.

### Hold bodies

`hold:body` and `long-hold:body` are required parametric slots on their respective kinds. `compileSkin()` exposes each as `designs[kind].body.draw(options, context)`. Flat's `holdBody(options, context, skin?)` and `longHoldBody(options, context, skin?)` delegate to these slots; the player and native strip baker pass the selected skin through.

Body animations receive `appear`, `progress`, `elapsed`, `duration`, and `remaining`, plus `length` for Hold or `top` / `bottom` for Long Hold. Geometry is in context pixels, clocks in seconds, and progress values in 0..1. `bodyWidth` and `dashPeriod` come from the fixed engine dimensions. Long Hold also receives `collapse`, the fixed final 0.6-second window normalized to 0..1 (short holds use their full duration). Offline strips omit duration and sample collapse over progress 0.86..1 instead.

Hold templates extend along local +y; the engine flips their output for an upward body independently of color direction. Long Hold templates span -top..bottom. Body inputs are only available in body slots, including nested animations. Numeric tracks accept `driver` expressions to sample independent clocks. Driver dependencies must be acyclic and at most 32 tracks deep. Frames and bindings support `dash` / `dashOffset` on stroked shapes and rectangular group clips.

Dimensions, animation durations and palette design remain fixed contracts. Body visibility and exit opacity stay with the engine's note-state composition. The existing native export samples the selected bodies into fixed-period strips; full-length parameterized playback uses the body slots directly. Judgement/timing overlays remain a follow-up; Drag connections retain their existing renderer.

## Packages

- `@cytoid/notes`: note contracts, scene graph/renderers, palette math and skin runtime. No default skin data or Node rasterizer.
- `@cytoid/skin-flat`: Flat assets, visual tokens, palette defaults, body/text rendering, and design-specific generators.
- `@cytoid/design-tools`: design-independent authoring (`/authoring`), raster baking and Cylheim export.
- `@cytoid/player`: chart playback and Pixi integration; receives an appearance from its caller.

The app selects `flat` from `@cytoid/skin-flat` and passes it as `appearance` to the player. Bake with `bake({ appearance: flat, outDir })` from `@cytoid/design-tools`. Build libraries with `pnpm -r --if-present build`.
