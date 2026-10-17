# PanoramaAI Studio — AI 360° Panorama Generator & VR Skybox Engine

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
