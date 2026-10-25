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

The default note skin uses the frame → animation → slot format. See the [format guide](docs/skin.md) and [example skin](docs/skin.example.json). Regenerate it with `pnpm --filter @cytoid/skin-flat gen-skin`.

## Packages

- `@cytoid/notes`: note contracts, scene graph/renderers, palette math and skin runtime. No default skin data or Node rasterizer.
- `@cytoid/skin-flat`: Flat assets, visual tokens, palette defaults, body/text rendering, and design-specific generators.
- `@cytoid/design-tools`: design-independent authoring (`/authoring`), raster baking and Cylheim export.
- `@cytoid/player`: chart playback and Pixi integration; receives an appearance from its caller.

The app selects `flat` from `@cytoid/skin-flat` and passes it as `appearance` to the player. Bake with `bake({ appearance: flat, outDir })` from `@cytoid/design-tools`. Build libraries with `pnpm -r --if-present build`.
