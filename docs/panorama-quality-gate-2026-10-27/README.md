# 服务端全景生成质量门禁：2026-10-27

为防止生成结果出现上下拼条、重复地平线、额外前景驾驶舱/方向盘或主体偏离参考图即直接交付并扣费，在服务端 `/api/generate`（`server/commercial-server.mjs` 与 `functions/api/[[route]].ts`）接入自动视觉验收门禁（`server/panoramaQuality.mjs`）。

## 门禁与计费规则

1. **单次预扣与统一截止时间**：每次 `/api/generate` 请求只预扣一次积分、申请一个并发租约，并共享同一个 150 秒总超时窗口。
2. **视觉验收（默认 `gemini-3-flash`）**：生成模型返回候选图后，服务端将原始需求（作为不可信场景描述隔离）、最多 3 张参考图与候选全景原图送入视觉审查模型，只检查显著结构性缺陷（`reference_mismatch`、`collage`、`duplicate_subject`、`disconnected_geometry`、`seam`、`pole_distortion`），容忍正常的等距柱状投影拉伸、透视参考图扩展为 360° 后的合理主体缩小，以及可由后续边缘融合处理的轻微接缝色差。
3. **最多自动重试一次**：
   - 若第 1 次审查明确返回 `failed`，服务端根据枚举缺陷码拼接静态修正提示（`buildQualityRetryPrompt`，不注入审查模型的自由文本），携带原参考图与分辨率自动重试 1 次（总计最多 2 次生图）。
   - 若第 1 次或重试后通过（`passed`），正常交付图片并只扣除 1 次请求积分，不保存到作品库之外的额外费用。
   - 若连续 2 次均未通过，返回 `422 GENERATION_QUALITY_REJECTED`，全额退回本次预扣积分，且不写入私有作品库。
   - 若审查服务超时、HTTP 失败或返回非法 JSON（`unavailable`），不盲目放行也不重复生图，立即返回 `503 GENERATION_REVIEW_UNAVAILABLE` 并全额退回本次预扣积分。
4. **前端终端停止与状态展示**：`src/utils/geminiClient.ts` 与 `src/components/GeneratorTab.tsx` 识别 `PanoramaQualityError` 后立即停止模型故障转移（不会继续请求下一个备用模型）、刷新账户余额、保留当前预览图并提示已退分；通过审查的结果在预览栏展示通过状态（含是否经过一次重试）及概率性检查说明。

## 真实模型对照明细

使用本机代理的 `gemini-3-flash` 对同一参考图（`/Users/han/Downloads/cartarmor-hero-lifestyle-v2-1536.webp`）的两张真实生成原图进行实测，结果保存在同目录 JSON 中：

| 样本 | 候选图路径 | 期望 | 实际判定 | 识别问题码 | 耗时 |
| --- | --- | --- | --- | --- | --- |
| `known-bad` | `docs/reference-photo-trial-2026-10-27/gemini-original.jpg` | `failed` | `failed` | `collage`, `duplicate_subject` | 9.976 秒 |
| `improved` | `docs/reference-photo-optimization-2026-10-27/production-prompt/model-original.jpg` | `passed` | `passed` | `[]` | 10.548 秒 |

## 局限性说明

- 视觉审查由多模态大模型执行，属于概率性质量门禁，能够拦截明显的分屏拼贴与多余前景方向盘等缺陷，但**不能保证 100% 识别所有几何畸变，也不能保证完全不发生误判**。
