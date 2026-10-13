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

回归检查：`npm run build`、`npm run lint`、`node --test tests/*.test.mjs`。测试使用模拟模型，不调用真实收费服务；D1 适配测试使用 Node 内置 SQLite，与现有 TypeScript 直读测试一起要求支持这些特性的 Node 版本。

### 2. 生产打包
```bash
npm run build
```
打包产物位于 `dist/` 目录，可一键部署至 Vercel、Cloudflare Pages、Netlify 或任何 Nginx/静态托管服务器。
