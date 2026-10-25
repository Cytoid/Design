# Skin format

默认皮肤已使用 `frame → animation → slot` 三层格式。现有 Lab、player、SVG / Canvas / Pixi 渲染器和 PNG / Cylheim 烘焙仍消费同一套 `NoteDesign` / `Clip` / `SceneNode` 接口。

[完整示例](skin.example.json) 定义 click 与 click-drag-head，共用 frame 和 animation；其他 kind 由 `loadSkin` 按整个 kind 回退到内置皮肤。该示例用于展示语法，视觉不是内置 flat 设计的复制。

## 加载和预览

```ts
import { compileAnimation } from '@cytoid/notes'
import { createContext, loadSkin } from '@cytoid/skin-flat'

const designs = loadSkin(document)
const context = createContext('click')
const scene = designs.click.enter.draw(0.5, context)

// 无需覆盖全部游戏 slot，也可直接预览一个动画。
const preview = compileAnimation(document, 'clickEnter')
const frame = preview(0.5, context)
```

`parseSkin(unknown)` 校验文档结构；`compileSkin(unknown, fallback?)` 进一步校验引用、属性、时间、上下文和 slot 覆盖，并输出全部 note kinds。`@cytoid/notes` 的 `loadSkin` 只读取当前 schema，可显式传入 fallback；`@cytoid/skin-flat` 的同名便利函数默认使用 Flat 作为 fallback。无效引用等错误会抛出，不会默默回退；缺少必需 slot 的 kind 才整体回退。

组合渲染调用 `renderNote(kind, state, context, { skin: designs })`；`holdBodyAlpha` 的第三个参数也可传 designs。播放器通过 `PlayerOptions.appearance` 选择设计（例如 `appearance: flat`），并支持 `PlayerOptions.skin`，可通过 `player.updateOptions({ skin: designs })` 切换。`bake({ appearance: flat, skin: designs, outDir: ... })`（从 `@cytoid/design-tools` 导入） 会对 native sheets 与 Cylheim 输出同时应用皮肤。没有传 skin 时使用所选 appearance 的 designs。`flat` 从 `@cytoid/skin-flat` 导入。

命令行烘焙示例（从仓库根目录运行）：

```sh
pnpm --filter @cytoid/design-tools bake --appearance ../skin-flat/src/index.ts --skin ../../docs/skin.example.json --out /tmp/my-cytoid-skin --kinds click --dirs up --no-frames
```

没有 fallback 的 `compileSkin` 要求所有 kind 都具备 enter 和四种 clear。如果定义任意 hold 层，还必须同时提供 press、progress。exit、miss、loopUnder、loopOver 为可选 slot。preview 不自动提供 slot 专属的 `exitRewindEnd`；预览实际 exit 应调用对应 `Clip.draw`。

## 文档结构

```json
{
  "schemaVersion": 2,
  "id": "my-skin",
  "name": "My skin",
  "frames": {},
  "animations": {},
  "slots": {}
}
```

可选 `meta` 记录 palette / grades 作者意图，实际调色由消费者的 `DrawContext` 决定。所有对象严格拒绝未知字段；名字是普通标识符，不解释为代码或属性路径。

## Frame

静态图元：circle、arc、rect、line、poly、ring、group。数值字段只能写数字；不允许 frame 引用 track 或 input。group 可以包含静态 children；需要单独运动的部分应拆成 frame，在 animation 中组合。

沿用现有设计坐标：click 直径为 128，原点在 note 中心，x 向右、y 向下；角度为弧度，圆弧的 0 在正上方、顺时针增加。保持这一坐标系统使既有烘焙与消费者继续兼容。实例可使用 transform 缩放；若需跟随运行时尺寸，可在 animation 中引用几何 input。

```json
{
  "type": "poly",
  "points": [
    { "x": 0, "y": -40 },
    { "x": 40, "y": 0 },
    { "x": 0, "y": 40 },
    { "x": -40, "y": 0 }
  ],
  "closed": true,
  "fill": { "palette": "fill" }
}
```

圆弧、线段需要 stroke 和 strokeWidth（可由 animation 补充）；ring 需要 stroke、width、segments、assemble。ring 是用于闭合 / 分段圆环的有限图元，仍可通过 edge 定义边缘色带。

颜色支持 hex、`{ "palette": "fill" }`、`{ "palette": "ring" }`、`{ "grade": "perfect" }`，以及 `{ "shade": 400 }` / `{ "ring": 50 }` 连续色阶地址。50～950 是色阶位置，不是 0～1 的比例。animation 可让 shade / ring 地址随轨道变化。

## Animation

动画由 `tracks`、可选根 `properties` / `isolate` 和按绘制顺序排列的 `layers` 组成。动画本身只有归一化进度，不定义秒数时长。

```json
{
  "tracks": {
    "size": {
      "keys": [
        { "at": 0, "value": 0.3 },
        { "at": 1, "value": 1, "ease": { "type": "outCubic" } }
      ]
    }
  },
  "layers": [
    {
      "source": { "frame": "body" },
      "properties": { "transform": { "scale": { "track": "size" } } }
    }
  ]
}
```

source 中 frame / animation 互斥。同一个模板的多次引用彼此独立，每次 draw 也返回独立场景树。group frame 实例可通过 layer.layers 添加动态子层，其他 frame 不可添加。animation 实例只接受 transform / opacity 包装，不能覆盖子动画的内部形状属性或追加子层。

frame 的 properties 允许按节点类型改变几何字段、描边、颜色、opacity、transform；禁止任意属性路径。原始图元的 transform 会用 group 包装；group 自身的属性直接求值。animation 引用的 opacity 采用隔离合成，作用于整个子动画；根动画可用 `isolate: true` 指定相同语义。

track 名作用域仅限本 animation；引用的 animation 使用自己的轨道表。父动画的 properties 和 gate 使用父动画时钟与轨道；source 的双区间映射只改变子动画的采样时间。

### 时间区间

```json
{
  "at": 0.2,
  "until": 0.8,
  "source": {
    "animation": "enter",
    "sample": { "from": 0.8, "to": 0.2 }
  }
}
```

映射公式：`q = (p - at) / (until - at)`；`source = from + (to - from) * q`。上例把中段倒放；把完整源区间 0→1 放在父区间 0→0.5，即为相对父进度两倍速度。from == to 表示定格，不需要 reverse 或 speed 标志。

- at / until 默认 0 / 1，显式设置后必须满足 `0 <= at < until <= 1`。
- 显式窗口为 `[at, until)`；until=1 时包含终点 1。窗口外不绘制。
- 显式 sample 的源进度最后限制在 0～1；端点本身不预先 clamp。
- 不设置窗口的 layer 在父区间外继续求值，不设置 sample 的 animation 引用透传进度。这保留了既有预判定、超时与 raw easing 的行为；需要严格可见窗口时显式写出 at / until。
- 关键帧时间严格递增，位于 0～1。ease 描述到达该 key 的区间，首个 key 不允许 ease。关键帧范围外保持首尾值，默认线性。
- transform 沿用已有矩阵顺序：缩放、旋转、平移；父矩阵左乘子矩阵。

### 轨道与数值

轨道支持 keys、整段 ease、bump 窗口、damped 阻尼、fade 曲线。keys 的 offset / rate 用于周期相位（沿用现有 `% 1` 规则，不等于一次性变速），source 的区间映射用于片段播放与速度变化。

所有 easing 参数具名：

```json
{ "type": "outBack", "amount": 2 }
```

```json
{ "type": "bezier", "x1": 0.7, "y1": 0, "x2": 0.75, "y2": 1 }
```

支持现有 linear、quad、cubic、sine、expo、outQuart、outQuint 曲线，以及 inPow / outPow、compose、step。step 在区间终点跳到目标值。compose 使用 outer / inner 两个具名 ease。ease 的可用精确名称以导出的 `SkinEase` 类型为准。

为严格保留现有皮肤的几何和色彩运动，数值保留有限的结构化运算，不解析字符串表达式，也不使用元组参数：

```json
{
  "lerp": {
    "from": 0,
    "to": { "input": "R" },
    "progress": { "track": "growth" }
  }
}
```

还支持 `{ "add": [...] }`、`{ "multiply": [...] }`、`{ "clamp": { "value": ..., "min": 0, "max": 1 } }`。数组表达有序集合。所有数值须有限，clamp 下限不得大于上限。opacity 和其他数值按声明的曲线求值；若需限制 overshoot，显式使用 clamp。

layer 可通过 `when` 按时钟、轨道值或轨道相位控制可见性，并可提供 `otherwise`。from / until 默认严格比较，包含端点须显式设置 fromInclusive / untilInclusive。未通过 gate 的层从场景树中缺席，不只是透明。

## Slot 与上下文时间

slot 绑定只包含 animation 和可选 note 描述。已知接口包括 `<kind>:enter`、`<kind>:clear:<grade>`、`<kind>:miss`、`<kind>:exit`，hold / long-hold 另有 press、loopUnder、loopOver、progress。

| slot | 驱动 |
| --- | --- |
| enter | 实际 approach 进度；drop enter 固定采样 0 |
| clear、miss、press、exit | 秒数 / 引擎约定时长 |
| loopUnder / loopOver | 秒数按引擎周期循环 |
| progress | 游戏提供的 hold 完成进度 |

默认名义 enter 为 1.2 秒；clear 分 grade、exit 分 kind，全部来自 tokens。当前不允许皮肤自定义这些时长，避免 player 生命周期和 Lab transport 提前结束效果。

时间 input 只有 holdLanding、exitRewindEnd；几何 input 的有限清单由 `INPUTS` 导出。common 几何输入支持所有 kind，hold / flick 专用输入只在相应 kind 可用。它们沿用当前几何 provider，以确保尺寸、描边、朝向与消费者上下文一致，不接受用户自定义输入代码。

```text
holdLanding = 1 - min(0.2, (4 / 60) / max(0.001, approach))
exitRewindEnd = 1 - exitDuration * engineRewindSpeed / max(0.000001, approach)
```

holdLanding 用于 key.at；exitRewindEnd 用于 source.sample.to，倒放起点为 1。exitRewindEnd 可以小于 0：必须在映射后的源进度处 clamp，才保留短 approach 的真实倒放速度。淡出由独立 fade 轨道实现，因此两个时钟不会混在一起。

编译器检查每个 slot 引用图的全部 input 要求；未知 track、frame、animation 和不可用 input 在加载时失败。动态时间端点在实际上下文求值时再次检查。

## 生成与验证

```sh
pnpm --filter @cytoid/skin-flat gen-skin
pnpm --filter @cytoid/notes test
pnpm --filter @cytoid/notes typecheck
```

`packages/skin-flat/scripts/gen-skin.ts` 直接使用当前格式的 Value、Ease、Track 和图元声明，`@cytoid/design-tools/authoring` 中的 `SkinBuilder` 将绑定形状拆分为静态 frame 与 animation properties，按内容去重，并直接绑定 slot。输出文件为 `packages/skin-flat/src/flat.skin.json`，生成前通过当前 schema 与编译器校验。`packages/skin-flat/scripts/overlap.ts` 同样直接使用这条构建路径。

只有一套 schema、编译器和生成器，没有格式分流、迁移器、中间文档格式或字符串 easing 解析。公共接口统一为 `parseSkin`、`compileSkin`、`compileAnimation`、`Skin`；schemaVersion 当前固定为 2，其他值直接拒绝。

当前内置皮肤有 87 个 frame、55 个 animation、68 个 slot。JSON / 默认 gzip / 默认 Brotli 分别为 328,400 / 34,412 / 23,251 字节（压缩结果依赖 Node 版本和参数）。

全部 kind / slot 的场景树测试覆盖方向、调色板、heading、缩放及 approach=0.01 / 0.6 / 1.2 / 2.4。`packages/skin-flat/test/golden/reference` 是仅供测试使用的独立绘制参考，不参与加载或生成；所有 kind 的入场与判定 PNG 均与参考逐字节相同。另有裁切、嵌套、倒放、定格、随机 seek、实例隔离、fallback、五种 slot 时钟和无效文档测试。

生成结果对照先通过严格 schema，再对数值使用 12 位小数容差，以容纳不同平台数学函数的浮点尾差；字段、引用、字符串和数组顺序仍严格匹配。PNG 对照继续逐字节比较。

载入有文档深度 / 节点数、资产数、引用深度、展开图元数和关键帧数预算；静态与间接循环引用都拒绝。

本次完成仓库内现有 note skin 系统的三层格式。hold body、drag 连接线、judgement / timing 字形仍沿用既有独立绘制接口；Unity / C# 消费端不在此仓库，尚未移植。没有新增可视化皮肤编辑器或自定义游戏时长。

## 包边界

只有 `design-tools` 和 `skin-flat` 是从 notes 抽出的新包；通用绘图继续留在 notes。

- notes 定义游戏时长（`noteTiming`）、slot、输入和类型；不加载 Flat JSON，不依赖 Node 原生烘焙库。
- skin-flat 持有视觉 tokens 和默认调色、具体动画、body 与文字。`createContext` 将 ringStroke / hairStroke 等视觉度量写入 DrawContext，编译器不读取 Flat tokens。
- design-tools 的 `bake` 显式接收 `BakeAppearance`；`SkinBuilder` 位于独立的 `/authoring` 入口，不加载原生栅格化库。工具包不依赖 skin-flat。
- player 只依赖 notes。应用负责注入 `flat` 或其他实现 `NoteAppearance` 的设计。

Flat 的生成脚本开发依赖 design-tools；两个新包的运行时依赖方向均指向 notes。Flat 原始 JSON 也通过 `@cytoid/skin-flat/skin.json` 导出，供数据消费者使用。
