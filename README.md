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

With `fps`, sequences sample **elapsed seconds**, using `min(floor(max(0, elapsed) * fps), frames.length - 1)`. Without `fps`, a sequence distributes all frames evenly over its parent window: `min(floor(progress * frames.length), frames.length - 1)`. This lets a fully pre-rendered enter sequence adapt to any actual approach duration. With `fps`, a short sequence holds its final frame until the parent window ends; append a transparent frame to hide early. A long sequence stops at the window end without jumping to its last frame. Layer windows preserve an explicitly specified fps; adaptive sequences fit the local window. Explicit `source.sample` mappings opt into retiming: for a sequence, 0..1 maps to its natural `frames.length / fps` duration, so 1..0 plays backwards. Approach clips use the actual approach window in seconds.

Loop slots wrap their driver around an engine-defined period (e.g. `holdLoop` = 1 s). A binding may override it with an absolute `period` in seconds — `{ "animation": "ripple", "period": 0.5 }` loops twice as fast as the engine default; the skin always authors one full cycle over normalized progress 0..1, and the wrap is a hard cut, so first and last pose must agree for a seamless loop. `period: 0` freezes the loop on its first frame.

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

Dimensions, animation durations and palette design remain fixed contracts. Body visibility and exit opacity stay with the engine's note-state composition. The existing native export samples the selected bodies into fixed-period strips; full-length parameterized playback uses the body slots directly.

### Chain links

`drag-head:chainLink` and `click-drag-head:chainLink` are required loop slots on their respective kinds — the connection between a drag head and the next chain node. `compileSkin()` exposes one compiled template per kind as `designs[kind].chainLink.draw(options, context)`; the engine instantiates it per link. Flat's `chainLink(options, context, skin?)` delegates to these slots.

The template is authored along local +y from the source note (y 0) toward the next node, spanning the full `length` input — a periodic strip, not a fixed sprite: flat's is one dashed line (`dash` = half the period, 50 % duty, gap first at the source, matching Cytoid's 16 px tile verbatim). The only other input is `t`, seconds since the link started growing — the sustain clock for marching patterns (loop slot: the driver wraps around the contract period; `period: 0` freezes, which is what flat binds). Growth and retraction stay engine-private: the lead/trail window is fixed gameplay timing, the engine rotates the template onto the link and clips it to the window, so skins never see or implement it. Endpoint-to-endpoint phase anchoring, the destination cut and layer placement (under the notes, per-link) are likewise engine contracts. The native export tiles one flat-calibrated period (`metrics.stroke.dragLine`; the Cytoid pattern's period equals its width) — skins must stay periodic over it, and non-periodic endpoint ornaments are live-renderer-only, as with body end pieces.

### Active drag heads

`drag-head:active` and `click-drag-head:active` are optional loop slots for a triggered head while it slides along its chain (x = seconds since the trigger). The shipped skin pins them to the enter animation's hit pose with `sample: { from: 1, to: 1 }` and `period: 0` — visually the previous behaviour, where the head held its enter pose at p = 1. Skins can animate the travelling head with any loop animation instead. Unbound designs fall back to the enter pose; click-drag heads in the native renderer keep their pinned-anchor lifecycle (the separate chain indicator owns the chain window).

### Judgement and FAST / SLOW feedback

Every note kind owns three feedback slot groups, named `<kind>:feedback:…`:

- `<kind>:feedback:judgement:<grade>`: judgement text only, for PERFECT / GREAT / GOOD / BAD / MISS.
- `<kind>:feedback:timing:<grade>:<timing>`: FAST / SLOW only, for GREAT / GOOD / BAD.
- `<kind>:feedback:combined:<grade>:<timing>`: judgement text and FAST / SLOW together, for GREAT / GOOD / BAD.

Use lowercase grade and timing names in slot keys. Each binding references an ordinary layers or sequence animation; most kinds can point at the same animation, and the reference is simply repeated per kind. A skin may lay out feedback differently for any note kind — placement is authored around the note origin. Flat lifts drop judgements and a standalone FAST / SLOW just above the capsule's white core; in the combined layout the label stays below the capsule. `theme` resolves to the bound judgement grade palette, including in nested animations. Durations remain the fixed engine judgement durations.

`compileSkin()` returns these clips on each note design as `skin[kind].feedback.judgement[grade]`, `skin[kind].feedback.timing[grade][timing]`, and `skin[kind].feedback.combined[grade][timing]`. `renderFeedback()` selects the variant by `ctx.kind` and picks exactly one mode from the judgement/timing toggles. Both disabled draws no feedback. PERFECT, MISS, or an absent timing state uses judgement-only when enabled. With a fallback skin, an incomplete `(kind, mode)` group inherits that group from the fallback.

Preview, player and baking use the selected skin's feedback clips. The native `cytoid-notes/frames@2` manifest stores the three groups per note kind under `feedback`, with authored placement preserved through each clip's pivot.

## Packages

- `@cytoid/notes`: note contracts, scene graph/renderers, palette math and skin runtime. No default skin data or Node rasterizer.
- `@cytoid/skin-flat`: Flat assets, visual tokens, palette defaults, body/text rendering, and design-specific generators.
- `@cytoid/design-tools`: design-independent authoring (`/authoring`) and raster baking.
- `@cytoid/player`: chart playback and Pixi integration; receives an appearance from its caller.

The app selects `flat` from `@cytoid/skin-flat` and passes it as `appearance` to the player. Bake with `bake({ appearance: flat, outDir })` from `@cytoid/design-tools`. Build libraries with `pnpm -r --if-present build`.
