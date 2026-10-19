# 360 Panorama Viewer — AI 360° Panorama Generator & VR Skybox Engine

> **在线演示 (Live Demo)**：[https://hanshan0228.github.io/panorama-generator/](https://hanshan0228.github.io/panorama-generator/)  
> **对标站点**：[panoramagenerator.com](https://panoramagenerator.com/)  
> **设计哲学**：融合 `panoramagenerator.com` 的 AI 全景生成能力、`360photocam.com` 的 `Ctrl+V` 极速查看体验，以及 `renderstuff.com` 级别的工业级 WebGL 3D 渲染表现。

---

## 🌟 核心功能全景

### 1. 🤖 AI 360° 全景图生成器 (AI Panorama Generator)
* **2:1 等距柱状投影 (Equirectangular)**：严格按工业级 360° VR 全景标准生成（360° 水平 × 180° 垂直）；
* **多风格预设**：赛博朋克霓虹（Cyberpunk）、热带海滩日落（Tropical Sunset）、深空星云（Space Nebula）、现代极简豪宅（Modern Penthouse）、古神庙遗迹（Celestial Ruins）；
* **智能边缘缝合算法 (Seam Healing Algorithm)**：对齐 `panoramagenerator.com` 核心卖点，采用两端 80px 镜像重叠与 Alpha 交叉淡入淡出（Cross-Fade）技术，彻底消除 360° 旋转时的拼接接缝线；
* **分级分辨率**：支持 1K (1024×512)、2K (2048×1024)、4K (3840×1920) 超分渲染；
* **导出矩阵**：
  * **2:1 PNG**：原生高质量全景图；
  * **Radiance `.hdr` 容器**：生成标准 RGBE 编码的 `.hdr` 格式，支持直接拖入 Blender、Unreal Engine 5、Unity 作为物理环境光照贴图（IBL）；
  * **一键流转**：1 键直接送入 Cubemap 切图器或 3D 地球仪。

---

### 2. 👁️ 免费在线 360° 全景播放器 (Free 360° Viewer)
* **零算力客户端渲染**：纯本地 WebGL / Three.js 逆向球体渲染，不消耗服务器 GPU，极速秒开；
* **杀手级交互细节**：
  * 支持本地文件点击选择；
  * 支持文件拖拽（Drag & Drop）；
  * **支持 `Ctrl + V` 剪贴板一键粘贴**（对标 `360photocam.com` 的高粘性体验）；
* **双投影模式**：
  * **360° 球体内部漫游 (Sphere Mode)**：支持鼠标拖拽旋转、触屏滑动、滚轮 FOV 广角变焦 (30°~105°)；
  * **小行星鱼眼视角 (Little Planet Mode)**：立体球极外部投影；
* **实用功能**：自动巡航旋转、全屏沉浸模式、一键视口高清截图（Snapshot）。

---

### 3. 📦 立方体贴图转换器 (Cubemap Slicer)
* **精确 3D 光线投射算法 (Ray-Casting Algorithm)**：在浏览器端实时将 2:1 全景图无损切成标准的 6 面体盒图：
  * `posx` (Right +X)
  * `negx` (Left -X)
  * `posy` (Top +Y)
  * `negy` (Bottom -Y)
  * `posz` (Front +Z)
  * `negz` (Back -Z)
* **展开式 T-Cross 交互预览**：直观展示立方体空间展开图；
* **打包导出**：支持单面 PNG 单独下载，或 **一键打包下载全部 6 面体 ZIP 压缩包**（内置 JSZip），附带 Unity/Unreal 天空盒导入教程。

---

### 4. 🌍 3D 旋转地球仪 (Photo to Globe)
* **地图投影仿真**：将任意 2D 平面地图或当前全景图包裹至三维立体行星模型上；
* **大气层辉光特效**：内置菲涅尔大气蓝光散射着色器；
* **可控参数**：自由调整自转速度、暂停旋转、切换线框网格（Wireframe）透视模式。

---

### 5. 💎 商业化体系与定价闭环 (Pricing & Business Funnel)
* **三级梯队定价**：
  * Free Explorer（$0 免费体验）
  * Pro Creator（$9.9/月 年付版，解锁 4K 与商业授权）
  * Studio / Enterprise（$29.9/月，含企业级 REST API 与算力池）
* **常见问题（FAQ）折叠面板**：解答版权归属、格式规范、游戏引擎兼容性等核心疑问。

---

## 🛠️ 技术栈与依赖

* **Core Framework**: React 19 + TypeScript + Vite 8
* **Styling**: Tailwind CSS v4 + 现代深色暗黑毛玻璃风（Glassmorphism）
* **3D Engine**: Three.js (WebGL Renderer, SphereGeometry, Raycasting)
* **Icons & Animation**: Lucide React + Canvas Confetti
* **Archive Compression**: JSZip (客户端无感压缩 6 面体图片)

---

## 🚀 启动与部署

### 1. 本地开发与体验
```bash
# 1. 进入项目目录
cd C:\Users\hanzhe1\projects\panorama-generator

# 2. 启动本地开发热更新服务
npm run dev
```
启动后在浏览器打开：`http://localhost:5173/`

### 生图接口与积分

`POST /api/generate` 使用账户或游客会话的 `Authorization: Bearer <token>`，请求包含 `prompt`、`endpointId` 和 `resolution`（`1K`、`2K`、`4K`；省略时按 `4K` 处理）。服务端依据保存的计费配置计算费用，忽略客户端 `creditsCost`；费率必须为正整数，未配置时分别使用 1、2、4 积分。

调用模型前原子预留积分，成功后记录调用次数，模型请求失败或响应不含图片时释放预留积分。Cloudflare 使用 D1 支持并发；本地 JSON 后端仅支持单 Node 进程，不应用作多实例共享账本。

工作区统一同步账户与公共费率；网络或服务端暂时故障不会清除登录凭证，只有明确的 401/404 身份失效响应才转为游客。后台模型启停、删除及路由保存须先获得云端成功响应，失败时保留本地配置。当前 Imagen 路径只支持文字生图，参考图会明确报错且不扣积分。

回归检查：`npm run build`、`npm run lint`、`node --test tests/*.test.mjs`。测试使用模拟模型，不调用真实收费服务；D1 适配测试使用 Node 内置 SQLite，与现有 TypeScript 直读测试一起要求支持这些特性的 Node 版本。

### PayPal 月付 / 年付自动续费

收银台使用 PayPal 官方托管订阅授权页，不收集卡号，不接受浏览器回调发放积分。服务端按照登录会话绑定永久账户，游客不可付费；每次创建订阅验证 PayPal Plan 的 USD 价格及月/年周期，仅在签名验证成功的 `PAYMENT.SALE.COMPLETED` 通知后发放积分。重复通知按付款交易 ID 去重，续费每次发放，年付一次发放 12 个月积分。订阅状态可刷新，账户持有人可取消自动续费，已购买积分保留。旧项目的 Product / Plan / Webhook ID 不要复用。

原生 Node 脚本检查凭证，不打印密钥：
```bash
node scripts/setup-paypal.mjs --source /absolute/path/to/paypal.env
node scripts/setup-paypal.mjs --source /absolute/path/to/paypal.env --save-credentials
node scripts/setup-paypal.mjs --source /absolute/path/to/paypal.env --configure
```
`--save-credentials` 仅保存服务端凭证，不修改远程账号。`--configure` 创建本项目的四个套餐及 `https://panorama-generator.pages.dev/api/paypal/webhook` 回调，默认以线上 `/api/billing` 配置核对套餐。结果保存至 Git 忽略、权限 `0600` 的 `.env.paypal.local`。更换域名使用 `--origin https://your-domain.example`，并重新配置独立回调；不要混用 live/sandbox。

Cloudflare Pages 需要将 `.env.example` 中的 `PAYPAL_*` 配置设置为服务端 Secrets，不能使用 `VITE_*` 或浏览器 localStorage。本地 Node 服务可用 `node --env-file=.env.paypal.local server/commercial-server.mjs`，另须设置 `ADMIN_PASSWORD`。D1 自动创建独立 PayPal 订阅表，账务更新采用原子批处理。本地 JSON 账本仅适用于单进程。Stripe / Google Pay 仍关闭。测试使用合成凭证与模拟 PayPal，不发起真实扣款。

未配置 `ADMIN_PASSWORD` 且 D1 中没有自定义管理员密码时，后台登录返回 503，不使用默认密码。收银台绑定打开时的登录会话，账户切换后须关闭重开；待授权订阅按原套餐继续，取消操作须同时匹配会话和展示的订阅 ID。后台订阅、MRR/ARR 和发票读取服务端 PayPal 账本，不以本地演示数据替代；真实订阅续费由账户持有人管理。本地新用户注册必须设置 6 至 1024 位密码。

付款通知只有在发票确实入账后才确认成功；封禁与到账并发导致未履约时返回失败，允许 PayPal 重试，不推进订阅有效期。创建订阅失败会释放尚未向用户发布授权链接的本地占位；历史未完成占位可在收银台丢弃。已发布的 PayPal 授权不能通过本地删除跳过远程订阅管理。

后台改密会撤销全部旧管理员会话并要求重新登录，云端密码不写入浏览器缓存。新账户和游客的初始积分读取服务端 `freeMonthlyCredits`；参考图被模型拒绝时返回失败并释放积分，不静默改成纯文本生成。生成结果按会话隔离，完成后重新读取服务端账户。模型分辨率控制请求档位，不再将所有原图强制缩放为固定宽度：保留原生像素密度，非 `2:1` 原图居中裁切为 `2:1`，会移除部分上下或左右边缘，不将裁切冒充真实全景重建；完整模型原图可单独无重编码下载。

生成过程显示真实阶段、累计等待时间及每次尝试的模型，不使用模拟百分比。完成后分别展示模型及网络耗时（包含备用尝试）和图片后处理耗时；模型算力、代理排队与传输时间不能由前端优化消除。现代浏览器通过 Worker + OffscreenCanvas 执行尺寸调整、锐化、接缝处理和 PNG 编码；旧浏览器保留主线程兼容路径。后处理最多等待 30 秒，失败时保留已生成原图，不重复请求模型或扣费；离开页面或切换账户会取消后处理。

Gemini 3 生图现在显式请求所选的原生 `1K` / `2K` / `4K`，兼容代理使用 `modalities` + `image_config`，Google 原生接口使用 `generateContent` + `generationConfig.imageConfig`，参考图片不变。Gemini 请求 `16:9`，显示前按原生像素居中裁切为 `2:1`，不拉伸场景。例如实测 `2752×1536` 保留为 `2752×1376`，而非压缩为 `2048×1024`。默认不做锐化、增对比或接缝融合；可选接缝融合明确提示重影风险，不能修复不一致的几何关系。手动清晰度处理改为同尺寸轻度锐化，不再自动混合接缝，也不声称是 4K 或 AI 超分。旧 Gemini 2.5 不发送不支持的原生分辨率字段。本地初始配置的 GPT/Gemini 名称、提供商和实际型号已对齐，不覆盖用户自行保存的历史配置或替换线上型号。

GPT Image 2 / 2.5 请求 `1152×576`、`2048×1024`、`3840×1920` 三档原生 `2:1` 尺寸；1K 请求稍大后缩小，以满足最小像素数和 16 像素步长约束。画质保持 `auto`，不擅自升级为更贵的高画质。GPT 使用 `output_format: png`，不发送旧 DALL·E 的 `response_format` 参数；Google 密钥放请求头，不放 URL。GPT Image 1.x 和 DALL·E 保留各自支持的尺寸；不再因尺寸错误自动重试并降级成方图。GPT Image 2 / 2.5 大于 `2560×1440` 的尺寸在官方文档中属于实验性，代理也可能限制或忽略参数；最终输出尺寸不等于原生模型一定返回了相同尺寸。参数构造由本地浏览器、Node 后端和 Cloudflare 共用，真实返回画质仍需单独生成验证。

生成代理读取 base64 PNG/JPEG/WebP 的尺寸元数据，按实际可用的 `2:1` 裁切像素对比请求档位；低于档位时仍返回原图，但本次积分全额返还，`creditsDeducted` 为 `0`、`creditsRefunded` 为返还数量，服务端本身不自动重发。前端在 failover / round-robin 模式下，仅当该次调用的全额退款已在响应中确认（或无服务端计费）时，才会继续尝试路由中的下一个模型，完成后保留尺寸最大的结果并如实展示累计退款，备用尝试存在未确认退款的净扣费时同样如实披露；单模型模式、退款无法确认（旧版线上接口）或已无下一个候选模型时保留原图，不产生不可见的重复扣费。前端展示请求档位、原图尺寸和已确认的退款，不拉伸低像素图片冒充 4K。仅返回远程 URL 或无法识别的元数据时，状态为 `unverified`，不冒充已通过尺寸校验、不凭空返还积分，也不会额外抓取任意 URL。旧版线上接口未确认退款时，前端不会声称已退款。尺寸元数据只能证明文件声明的像素大小，不能证明模型内部原生细节或接缝质量。

元数据工具对 JPEG 保留原编码像素，仅更新 PhotoSphere XMP；PNG / WebP 转换为 JPEG 后注入。图片解码、编码和视频录制失败会明确报错并释放资源，不将空文件当作成功结果。

### 2. 生产打包
前台内置文案统一为英文（包括账户、生成状态、嵌入说明和公共 API 错误）；私有管理控制台保留中文。登录与注册显式发送 `mode: login/register`，登录未知邮箱不会创建账户，关闭弹窗会取消请求且不应用迟到的身份响应。

游客导航提供明确的登录和注册入口；弹窗提供两种模式的显式切换、显示密码、可选姓名，打开时聚焦邮箱，关闭后清空密码并重置入口状态。注册成功后显示已登录及实际积分余额；从套餐进入会展示服务端公开价格、付款周期与积分摘要，继续保留原套餐选择，不在注册时创建订阅。游客积分与正式账户积分分开，不自动合并。当前项目未配置发信服务，因此没有邮箱验证或自助密码重置；帮助说明如实标注，不提供无效入口。

首页以可拖拽查看的轻量 360° 全景海景层（WebGL 球体投影，缓慢自动旋转、遵循系统减弱动态偏好，交互时暂停并恢复）展示氛围；静态海景封面保留为首屏 LCP 绘制与 WebGL 不可用时的降级回退，封面素材边界已按内置接缝修复算法处理；不会将原始经纬展开图直接拉伸为背景。工作区默认不挂载完整 SphereViewer 预览，点击演示或收到新的生成结果后才打开，且不自动旋转；提示词关键词和接缝处理默认折叠，风格使用原生下拉框。内置程序化演示明确标注，不冒充真实 AI 作品或社区数据；首页不显示未核实评分、创作者、浏览量和点赞。

套餐页与全站共用账户状态，价格及每次付款发放的积分读取 PayPal 公共配置，默认月付，年付明确显示整年总额、月均参考价和实际折扣。游客选定套餐后先登录，成功后续接原套餐与周期；生成额度不足不再自动弹出付款窗口。全站仅保留一个订阅弹窗，区分待授权、待付款确认、有效、暂停和已取消续费状态，不假装支持即时换套餐或重复订阅。以上流程的浏览器验证使用隔离的模拟 API，不触发真实注册、收费或生图。

```bash
npm run build
```
打包产物位于 `dist/` 目录，可一键部署至 Vercel、Cloudflare Pages、Netlify 或任何 Nginx/静态托管服务器。

生成质量修复：默认自动检测左右边界颜色跳变，仅在明显不连续时融合；可切换强制融合或关闭，模型原图始终保留。此启发式不能重建错位物体或保证真实球面几何。提示词不再强制写实风格或宣称 8K。结果显示每次模型尝试的实际尺寸、耗时及错误，当前标签页仅保存该账户最近一次尝试摘要（不保存提示词、图片或密钥）。服务端输出不含提示词和密钥的结构化尺寸日志，低分辨率仍全额退款且不伪装成 4K。

2026-10-17 真实 4K 探测：当前 GPT 中转返回 1774×887（75.7 秒），Gemini 返回 5504×3072（101.1 秒）。默认路由改为 Gemini 主、GPT 备，请求含响应体读取的超时统一延长至 150 秒。此结果仅代表本次测试，不保证后续所有请求尺寸。

4K 延迟优化：Gemini 3.1 Flash Image 显式指定 minimal thinking（原生 API 与兼容代理分别使用官方及代理支持的字段），保持原生 4K 与参考图。结果分开显示上游等待响应头、接收响应体和本地后处理耗时，不将上游等待冒充前端加载。单次直接中转测试总耗时 67.1 秒，其中响应头等待 38.0 秒、响应体接收与解析 29.1 秒；历史同接口测试 101.1 秒，非受控统计对照，不保证固定提速比例。

### Interactive panorama sharing

After generating, choose **Share panorama** to publish a standalone `/s/<random-id>` viewer. Publishing requires an active permanent account; recipients need no account. The share manager lists the account's latest links, copies links, controls the download button and revokes access. Sharing copies keep the 2:1 projection. PNG files up to 8 MB are kept; larger images are encoded as high-quality JPEG, prioritizing native pixel dimensions. Only if JPEG quality attempts still exceed 20 MB is the sharing copy resized. The generated image and local original downloads are unchanged; recipients download the sharing copy. Uploads are limited to 20 MB, 10 active links and 5 new links per account per day. Anyone with a link can see and save its displayed image; hiding downloads is not DRM, and revocation cannot erase already-saved copies.

`PANORAMA_SHARES` is a private Workers KV namespace bound in `wrangler.toml`; D1 holds ownership, quota, download permission, showcase listing and revocation. Every media request reads access state from D1's primary session and returns `Cache-Control: no-store`. KV contains immutable PNG/JPEG bytes and MIME metadata, never permissions. Existing PNG links without MIME metadata remain supported. New KV writes may take around a minute to propagate to other regions; an unavailable replica returns retryable 503 and the viewer offers retry. The shared page does not initialize guest sessions or expose account information.

### Public showcase listing (opt-in)

Shares are private and `noindex` by default. Ticking **List publicly in the 360 Panorama Showcase** in the share dialog (or `POST /api/shares/:id {"listed":true}`) flips the `listed` flag on that one link: `GET /api/shares?public=1` then returns it anonymously, the `/showcase/` hub lists it, and `functions/s/[[path]].ts` renders `/s/<id>` from the SPA shell with the panorama's own title, description, canonical, OG image and `ImageObject`/`BreadcrumbList` JSON-LD plus an indexable `X-Robots-Tag`. `server/sharePage.mjs` asserts every template anchor it rewrites, so a shell change falls back to the private noindex page instead of silently serving homepage metadata. Unlisting or revoking removes the page from the feed immediately. API endpoints are `GET/POST /api/shares`, `GET /api/shares?public=1`, `GET /api/shares/:id`, `POST /api/shares/:id` (download permission, showcase listing or revoke), and public `/image` and `/download`. This first version runs on Cloudflare Pages; a local Node backend without the KV binding reports sharing unavailable.

Checks: `node --test tests/shares.test.mjs` and the account-isolation/public-viewer regressions in `tests/generation_flow.test.mjs`, plus the normal build, lint and complete test suite.

### Programmatic SEO landing pages

Dedicated tool pages and a guide hub organize distinct panorama workflows. Landing pages include `/photo-to-globe/` (map to globe / maptoglobe), `/cubemap-to-equirectangular/` (six faces back to 2:1), `/text-to-panorama-ai/` (prompt library that loads prompts into the studio), `/developers/` (embed + JSON API), and `/hdri-viewer/` (Radiance RGBE decoding, exposure-controlled preview and tone-mapped PNG/cube-face export).

Adding a landing page touches five places, all required:

1. `src/components/landing/<Name>Page.tsx` — hero, how-to, comparison table, FAQ accordion and a keyword-anchored "related tools" grid; content lives in the React tree so it renders for users and for JS-capable crawlers.
2. `<slug>/index.html` at the repo root — its own title, description, canonical, OG/Twitter tags, `WebApplication` + `HowTo` + `FAQPage` + `BreadcrumbList` JSON-LD, and a `<noscript>` body that mirrors the visible sections for non-JS crawlers.
3. `vite.config.ts` `build.rollupOptions.input` — without it the shell is not emitted into `dist`, and Cloudflare Pages serves the SPA fallback instead of the page.
4. `public/sitemap.xml` — one `<url>` entry with `<image:image>`.
5. `src/App.tsx` — a `getInitialTabFromLocation()` branch (order matters: specific slugs must be tested before the generic `cubemap`/`viewer` ones), an entry in `tabSeoMap`, an entry in `slugMap`, a `navigateTo()` case, and a footer link so the page is reachable from every route.

The cubemap stitcher is the exact inverse of the slicer, and `tests/cubemap_stitch.test.mjs` proves it with a slice → stitch round trip that must land within a mean absolute error of 12/255 on a longitude/latitude gradient.

The HDRI viewer uses the installed Three.js `HDRLoader`, ACES-style tone mapping and the existing cubemap slicer. Files are capped at 50 MiB and 8192 x 4096 pixels in total, with an 8192-pixel maximum side. Header dimensions are checked before float decoding. Cube export and 360 viewing require a full 2:1 equirectangular image. The PNG downloads are 8-bit display images; the original HDR is needed for HDR lighting. OpenEXR is not supported. Run `node --test tests/hdr_tone_map.test.mjs` for the decoding/tone-mapping checks.

### Static guides (`public/blog/`)

The guide hub and four articles are plain HTML with one shared `blog.css`. Vite copies them to `dist/blog/` without route registration or a new build entry. Each article has its own title, description, canonical, social tags, `BlogPosting` and breadcrumb JSON-LD, visible author/date, and contextual links to tools. The hub uses `CollectionPage`/`ItemList` data and is linked from the app footer. Add a new article to the hub and `public/sitemap.xml`; keep factual format limits and any structured data consistent with the actual tool behavior.

Check guide directory URLs with `npm run build` followed by `npm run preview`; Vite development mode can serve the SPA fallback for `/blog/` instead of the public directory's `index.html`. HDRI upload, exposure, cube ZIP export and invalid-input regressions are covered by the two `test_hdri_*` cases in `tests/viewer_cubemap_browser.py` against the development server. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` optionally selects an installed Chromium binary.

### Private generated works (Cloudflare)
Signed-in permanent accounts automatically archive each new model original in private cloud history. Open **My works** in the studio preview toolbar to reopen a panorama, download the exact original, create an explicit public share, or delete the private original. Existing public links are managed separately in Share panorama. Guest results and images generated before this feature are not archived.

The existing `PANORAMA_SHARES` KV binding stores original base64 in private 4 MiB chunks; D1 `panorama_works` enforces owner/session checks on every request. Limits: 50 works per account and about 48 MiB per original. Failed saves are reported alongside generation timing and never discard the generation. Public sharing uses its own compressed copy. Larger libraries should move to R2 when that service is enabled. The standalone local Node backend does not archive originals.

### Abuse and resource limits
Cloudflare authorizes these limits with atomic D1 counters (not isolate memory or KV). Node development mode persists equivalent counters in its single-process JSON store.

- Guest sessions: one new session per network source every 7 days. Guest and new registered accounts share one trial grant per source over the same cooldown. IPv6 addresses are grouped by /64; sources are hashed. Clearing cookies does not reset a grant. This can affect users behind a shared network.
- New accounts: at most 5 registrations/source/day, 100 registrations/site/day, 200 guest initializations/site/day. Free grants/site/day: 100 credits. Registration still works without a second trial gift.
- Generation: 2 concurrent requests/account, 4/site; leases recover after 4 minutes. UTC daily caps: 1,000 requested credits and 200 attempts/site; free accounts share 100 requested credits and 25 attempts/site, with 20 credits/source and 10 attempts/account. Failed requests and quality refunds DO NOT refund these safety budgets. The user's billable balance is still refunded normally when generation fails or quality is below request.
- Cloud originals: 128 MiB/free account, 512 MiB/paid account, 768 MiB/site; sharing copies: 100 MiB/account, 128 MiB/site. Counts are actual stored bytes, including base64 overhead for originals. Existing originals retain a conservative 64 MiB reservation and legacy shares 20 MiB until deleted. No existing image is automatically expired or compressed. At capacity, generation remains downloadable but automatic saving explicitly reports failure.
- Successful physical deletion releases storage reservations. Failed cleanup leaves an inaccessible record with its bytes reserved; an operator must retry cleanup before reclaiming this capacity. This intentionally fails closed rather than accumulating unaccounted images.
- Image transfers: shared images 120/source/hour and 3,000/site/day; originals 40/account/day and 1,000/site/day. Sign-in attempts have durable limits in addition to the existing failed-password throttle. Generation JSON is limited to 24 MiB, authentication JSON to 16 KiB, prompts to 10,000 characters. Limits include chunked bodies.

Operator overrides via Cloudflare deployment environment: `GENERATION_ENABLED=false` pauses model calls, `FREE_TRIAL_ENABLED=false` pauses guest creation/free grants; `MAX_DAILY_GENERATION_CREDITS` (default 1000), `MAX_DAILY_FREE_CREDITS` (100), and `MAX_CONCURRENT_GENERATIONS` (4) accept nonnegative integer strings (zero disables that allowance). Redeploy after changing deployment variables. Authenticated administrators can inspect `/api/admin/risk` for current storage reservations, daily counters, active leases, configured limits, and pause status. No user tokens or original image data are included.

These caps bound application-authorized model attempts and stored image bytes; they are not a currency-denominated provider spending limit or a DDoS guarantee. Distributed proxies can evade per-source controls but still face site caps. Set provider account spending limits and Cloudflare WAF/Turnstile protection before scaling public traffic. Counters reset daily at UTC midnight, except the rolling trial cooldown. Expired counter/session records are purged in bounded batches.
