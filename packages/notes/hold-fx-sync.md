# HoldFx → 皮肤同步契约

本次审计保留历史截图校准的 band 数值，**没有证明其为当前客户端粒子的严格二维投影**。防漂移测试固定的是设计选择；golden 测试只保证皮肤解释器与命令式 oracle 一致，不证明 Unity 实机一致。

以下 game 路径相对 `../Cytoid/Assets/`；design 路径相对本包。源码定位以本次审计的本地快照为准，模块名比行号更稳定。历史截图及其玩家设置、像素测量记录未随任务提供，故不能重新验证那次校准。

## 映射表

| 皮肤常量 | game 依据 | 性质 / 校准标记 |
| --- | --- | --- |
| 4 个 circle，offset = i/4 | `StaticResources/Prefabs/Game/HoldFx.prefab:115` InitialModule.startLifetime=0.5；`:865` EmissionModule.rateOverTime=8 | 8×0.5=4 是稳态存活**粒子数**；四条完整环带与四等分相位是设计近似，并非每次发射一个完整波面 |
| r 线性 0→1.7 R | 同 prefab `:168` startSpeed=5，life=0.5 | **历史截图校准**。5×0.5=2.5 仅为未缩放且未限速的名义三维路程，不能作为当前 prefab 的 XY 半径 |
| strokeWidth = R/3 | 同 prefab `:284` startSize=1；`:4770` Renderer 材质指向 NoteFillMat | **历史截图校准**。startSize 是 billboard 边长/圆盘外接尺寸，不是半径。固定带宽不等价于当前 SizeModule |
| opacity 0.39→0.196@1/3→0，线性 | 同 prefab `:1355` ColorModule，maxGradient 的 alpha 为 0.39215687、0.19607843、0；atime 为 0、21781/65535≈0.332356、1；m_Mode=0 | prefab 曲线的**取整近似**；minMaxState=1 为单 Gradient，仅使用 maxGradient；minGradient 全 1 不参与随机插值（TwoGradients=3） |
| stroke shade 400，无 fill | `Scripts/Game/Notes/Flat/FlatHoldNoteRenderer.cs:85` startColor=BaseFillColor；`:88` sortingOrder=SortingOrder−2 | **调色板语义映射**；loopUnder 对应在头部下方。材质纹理和混合、外部 alpha 乘数不等同于纯 stroke opacity |
| mode loop，duration=tokens.time.holdLoop=0.6 s | `Scripts/Game/Notes/Flat/Palette/FlatTokens.cs:106` HoldLoop=0.6；prefab startLifetime=0.5 | **设计时间拉伸 ×1.2**；等效发射间隔 0.15 s，而 Unity 为 0.125 s；不是 prefab duration 的直接复制 |

R 定义为未按压、未动态缩放的设计头半径（ctx.size/2），不是直径。实现见 `scripts/gen-skin.ts:holdPulseClip` 与 `test/golden/legacy/hold.ts:holdLoopUnder`；字面量契约见 `test/skin.test.ts` 的 `holdFx sync contract`（同时检查 hold / long-hold）。

## Unity 语义验证与修正

- `HoldFx.prefab:659` ShapeModule **enabled=0**。保存的 type=4（Cone）、angle=25、radius.value=1 均不生效；randomDirectionAmount / sphericalDirectionAmount 均为 0。默认点发射沿发射器局部 +Z，不是球面全向，也不是 XY 环形发射。prefab `:28` 局部旋转为单位四元数。搜索 Scripts 未发现启用 holdFx shape 的代码。
- 即使改为 Sphere，单个粒子也仍是单个 billboard；球壳正交投影包含壳内部的投影点，不会使每次发射变成一条均匀完整环带。若要用环带近似，应称其为视觉包络/设计抽象。
- `HoldFx.prefab:110` scalingMode=1 是 **Local**，Hierarchy=0。startSize 是粒子模拟中的初始尺寸；在单位 transform 下可按世界单位读取 billboard extent，实际渲染还要应用缩放模式。Local 应用自身 transform scale、忽略祖先 scale；Hierarchy 则包含祖先。缩放影响粒子尺寸与运动的空间映射，不能把 startSize=1 直接当作任意运行配置下的一世界单位可见圆盘。模拟空间与缩放模式是不同设置（`:108` moveWithTransform=0，World）。
- Flat `FlatHoldNoteRenderer.cs:197-199` 和 **Classic** `ClassicHoldNoteRenderer.cs:261-267` 都设置自身 scale 为 `5 × (1+ClearEffectsSize) × fxScale`，后者并非 scale=1；prefab 自身 `:30` 的默认 scale 也已是 5。fxScale 含 chart size、note size override 与动态 SizeMultiplier。
- `HoldFx.prefab:1031` **SizeModule.enabled=1**，单曲线从 1→0.5988693，端点切线为 0（非线性缩小）；不是没有 Size over Lifetime。
- `HoldFx.prefab:2410` **ClampVelocityModule.enabled=1**；separateAxis=1，x/y limit=999，z limit=0（`:2518`），dampen=0.75（`:2628`），drag=0。实际 Z 路程不能直接取 speed×life；未运行 Unity，未声称得到限速后的精确轨迹。
- 正交相机的深度不会产生透视放大/缩小：沿相机 Z 的运动不改变 XY 坐标和 billboard 的投影尺寸；仍可能影响裁剪、遮挡/深度排序。缩放与限速不会把 +Z 自动转为 XY 径向速度。因此当前 prefab 的忠实翻译应为中心发射、寿命重叠并逐渐缩小/淡出的纹理圆盘，保留空间、材质和 alpha 乘数；不应只把 1.7 改成另一半径数字。

Unity 一手依据：[枚举源码](https://github.com/Unity-Technologies/UnityCsReference/blob/master/Modules/ParticleSystem/Managed/ParticleSystemEnums.cs)（Gradient=1、TwoGradients=3、Hierarchy=0、Local=1、Cone=4、Billboard=0）；[缩放语义](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/ParticleSystem.MainModule-scalingMode.html)；[Shape 模块](https://docs.unity3d.com/6000.0/Documentation/Manual/PartSysShapeModule.html)；[正交相机](https://docs.unity3d.com/2018.3/Documentation/Manual/class-Camera.html)。默认 +Z 点发射及其视觉结论是按模块配置作出的静态推断，尚无本次 Unity 运行时采样。

## 头部世界尺寸与误差

已找到相机来源，无需再把 ortho 当作未知量：`Scenes/Game.unity:2490` 的 Game.camera 指向 fileID 1571121746；同一 Camera `:12420-12421` 为 orthographic=1、orthographic size=5；相机旋转为单位四元数、位置 Z=−10（`:12444-12445`）。同 scene `:2613` 的 holdFx 引用 GUID 与 HoldFx.prefab.meta 一致。搜索 Assets 下脚本、prefab、scene、asset 未发现生产脚本重新赋值 orthographicSize；Editor 测试中的赋值不是游戏运行配置。

令 O=orthographicSize，C=chart.Model.size（Note.Chart.size），N=Settings.NoteSize，M=可选 Note.Model.size（无 override 时为1），V=动态 SizeMultiplier，A=EnterScale，K=kindSize（hold/long-hold 为1）。

```text
T = 2 O × (7/9) / 5 × 1.2675
G = C × (1 + 0.133333 + N)
BaseTransformScale = C × G × M
WorldScale = T × BaseTransformScale / 128
D_unpressed = (128 × K) × WorldScale × A × V
            = T × C² × (1.133333 + N) × M × K × A × V
```

依据：`Scripts/Game/GameConfig.cs:67-74`，`Notes/Flat/FlatNoteRendererBase.cs:63,89-95,237-247`，`Notes/Flat/Palette/FlatTokens.cs:43,66-75`；像素到世界坐标上传见 `Notes/Flat/Mesh/FlatNoteMesh.cs:98-108`。C² 是当前源码的两次乘法，不能在推导中自行消去。完全按压另有 `FlatHoldNoteRenderer.cs:386` 的 0.86 缩放，因此可见按压头应再乘0.86。

默认 O=5、C=M=V=A=K=1、N=0，未按压设计直径 **D≈2.2345549** 世界单位（R≈1.1172774），按压后约1.9217172。实际可见轮廓还包含绘制几何、线宽和抗锯齿，不能直接称作截图的可见直径。

历史假设 D≈3 比上述默认未按压设计直径大约34.26%；若把名义2.5世界单位硬除以默认R，会得到2.2376 R，仍不是当前 prefab 的投影运动。更直接的内部矛盾：同一单位换算下，travel/diameter 应为(5×0.5)/1=2.5，而当前两项校准比值为1.7/(1/3)=5.1。即使忽略 shape/限速/尺寸曲线，二者也无法从同一 R 换算同时推出；“圆盘为头直径的三分之一”也不等于宽度R/3（后者是头直径的六分之一）。

**误差上界：没有原截图、测量误差和设置记录，无法给出有依据的实测有限上界**，不能把34.26%当作校准误差上界。条件性估计：若只知道头径相对测量误差≤ε<1，归一化量 q=L/R 的头径贡献相对误差≤ε/(1−ε)；例如假设ε=5%，则≤5.27%，但这不是本次实测结果。`Scripts/Player/LocalPlayerSettings.cs:119,145` 标注 N、ClearEffectsSize 均为−0.5～0.5；固定其他量，仅 N 已使未按压头径在约1.2487～3.2204之间。chart/note override 未受该区间限制，故整个换算链不存在由这些默认值保证的通用有限误差上界。

## 保留的实机差异

1. 四条全圆环带、径向外扩、固定宽度：对比点发射的中心圆盘、+Z 运动、非线性缩小。
2. 0.6 s 周期及四个预置相位：对比0.5 s寿命、8/s发射的启动/停止过程与残留粒子。
3. alpha 与中间时间点取整、shade 400 语义色：对比真实 gradient、纹理覆盖、材质混合及 renderer 外部 opacity 乘数。
4. 固定 R 比例：对比玩家 NoteSize/ClearEffectsSize、chart/note override、按压及进场缩放的不同路径。

此改动只补证据与冻结当前设计，未修改任何动画数值。若后续要求实机逐像素等价，应另行确定新契约并同步修改生成器、JSON、oracle 与本防漂移测试。
