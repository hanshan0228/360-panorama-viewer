# Panorama Viewer & 360° Studio — Free Online WebGL Viewer & AI Skybox Suite

[![Live Website](https://img.shields.io/badge/Website-360panoramaviewer.com-00f2fe?style=for-the-badge&logo=googlechrome&logoColor=white)](https://360panoramaviewer.com)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/Three.js-0.186-000000?style=flat-square&logo=threedotjs&logoColor=white)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

A high-performance open-source WebGL **panorama viewer**, **360° photo inspector**, and **AI skybox studio**.

Inspect interactive 360° equirectangular panoramas, cylindrical wide shots, and DJI drone captures online for free. Features Three.js WebGL 2.0 rendering, `Ctrl + V` clipboard paste, Little Planet fisheye projection, VR cardboard split-screen, 6-face cubemap slicing for Unity/Unreal Engine/Godot, and 4K AI skybox generation. 100% client-side privacy with zero server uploads.

**Official Website**: [https://360panoramaviewer.com](https://360panoramaviewer.com)

---

## 🌟 Key Features

### 1. 👁️ Free Online Panorama Viewer (360° & Cylindrical Wide Panoramas)
* **Pure Client-Side WebGL Rendering**: Powered by Three.js `SphereGeometry` and reverse-normals spherical mapping. Runs 100% locally in the browser with zero GPU server overhead.
* **Full Format & Camera Support**:
  * **360° Equirectangular Panoramas**: 2:1 full spherical photos (JPG, PNG, WebP, Radiance `.hdr`);
  * **Cylindrical & Curved Wide Panoramas**: Curved viewport projection for wide-angle panorama photos shot on iPhone, Android, and DSLR stitching;
  * **DJI Drone Sphere Compatibility**: Seamlessly preview stitched 360° spherical JPEGs and DNGs from **DJI Mini 4 Pro, Mini 3 Pro, Mavic 3, Air 3**, and Osmo cameras without installing heavy desktop software.
* **Instant Media Input**:
  * File picker and drag-and-drop support for local images;
  * **`Ctrl + V` Direct Clipboard Paste**: Paste screenshots, saved images, or copied graphics directly into the panorama viewer for immediate inspection.
* **Multi-Projection Modes**:
  * **Interactive 360° Spherical VR Mode**: Mouse drag, touch swipe, inertia scrolling, and FOV wide-angle zoom (`30°` to `105°`);
  * **Cylindrical Curved Mode**: Ideal for ultra-wide mobile phone panoramic shots;
  * **Little Planet Fisheye Mode**: Stereographic outward projection for dynamic miniature planetary overviews.
* **VR Cardboard & Gyroscope Mode**: Dual-eye split-screen view with mobile gyroscope head-tracking support for Meta Quest and Google Cardboard.
* **Navigation & Orientation**:
  * Real-time 2:1 minimap radar with live cardinal heading compass (`N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW`) and view angle cone;
  * Auto-cruise rotation, full-screen immersive view, and one-click high-resolution viewport snapshot export.

---

### 2. 🤖 AI 360° Panorama Generator
* **Standard 2:1 Equirectangular Format**: Generates strictly formatted 360° horizontal × 180° vertical VR skyboxes;
* **Multiple Artistic Styles**: Cyberpunk Neon, Tropical Sunset Beach, Space Nebula, Modern Architecture, Celestial Fantasy Ruins, and Photorealistic Outdoor Landscapes;
* **Seamless Edge Healing**: Employs boundary mirror overlap and alpha cross-fading to eliminate visible vertical seam lines when rotating 360°;
* **Multi-Resolution Tiers**: Supports `1K` (1024×512), `2K` (2048×1024), and `4K` (3840×1920) native resolutions;
* **Export Options**:
  * Native high-quality 2:1 PNG;
  * Radiance `.hdr` RGBE container for physics-based Image-Based Lighting (IBL) in Blender, Unreal Engine 5, and Unity;
  * One-click direct handoff to the Cubemap Slicer or 3D Globe Viewer.

---

### 3. 📦 Equirectangular to Cubemap Slicer (Skybox Engine)
* **Ray-Casting Projection Algorithm**: Real-time browser-based mathematical conversion from 2:1 equirectangular panoramas to standard 6-sided cubic skybox faces:
  * `posx` (Right `+X`)
  * `negx` (Left `-X`)
  * `posy` (Top `+Y`)
  * `negy` (Bottom `-Y`)
  * `posz` (Front `+Z`)
  * `negz` (Back `-Z`)
* **Interactive T-Cross Layout**: Spatial unfolded cross preview showing cubic face alignments;
* **Export Formats**: Download individual PNG faces or export all 6 faces in an organized ZIP archive (powered by JSZip), ready for immediate game-engine import.

---

### 4. 🔄 Cubemap to Equirectangular Converter
* Inverse spherical reconstruction transforming 6 separate cube faces back into a seamless 2:1 equirectangular panorama.
* Automatic alignment detection and lossless browser-side canvas rendering.

---

### 5. 🌅 HDRI Viewer & Environment Tone-Mapping
* Client-side Radiance RGBE (`.hdr`) parsing via Three.js `HDRLoader`;
* Real-time exposure adjustment, ACES-filmic tone mapping, and 360° environment lighting preview;
* Export tone-mapped 8-bit panoramas and cubic skybox faces for real-time engine previews.

---

### 6. 🌍 Photo to 3D Globe
* Wrap any 2D world map, texture, or panorama onto a 3D celestial sphere;
* Custom Fresnel atmospheric blue glow scattering shader;
* Interactive rotation controls, pause toggle, and wireframe mesh perspective.

---

### 7. 🔗 Interactive Panorama Sharing & Embeds
* **Standalone Viewer Links**: Publish generated panoramas to lightweight `/s/<id>` viewer URLs with custom titles and social preview tags;
* **Embeddable iFrames**: Generate responsive embed snippets for blogs, documentation, and client portals;
* **Public Showcase Hub**: Optional listing in the community showcase gallery with discoverable tags.

---

### 8. 🛡️ Verification, Abuse Protection & Payments
* **Anti-Abuse Verification**: Cloudflare Turnstile human challenge integration;
* **Email Verification via Resend**: New accounts register with 0 initial credits and eligible accounts receive a one-time trial upon email verification (8 credits by default), subject to rolling 7-day network cooldowns and daily site limits;
* **Cloudflare D1 & KV Backend**: Atomic balance ledger, session tokens, and KV original image storage;
* **Automated Subscriptions**: Official PayPal checkout integration supporting monthly and yearly recurring billing with cryptographic webhook signature verification.

---

## 🛠️ Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend Framework** | [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite 8](https://vitejs.dev/) |
| **Styling & Design** | [Tailwind CSS v4](https://tailwindcss.com/), Glassmorphism Dark Theme, Lucide Icons |
| **3D & Graphics Engine**| [Three.js](https://threejs.org/) (WebGLRenderer, SphereGeometry, Raycasting, HDRLoader) |
| **Edge Compute & API** | [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/platform/functions/), Cloudflare D1 (SQLite), Cloudflare Workers KV |
| **Mail & Security** | [Resend REST API](https://resend.com/), [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) |
| **Utilities** | [JSZip](https://stuk.github.io/jszip/), Canvas Confetti, Oxlint |

---

## 🚀 Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (version 20.x or higher)
* `npm` (version 10.x or higher)

### 1. Installation
```bash
# Clone the repository
git clone https://github.com/hanshan0228/360-panorama-viewer.git
cd 360-panorama-viewer

# Install dependencies
npm install
```

### 2. Local Development
```bash
# Start the Vite development server
npm run dev
```
Open your browser and navigate to `http://localhost:5173/`.

### 3. Production Build
```bash
# Typecheck and compile production bundle
npm run build

# Preview the production build locally
npm run preview
```
The optimized production artifacts will be generated in the `dist/` directory, ready to deploy to Cloudflare Pages, Vercel, Netlify, or any static hosting server.

### 4. Running Tests & Linting
```bash
# Run Oxlint linter
npm run lint

# Run automated Node test suites
node --test tests/*.test.mjs
```

---

## ⚙️ Configuration & Environment Variables

For full production features (email verification, AI model generation, and payments), configure the following environment variables (see `.env.example`):

```bash
# Application origin URL
APP_ORIGIN=https://360panoramaviewer.com

# Email verification via Resend
RESEND_API_KEY=re_your_api_key
VERIFICATION_FROM_EMAIL=360 Panorama Viewer <verify@mail.360panoramaviewer.com>

# Cloudflare Turnstile bot protection
TURNSTILE_SITE_KEY=0x4AAAAAA...
TURNSTILE_SECRET_KEY=0x4AAAAAA...

# PayPal subscription billing (optional)
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_secret
PAYPAL_MODE=live

# Optional AI panorama quality reviewer overrides (defaults to gemini-3-flash on the active endpoint)
PANORAMA_REVIEW_MODEL=gemini-3-flash
PANORAMA_REVIEW_BASE_URL=
PANORAMA_REVIEW_API_KEY=
```

---

## 🎮 Engine & Platform Compatibility

| Engine / Platform | Integration Type | Output Format | Supported Workflow |
| :--- | :--- | :--- | :--- |
| **Unity** | Standard Skybox Shader | 6-face Cubemap ZIP (`posx`, `negx`, etc.) | Drag-and-drop into Unity Skybox material |
| **Unreal Engine 5** | HDRIBackdrop & Skylight | Radiance `.hdr` / 2:1 Equirectangular PNG | Real-time IBL environment lighting |
| **Roblox Studio** | Sky Object | 6-face Cubemap Slices (PNG) | Assign to Skybox assets in Lighting |
| **Godot Engine** | PanoramaSkyMaterial | 2:1 Equirectangular or Cubemap | Native WebGL/Vulkan sky rendering |
| **Blender & Maya** | World Environment Shader | Radiance 32-bit `.hdr` RGBE | Cycles / Eevee photorealistic lighting |
| **DJI Drones** | Direct Photo Inspection | 2:1 Spherical JPEG / DNG | Mini 4 Pro, Mini 3, Mavic 3, Air 3 |
| **VR Headsets** | WebXR & Cardboard | Stereoscopic Split-Screen / Equirectangular | Meta Quest 3, Apple Vision Pro, Cardboard |

---

## ❓ Frequently Asked Questions (FAQ)

### What formats does this online panorama viewer support?
This **panorama viewer** supports standard 2:1 equirectangular spherical panoramas, ultra-wide cylindrical panoramic photos (from iPhone and Android panorama mode), DJI drone spheres, and 32-bit Radiance `.hdr` environment maps in JPG, PNG, WebP, and HDR formats.

### How do I view 360 photos taken by DJI drones without software?
Open **[360panoramaviewer.com](https://360panoramaviewer.com)** and drag your DJI drone panorama (from DJI Mini 4 Pro, Mini 3 Pro, Mavic 3, or Air 3) directly into the browser. The Three.js WebGL viewer renders the spherical environment instantly with zero file uploads and complete privacy.

### How do I convert an equirectangular panorama into a 6-sided cubemap?
Upload your 2:1 panoramic image to the **Equirectangular to Cubemap** tool. The client-side ray-casting algorithm mathematically projects the spherical texture onto 6 rectilinear cube faces (+X Right, -X Left, +Y Top, -Y Bottom, +Z Front, -Z Back). You can download all 6 faces bundled in a ZIP file formatted for Unity and Roblox.

### Can I convert 6 cubemap faces back into an equirectangular panorama?
Yes! Use the **Cubemap to Equirectangular** tab to upload your 6 cube faces. The engine performs reverse spherical reconstruction to synthesize a seamless 2:1 equirectangular PNG image.

### Is this 360 panorama viewer completely free and open-source?
Yes. The core WebGL viewer and conversion suite are open-source under the MIT License. Image rendering and projection happen 100% client-side in your browser using Three.js and HTML5 Canvas, ensuring complete data privacy.

---

## 🔍 SEO & Discoverability Keywords

`360 panorama viewer`, `AI 360 panorama generator`, `equirectangular to cubemap`, `cubemap slicer`, `VR skybox generator`, `Three.js WebGL panorama`, `HDRI viewer`, `photo to globe`, `360 photo viewer`, `dji 360 viewer`, `insta360 online viewer`, `360 pic viewer`, `360 reader`, `skybox converter`, `Unity skybox`, `Unreal Engine environment map`, `spherical panorama player`.

---

## 📄 License
This project is open-source under the [MIT License](https://opensource.org/licenses/MIT).
