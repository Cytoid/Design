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
