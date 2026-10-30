# 全景生成接缝与涂抹：GitHub 调研与本地诊断

调查日期：2026-10-27（Asia/Shanghai）。本次检查本地代码与上游仓库，运行合成像素诊断及现有测试；未调用付费生图接口，未改变生成逻辑或部署。

## 判断

存在可行方案。优先试验“水平平移半张图 → 蒙版局部重绘接缝 → 原图回贴非修复区域 → 平移回来”。长期可评估原生全景模型。继续加宽颜色融合不能解决物体错位，可能破坏边缘细节。

尚未获得用户的失败原图、处理后图及对应线上模型配置，因此不能断言所有涂抹均由本地后处理造成，也不能宣称新方案已经解决实际样图。

## 本地证据

- `src/utils/seamHealer.ts:2`：检测左右第一/最后一列 RGB 色差及相邻列基线，没有评估线条、物体或球面几何连续性。
- `src/utils/seamHealer.ts:70`：除了默认 160 像素的窄修复带，还使用更宽的亮度修正带。2048 像素宽时，亮度带每侧 286 像素，合计约 28% 图宽有可能被修改；这不是说所有实际图片都会修改这么多。
- `src/utils/seamHealer.ts:190`：强制最左/最右列取相同平均值。即使物体错位，边缘色差指标仍可降为零，并把矛盾结构平均掉。
- `src/components/GeneratorTab.tsx:242`、`:539`：默认自动修缝；生成后保留原生像素密度、锐化为零、对比度为一。因此当前这条本地路径并非默认强行放大到 4K；仍不能排除上游原图本身的涂抹。
- `src/utils/imageModelRequest.mjs:4`：请求支持生成、参考图；没有显式 mask、蒙版编辑路由或环绕采样参数。把参考图交给模型并口头要求“只修这里”不能保证其余区域不变。
- `src/utils/imageModelRequest.mjs:24`、`src/utils/imageEnhancer.ts:37`：Gemini 请求分支固定发送 16:9，再裁成 2:1。裁剪只改变画幅，不能凭空建立全景几何；其他模型分支有不同尺寸逻辑，不能一概而论。

### 合成检查结果

直接加载当前 `healPanoramaSeam`，使用 2048×1024 RGBA 合成图：每 16 行交替黑白，画面左右两半条纹相位相反。使用默认 160 修复宽度与自动检测；排除顶部/底部各 8 行统计改变列数。

| 指标 | 修复前 | 修复后 |
| --- | ---: | ---: |
| 左右边缘平均 RGB 色差 | 255 | 0 |
| 相邻列色差基线 | 0 | 122.085 |
| 接缝列两条相邻黑白条纹的对比度 | 255 | 0 |
| 被修改列数（不计极点平滑） | — | 534 / 2048（26.07%） |

中间像素保持不变。这证明算法可以通过消除细节让色差检查通过，同时把跳变移到相邻列；它不是实际用户图片的画质评分，也不代表所有照片都会丢失同等比例的细节。

现有检查：`node --test tests/panorama_processing.test.mjs`，37/37 通过。现有测试验证像素处理和流程行为，不证明生成画面在视觉上无缝。

## GitHub 方案比较

| 方案 | 上游证据 | 对当前项目的含义 |
| --- | --- | --- |
| 平移 + 局部重绘 | [Civitai Panorama 360](https://github.com/civitai/app-panorama-360)，[工作流源码](https://github.com/civitai/app-panorama-360/blob/main/src/panorama.ts)：裁切拼接实现 50% 平移，蒙版噪声重采样，再平移回来 | 最适合先验证。需要支持 mask 的重绘服务/工作流；多一次推理。当前普通生图接口不能直接替代它。 |
| 全景专用模型 | [Insta360 DiT360](https://github.com/Insta360-Research-Team/DiT360)，[推理入口](https://github.com/Insta360-Research-Team/DiT360/blob/main/inference.py)：FLUX.1-dev + 全景 LoRA + 专用 pipeline | 从生成端处理几何。官方说明训练尺寸为 2048×1024，未优化推理约需 37 GB 显存；不是前端小补丁。 |
| SDXL 横向环绕 | [ComfyUI-seamless-tiling](https://github.com/spinagon/ComfyUI-seamless-tiling)：模型 Seamless Tile 与 Make Circular VAE/Circular VAE Decode，X/Y 可独立设置 | 适用于兼容的卷积模型工作流；全景应只开启横向环绕。还需全景训练/LoRA 处理投影，普通纹理平铺不自动成为正确球面全景。 |
| Diffusion360 | [SD-T2I-360PanoImage](https://github.com/ArcherFMY/SD-T2I-360PanoImage)：文字/单图到全景 | 可作完整参考实现；README 建议 diffusers 0.20–0.26，指出更高版本的超分可能过饱和，接入前需隔离验证。 |
| MultiDiffusion | [原仓库](https://github.com/omerbt/MultiDiffusion)、[Diffusers 文档](https://huggingface.co/docs/diffusers/main/en/api/pipelines/panorama)：环绕窗口与 VAE 解码 circular padding | 可借鉴原理；当前文档将此 pipeline 标记为 deprecated，不作为新生产集成的首选。 |

注意：SDXL 卷积层的环绕补丁不能直接等同于 FLUX/其他 DiT 的环绕方案。DiT360 提供的是配套模型与 pipeline，不能只把任意模型名称替换成 DiT360 就实现同样行为。

DiT360 推理依赖 FLUX.1-dev。[基础权重许可](https://github.com/black-forest-labs/flux/blob/main/model_licenses/LICENSE-FLUX1-dev)限制商业/生产模型使用，不能因为研究仓库代码开放就直接用于收费服务；这与生成结果本身的使用许可是两回事。

## 最小落地试验

1. 同一张失败原图保留不变，先水平循环平移宽度的 50%，把 0°/360°边界置于中央。
2. 只对中央竖条调用支持蒙版的 inpainting。初始条宽和羽化量按样图试验；Civitai 的 320 像素条宽、128 羽化、0.7 denoise 是其特定模型/2048 像素工作流的参数，不照搬为所有模型的默认值。
3. 将重绘结果仅按修复蒙版合成回平移后的原图，确保蒙版及羽化区外逐像素保留，再执行逆平移。原图与修复图分别保留。
4. 对同一批室内直线、植被纹理、天空及参考图补全样例做前后对照；在球面查看器转过接缝，并检查修复带两侧是否产生新缝、极点是否破损、纹理是否被抹平。
5. 同时验证边界附近多列梯度、局部细节及修复区外像素保持；不得仅以首尾两列相等作为成功标准。

这条试验能验证局部修复效果。如果原图的房间布局、透视或极点整体已不正确，应转向原生全景生成；接缝重绘无法补救所有全局几何错误。
