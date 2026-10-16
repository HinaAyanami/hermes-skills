# WebGL / Canvas 工件的无头验证

## 1. 让无 GPU 的机器跑起 WebGL2

Chromium 系浏览器在 `--headless=new --disable-gpu` 下默认没有可用 GL 上下文，加软件光栅化标志即可：

```
--headless=new --disable-gpu --no-sandbox \
--enable-unsafe-swiftshader --use-angle=swiftshader
```

只想要一张图、不需要诊断，一条命令行就够（`--virtual-time-budget` 会加速推进 rAF）：

```bash
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  --headless=new --disable-gpu --no-sandbox \
  --enable-unsafe-swiftshader --use-angle=swiftshader \
  --window-size=1280,760 --virtual-time-budget=9000 \
  --screenshot="C:/Users/<user>/AppData/Local/Temp/x/shot.png" \
  "file:///C:/path/page.html"
```

要同时拿诊断或发交互事件，用 `scripts/headless-shot.mjs`（CDP 驱动，真实等待而非虚拟时间）。

要点：
- 各厂商浏览器路径不同（Chrome 常装 `Program Files`、Edge 常装 `Program Files (x86)`），逐个探测存在性，不要在一条路径上失败就断定「没有浏览器」。
- 临时目录用 `$LOCALAPPDATA/Temp/...`（原生程序的路径参数不做 MSYS 转换，Native 工具读不到 `/tmp`）。
- 软件渲染跑 1–2 fps 属正常，不代表真实 GPU 性能。

## 2. 探针约定

页面里写死，不依赖外部注入：

- `window.__diag = { gl, err, frames, fps, w, h, steps, hdr, post }` —— `gl` 是布尔，`err` 为字符串即失败。
- `window.__state = state` —— 直接指向运行时的状态对象（相机 yaw/pitch/dist、开关、质量），自动化可读可写（先 `__state.auto = false` 再测拖动）。
- 页面上可见的错误条（如 `#err`）也要探测 `textContent`。
- 在页面里写入 `diag.hdr` / `diag.post` 之类的开关位，能区分「效果没出来」是着色器错还是扩展缺失。

## 3. GLSL 的静默陷阱

### `#version` 必须是源码第一行
从 `<script type="x-shader/x-fragment">` 取源码时，标签后的第一个换行会排到最前面，`#version 300 es` 被挤到第二行 → 降级编译或直接失败。

```js
// ✗ document.getElementById('fsh').textContent
function shaderSource(id){
  return document.getElementById(id).textContent.replace(/^[\s\uFEFF]+/, '');
}
```

所有 shader 编译入口统一走这个函数，不要一处一处贴。

### `smoothstep(edge0, edge1, x)` 的边界不能写反
规范定义 `edge0 >= edge1` 时结果**未定义**，常见实现直接返回 0。想表达「值越小强度越高」不能写 `smoothstep(70.0, 24.0, s)`，要写 `1.0 - smoothstep(24.0, 70.0, s)`。

症状是整块效果无声消失、连编译警告都没有——遇到「代码看着对但画面没变化」，先把所有 `smoothstep` 的边界方向检查一遍。

### 细特征会被欠采样
`antialias:true` 对全屏光线追踪/光线步进着色器没用：整个画面只有一个三角形，没有几何边缘，MSAA 无从生效。1–2px 宽的特征（星芒、细亮线、细丝）会时有时无。

- 把特征做宽：高斯衰减半径 `sqrt(ln2 / k)` 至少到 1.5–2px；
- 或渲染到 1.5–2× 分辨率再降采样。

### 硬编码的裁剪半径必须与相机可动范围联动
光追/场渲染里所有「超过这个半径就不再算」的阈值——逃逸半径、远平面、场景包围盒、LOD 切换距离——一旦写成常量，就等于把相机锁死在那个范围内。症状极具迷惑性：默认视角一切正常，用户把相机拉远越过阈值后**画面整个空掉**（光线起点已在裁剪半径外，第一轮迭代就 break，什么都没采到）。

```glsl
const float ESCAPE = 46.0;                              // ✗ 与相机上限（如 80）脱钩
float escR = max(ESCAPE, length(uCamPos) * 1.30 + 8.0); // ✓ 随相机距离自适应
```

同一根因的第二个面：**步长预算也要跟着场景跨度走**。远处步长上限写死（`clamp(dt, 0.012, 1.2)`）时，相机拉远后光线在限定步数内走不到主体，画面只剩背景——看起来像「效果没了」，其实是没算到。把上限随半径放开（`clamp(dt, 0.012, max(1.2, r * 0.075))`）；远处引力弱、曲率小，大步长不影响精度。

排查顺序：出现「拉远/缩小就消失」时，先查相机可动范围与所有硬编码空间阈值的数量级关系，再查步数预算，最后才怀疑着色器逻辑。

### 浮点渲染目标
HDR + 后期 Bloom 需要 `const hdrOK = !!gl.getExtension('EXT_color_buffer_float')`，并在缺失时能回退到 LDR 直出。把结果写进 `diag.hdr` / `diag.post`，否则「泛光没出来」无法归因。

## 4. 像素分析（PIL + numpy）

按区域采样并逐轮对比同一区域的数值，确认调参真的生效：

```python
import numpy as np
from PIL import Image
a = np.asarray(Image.open(png).convert('RGB'), dtype=float) / 255.0
reg = a[y0:y1, x0:x1]
g = reg.mean(axis=2)
detail  = float(np.abs(np.diff(g, axis=0)).mean() + np.abs(np.diff(g, axis=1)).mean())  # 纹理丰富度
mean    = float(g.mean())
clipped = float((g > 0.985).mean())   # 过曝占比
```

建议的区域键：主体左/右（看多普勒不对称）、上方透镜弧、天空（看星点是否被透镜拉弯）、中心阴影（应为恒 0）。

把区域裁剪后 4 倍最近邻放大再交给 `vision_analyze`，比看整图更容易问出纹理层面的问题。

## 5. 调参节奏

1. 先出图、`vision_analyze` 看整体方向对不对（结构/配色/构图）。
2. 方向对了再进入数值调优：每轮只改 2–4 个相关系数，重跑一次出图 + 区域指标，对比同一区域的前后数值。
3. 亮度类问题优先降系数而不是加大细分——过曝会同时吃掉纹理和颜色层次。
4. 用户会在真实 GPU 和更高分辨率上看，细节的屏幕尺寸比无头截图里大；不要过度针对软渲染的糊度优化。

## 6. 参数极值回归

只在默认值上验证，等于没验证参数化。每次改完相机/质量相关代码，扫一遍参数域两端：

| 检查 | 怎么跑 | 失败特征 |
|---|---|---|
| 拉到最远 | `--wheel=25` 或 `--dist=<上限>` | 整图 `mean < 0.01`（空掉，不是变暗） |
| 推到最近 | `--dist=<下限>` | 过曝、主体出画、近处步长不够出现硬边 |
| 转到大角度 | `--drag`，读 yaw/pitch 前后差 | 差值恒 0 = 事件没接上；画面破碎 = 相机矩阵进 shader 有误 |
| 步数下限 | `--steps=100` | 与高步数对比结构是否崩（应只是噪点变多） |

判定「消失」用整图均值，判定「不对」用区域指标（第 4 节）——两者都要：均值会漏掉局部错误，区域会漏掉整体空屏。

`--dist` 直接写 `__state.tDist`，`--wheel` 走真实滚轮事件。前者快、适合扫参数域；后者才能验证滚轮处理逻辑本身（上下限 clamp 是否生效）。**两者结果不一致，就说明事件处理里有 bug**。
