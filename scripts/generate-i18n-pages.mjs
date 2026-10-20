import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const DOMAIN = 'https://360panoramaviewer.com';

const LANGUAGES = [
  { code: 'en', name: 'English', locale: 'en_US' },
  { code: 'zh', name: '简体中文', locale: 'zh_CN' },
  { code: 'es', name: 'Español', locale: 'es_ES' },
  { code: 'de', name: 'Deutsch', locale: 'de_DE' },
  { code: 'ja', name: '日本語', locale: 'ja_JP' },
];

const LABELS = {
  zh: { open: '打开工具（英文界面）', notice: '本页提供中文介绍。交互工具目前使用英文界面。', faq: '常见问题', tools: '相关工具', languages: '语言', home: '首页', skip: '跳到正文', ai: 'AI 生成功能需要积分，免费试用以当前可用额度为准；本地查看和切图工具免费。' },
  es: { open: 'Abrir herramienta (en inglés)', notice: 'Esta guía está en español. La interfaz de la herramienta está en inglés.', faq: 'Preguntas frecuentes', tools: 'Herramientas relacionadas', languages: 'Idiomas', home: 'Inicio', skip: 'Ir al contenido', ai: 'La generación con IA requiere créditos; la prueba depende de la disponibilidad. El visor y el corte local son gratuitos.' },
  de: { open: 'Werkzeug öffnen (auf Englisch)', notice: 'Diese Anleitung ist auf Deutsch. Die Werkzeugoberfläche ist auf Englisch.', faq: 'Häufig gestellte Fragen', tools: 'Weitere Werkzeuge', languages: 'Sprachen', home: 'Startseite', skip: 'Zum Inhalt', ai: 'KI-Generierung benötigt Guthaben; eine Testphase hängt von der Verfügbarkeit ab. Lokaler Viewer und Zuschnitt sind kostenlos.' },
  ja: { open: 'ツールを開く（英語の画面）', notice: 'このページは日本語のガイドです。ツールの操作画面は英語です。', faq: 'よくある質問', tools: '関連ツール', languages: '言語', home: 'ホーム', skip: '本文へ', ai: 'AI生成にはクレジットが必要です。無料体験は利用状況によります。ローカル表示と分割ツールは無料です。' },
};

const PAGES = [
  {
    id: 'home',
    slug: '',
    translations: {
      en: {
        title: 'AI 360 Panorama Generator and VR Skybox Studio',
        description: 'Generate seamless 2:1 equirectangular 360 panoramas, cubemaps, and VR skyboxes with AI. Free online panorama viewer and image-to-360 converter.',
        keywords: 'ai panorama generator, 360 panorama generator, vr skybox ai, text to panorama, equirectangular 360, 360 photo creator',
        h1: 'AI 360 Panorama Generator & VR Skybox Studio',
        sub: 'Create seamless 360° equirectangular panoramas, cubemaps, and VR skyboxes in seconds.',
        faq: [
          { q: 'What is an AI 360 Panorama Generator?', a: 'An AI tool that generates seamless 2:1 equirectangular 360-degree panoramic images and VR skyboxes from natural text descriptions or 2D photos.' },
          { q: 'Is there a free 360 viewer included?', a: 'Yes. Every generated or uploaded panorama opens directly in our client-side WebGL viewer with no plugin or account required.' }
        ]
      },
      zh: {
        title: '360全景图查看器与AI全景工作室',
        description: '免费在浏览器中查看2:1全景图，无需上传。也可使用AI从文字或参考照片创建360全景，AI生成需要积分。',
        keywords: 'AI全景图生成器, 360全景制作, VR天空盒AI, 文本生成全景图, 360全景查看器, 等距柱状投影全景, 图片转全景',
        h1: '360°全景图查看器与AI工作室',
        sub: '免费在浏览器中查看2:1全景图，也可使用文字或参考照片通过AI创建全景。查看器无需上传；AI生成需要积分。',
        faq: [
          { q: '什么是AI 360全景图生成器？', a: '这是一款基于前沿深度学习的在线工具，能够根据自然语言描述或参考图片，生成标准的2:1等距柱状360度全景照片和VR游戏天空盒。' },
          { q: '是否包含免费的360全景查看器？', a: '是的。支持直接拖拽、粘贴(Ctrl+V)本地全景图在浏览器中平移漫游，完全在本地GPU渲染，绝不上传您的私人照片。' }
        ]
      },
      es: {
        title: 'Visor de Panoramas 360 y Estudio de IA',
        description: 'Visor gratuito de panoramas 360° en el navegador sin subir archivos. Crea panoramas 2:1 con texto o fotos mediante IA; la generación requiere créditos.',
        keywords: 'generador de panorama con ia, generador 360 panorama, skybox vr ia, texto a panorama, visor 360, foto a 360',
        h1: 'Visor de Panoramas 360° y Estudio de IA',
        sub: 'Visualiza panoramas 2:1 gratis en el navegador o crea uno con texto e imágenes de referencia mediante IA. El visor no sube archivos; la generación requiere créditos.',
        faq: [
          { q: '¿Qué es un generador de panoramas 360 con IA?', a: 'Es una herramienta web que crea imágenes panorámicas esféricas 2:1 y skyboxes de realidad virtual a partir de texto o fotos normales.' },
          { q: '¿Incluye un visor 360 gratuito?', a: 'Sí. Puedes abrir e inspeccionar cualquier panorama directamente en el navegador con WebGL sin subir tus archivos a ningún servidor.' }
        ]
      },
      de: {
        title: '360° Panorama Viewer und KI-Studio Online',
        description: 'Kostenloser 360° Panorama Viewer im Browser ohne Upload. Erstelle 2:1-Panoramen mit KI aus Text oder Referenzfotos; die Generierung benötigt Guthaben.',
        keywords: 'ki panorama generator, 360 panorama generator, vr skybox ki, text zu panorama ki, 360 bild betrachter, foto in 360 umwandeln',
        h1: '360° Panorama Viewer und KI-Studio',
        sub: 'Betrachte 2:1-Panoramen kostenlos im Browser oder erstelle sie mit KI aus Text und Referenzbildern. Der Viewer arbeitet ohne Upload; KI-Generierung benötigt Guthaben.',
        faq: [
          { q: 'Was ist ein KI 360 Panorama Generator?', a: 'Ein Webtool, das aus Textprompts oder 2D-Fotos nahtlose 2:1 Kugelpanoramen und 3D-Skyboxes erzeugt.' },
          { q: 'Ist ein kostenloser 360 Viewer enthalten?', a: 'Ja, unser WebGL-Viewer läuft zu 100% lokal im Browser ohne Server-Uploads.' }
        ]
      },
      ja: {
        title: '360度パノラマビューアーとAIスタジオ',
        description: '2:1パノラマをブラウザで無料表示。表示はアップロード不要です。テキストや参照写真からのAIパノラマ生成にはクレジットが必要です。',
        keywords: 'aiパノラマ生成器, 360度パノラマ作成, vrスカイボックス生成, テキストからパノラマ, 360写真ビューア, 画像360変換',
        h1: '360度パノラマビューアーとAIスタジオ',
        sub: '2:1パノラマをブラウザで無料表示し、テキストや参照写真からAIで新しいパノラマを作成できます。表示はアップロード不要、AI生成にはクレジットが必要です。',
        faq: [
          { q: 'AI 360度パノラマ生成器とは何ですか？', a: 'テキストの説明や2D写真から、VRや3Dゲームエンジンで使用できる完全な360度正距円筒画像を生成するツールです。' },
          { q: '無料の360度ビューアーは付属していますか？', a: 'はい。ローカル表示では写真をアップロードせず閲覧できます。AI生成の参照写真はサービスに送信されます。' }
        ]
      }
    }
  },
  {
    id: 'viewer',
    slug: '360-panorama-viewer',
    translations: {
      en: {
        title: 'Free 360 Panorama Viewer Online — No Upload Required',
        description: 'Inspect and roam equirectangular 360 panoramas in real-time WebGL with Ctrl+V clipboard support, Little Planet view, and zero server uploads.',
        keywords: '360 panorama viewer, panorama viewer, panorama view, 360 viewer, view 360 photos, photo sphere viewer, sphere photo viewer, equirectangular viewer',
        h1: 'Free 360 Panorama Viewer Online',
        sub: 'Explore, rotate, and inspect 360° equirectangular panoramas directly in your browser. 100% private with local GPU rendering.',
        faq: [
          { q: 'Are my panorama photos uploaded to your server?', a: 'No. All rendering occurs locally on your device via WebGL. Your photos never leave your computer or phone.' },
          { q: 'Can I paste an image directly from the clipboard?', a: 'Yes! Simply press Ctrl+V (or Cmd+V on macOS) to instantly load and view a copied 360 panorama.' }
        ]
      },
      zh: {
        title: '免费在线360全景图查看器 — 免上传/剪贴板Ctrl+V直接看',
        description: '完全免费的在线360度全景图查看器。纯前端WebGL实时平移缩放、小行星视角与剪贴板Ctrl+V直接打开，无需上传云端，隐私100%安全。',
        keywords: '360全景查看器, 全景图查看, 360看图工具, 在线全景照片播放器, 全景球查看器, 360度全景照片查看, 免上传全景预览',
        h1: '免费在线 360° 全景图查看器',
        sub: '在浏览器中流畅漫游、旋转和检查360度等距柱状全景照片。本地GPU渲染，绝不上传文件。',
        faq: [
          { q: '全景照片会上传到服务器吗？', a: '完全不会。所有渲染过程通过浏览器WebGL直接在您的显卡上运行，照片不离开您的电脑或手机。' },
          { q: '支持剪贴板直接粘贴图片吗？', a: '支持！复制2:1全景图片后，在页面任意位置按下 Ctrl+V（Mac为Cmd+V）即可瞬间展开全景视图。' }
        ]
      },
      es: {
        title: 'Visor de Panoramas 360 Online Gratis — Sin Subir Archivos',
        description: 'Explora fotos 360° equirrectangulares en tiempo real con WebGL, modo Little Planet y soporte Ctrl+V. 100% privado sin subir a servidores.',
        keywords: 'visor panorama 360, visor 360 gratis, ver fotos 360, visor de esfera fotografica, visor panoramico online, ver panorama 360',
        h1: 'Visor de Panoramas 360° Online Gratis',
        sub: 'Gira y navega por fotos panorámicas esféricas 360 al instante en tu navegador. 100% privado y seguro.',
        faq: [
          { q: '¿Mis fotos se suben a algún servidor?', a: 'No. El visor procesa la imagen completamente en la memoria de tu navegador mediante WebGL. Tus fotos nunca salen de tu dispositivo.' },
          { q: '¿Puedo pegar imágenes desde el portapapeles?', a: '¡Sí! Pulsa Ctrl+V (o Cmd+V en Mac) para cargar y ver cualquier panorama copiado inmediatamente.' }
        ]
      },
      de: {
        title: 'Kostenloser 360° Panorama Viewer Online — Ohne Upload',
        description: '360 Grad Kugelpanoramen direkt im Browser ansehen. Echtzeit-WebGL-Rendering, Little Planet Modus und Strg+V Zwischenablage-Unterstützung.',
        keywords: '360 panorama viewer, panorama betrachter, 360 grad fotos ansehen, kugelpanorama viewer, photo sphere betrachter, equirektangulaer viewer',
        h1: 'Kostenloser 360° Panorama Betrachter',
        sub: 'Navigiere und erkunde equirektanguläre 360° Panoramen ohne Installation und ohne Server-Upload.',
        faq: [
          { q: 'Werden meine Bilder auf einen Server geladen?', a: 'Nein. Das Rendering läuft vollständig clientseitig im WebGL-Speicher Ihres Browsers.' },
          { q: 'Unterstützt der Viewer das Einfügen per Zwischenablage?', a: 'Ja! Drücken Sie einfach Strg+V (Cmd+V auf Mac), um ein kopiertes Panorama direkt anzuzeigen.' }
        ]
      },
      ja: {
        title: '無料オンライン360度パノラマビューアー — アップロード不要',
        description: '正距円筒図法360度パノラマ写真をブラウザで即座に閲覧。WebGLリアルタイム描画、リトルプラネット表示、Ctrl+V直接貼り付け対応。',
        keywords: '360パノラマビューア, 360度写真閲覧, パノラマビューアオンライン, 全天球画像ビューア, フォトスフィア閲覧, 360ビューア無料',
        h1: '無料オンライン 360° パノラマビューアー',
        sub: 'アップロード不要。ブラウザ内で直接360度パノラマ写真を回転・拡大・探索できます。',
        faq: [
          { q: '写真データはサーバーに送信されますか？', a: 'いいえ。すべてのレンダリングはお使いの端末のGPU（WebGL）でローカル実行され、データは外部に送信されません。' },
          { q: 'クリップボードからの直接貼り付けに対応していますか？', a: 'はい。コピーしたパノラマ画像を画面上で Ctrl+V（Macは Cmd+V）するだけで即座に全天球表示されます。' }
        ]
      }
    }
  },
  {
    id: 'globe',
    slug: 'photo-to-globe',
    translations: {
      en: {
        title: 'Map to Globe — Free 2D Image to 3D Rotating Globe Maker',
        description: 'Wrap 2D fantasy maps and equirectangular images onto interactive 3D revolving spheres. Free alternative to MapToGlobe with zero server uploads.',
        keywords: 'maptoglobe, maps to globe, globe maker, image to globe, globe generator, photo to globe, map to globe alternative, 2d map to 3d globe',
        h1: 'Map to Globe: 2D Image to 3D Rotating Sphere',
        sub: 'Transform fantasy world maps, textures, and panoramic photos into spinning 3D globes in real-time WebGL.',
        faq: [
          { q: 'Is this a free alternative to MapToGlobe?', a: 'Yes. It provides client-side spherical projection without uploading maps.' },
          { q: 'Can I export rotating videos or 3D models?', a: 'The globe rotates interactively. Use a screen recorder to capture it; this tool does not export 3D models.' }
        ]
      },
      zh: {
        title: '地图转地球(Map to Globe) — 免费2D图片转3D旋转地球制作器',
        description: '将2D平面地图或全景照片无缝包裹在交互式3D旋转球体上。可用于架空世界观建造与游戏地图球体化。',
        keywords: 'maptoglobe替代品, 地图转地球, 2D地图转3D球体, 地球仪制作器, 图片转地球, 架空世界地图球体化, 在线旋转地球仪',
        h1: 'Map to Globe: 2D平面地图转3D旋转球体',
        sub: '将世界地图、架空设定图或全景照片即时投射为3D可交互旋转地球仪。纯前端实时计算，免费无限制。',
        faq: [
          { q: '可以作为MapToGlobe的替代工具吗？', a: '可以。本工具在浏览器中完成球体映射，无需上传地图。' },
          { q: '适合世界观设定与DnD跑团地图吗？', a: '非常适合。无论是r/worldbuilding创作者还是DnD地下城主，都可以瞬间直观查看大陆两极与经纬度无缝闭合情况。' }
        ]
      },
      es: {
        title: 'Map to Globe — Convierte Mapas 2D en Globos Terráqueos 3D',
        description: 'Proyecta mapas 2D e imágenes equirrectangulares en esferas 3D giratorias e interactivas. Alternativa gratuita a MapToGlobe.',
        keywords: 'maptoglobe alternativa, crear globo terráqueo, mapa a globo 3d, imagen a esfera 3d, generador de globo online, mapa fantastico 3d',
        h1: 'Map to Globe: De Mapa 2D a Globo 3D Giratorio',
        sub: 'Convierte mapas de mundos fantásticos y texturas en esferas 3D interactivas con WebGL en tiempo real.',
        faq: [
          { q: '¿Es una alternativa a MapToGlobe?', a: 'Sí. Ofrece proyección esférica instantánea en el navegador sin esperas de servidor ni pérdida de calidad.' },
          { q: '¿Qué tipo de imágenes puedo usar?', a: 'Cualquier imagen 2:1 rectangular (JPG, PNG, WebP) de mapas mundiales reales o ficticios.' }
        ]
      },
      de: {
        title: 'Map to Globe — 2D Karten in 3D Rotierende Globen Verwandeln',
        description: 'Projiziere 2D-Weltkarten und equirektanguläre Bilder auf interaktive 3D-Kugeln. Kostenlose Alternative zu MapToGlobe.',
        keywords: 'maptoglobe alternative, karte zu globus, 2d karte auf 3d kugel, globus erstellen online, fantasy weltkarte globus',
        h1: 'Map to Globe: 2D Karte zu 3D Kugel',
        sub: 'Wickle Fantasy-Karten, Weltkarten und Texturen in Echtzeit um einen 3D-Globus.',
        faq: [
          { q: 'Ist dies eine MapToGlobe Alternative?', a: 'Ja! Unser Tool läuft direkt im Browser ohne Server-Warteschlangen und ohne Registrierung.' },
          { q: 'Werden meine Kartendateien gespeichert?', a: 'Nein, alle Berechnungen finden lokal auf Ihrer Grafikkarte statt.' }
        ]
      },
      ja: {
        title: 'Map to Globe — 2D地図を3D回転地球儀に変換する無料ツール',
        description: '2Dの世界地図やパノラマ画像をインタラクティブな3D回転球体に投影。MapToGlobeの無料代替ツールとして活用可能。',
        keywords: 'maptoglobe代替, 地図から地球儀, 2D地図を3D球体に, 架空地図地球儀化, 球体マップジェネレーター, 画像から3D地球儀',
        h1: 'Map to Globe: 2D地図から3D回転球体へ',
        sub: 'ファンタジー世界の地図やパノラマ写真を、ブラウザ上で瞬時に3D地球儀として立体化・回転表示。',
        faq: [
          { q: 'MapToGlobeの代替として使えますか？', a: 'はい！サービスの終了したMapToGlobeの完全な代替として、ローカルWebGLで高速に球体マッピングします。' },
          { q: '創作世界観やTRPGマップにも使えますか？', a: '最適です。大陸の極地での歪みや東西の繋がりを立体的に確認できます。' }
        ]
      }
    }
  },
  {
    id: 'cubemap',
    slug: 'cubemap-generator',
    translations: {
      en: {
        title: 'Cubemap Generator — Free 6-Sided Skybox Slicer Online',
        description: 'Convert 2:1 equirectangular 360 panoramas into 6 rectilinear cube faces (+X, -X, +Y, -Y, +Z, -Z). Free cubemaps download and one-click ZIP packaging for Unity and Unreal.',
        keywords: 'cubemap generator, panorama to cubemap, cubemaps free, free cubemaps, free cube map, equirectangular to cubemap, unity skybox slicer',
        h1: 'Cubemap Generator: Slice 360° Panoramas to 6 Cube Faces',
        sub: 'Slice 2:1 spherical panoramas into 6 rectilinear cube faces for Unity, Unreal Engine, and Three.js with instant ZIP export.',
        faq: [
          { q: 'Can I download free cubemaps without uploading?', a: 'Yes! Click any of our free skybox presets (Cosmic Nebula, Cyberpunk Metropolis, Tropical Sunset) to download the ready-sliced 6-face ZIP pack.' },
          { q: 'How are the cube faces named?', a: 'The ZIP archive contains posx.png, negx.png, posy.png, negy.png, posz.png, and negz.png matching standard Unity Skybox / 6-sided shader slots.' }
        ]
      },
      zh: {
        title: '立方体贴图生成器(Cubemap Generator) — 免费360全景切图为6面天空盒',
        description: '将2:1全景图在浏览器本地转换为6张PNG立方体贴图，支持256、512或1024像素分辨率和ZIP下载。含示例与Unity天空盒设置说明。',
        keywords: 'cubemap generator, 全景转cubemap, 免费cubemap下载, 立方体贴图生成器, 全景切图为6面, unity天空盒贴图切片, unreal cubemap',
        h1: '立方体贴图生成器：将360°全景切为6面天空盒',
        sub: '在浏览器本地将2:1全景图转换为6张PNG，按256、512或1024像素导出ZIP；切图无需上传、登录或AI积分。',
        faq: [
          { q: '无需上传可以直接下载免费立方体贴图包吗？', a: '可以。先打开英文工具，选择示例，即可对照原图与6面预览并下载ZIP，无需上传自己的照片。' },
          { q: '支持导入Unity和虚幻引擎吗？', a: 'PNG可按坐标轴分配给Unity的6 Sided天空盒。ZIP不是Unreal的TextureCube资产；HDRI Backdrop应使用受支持的原始.hdr文件，PNG不保留HDR照明数值。' }
        ]
      },
      es: {
        title: 'Generador de Cubemaps — Divide Panoramas 360 en 6 Caras',
        description: 'Convierte panoramas 2:1 en seis PNG de 256, 512 o 1024 píxeles por cara. Conversión local gratuita, ejemplos, descarga ZIP y guía de skybox para Unity.',
        keywords: 'generador de cubemaps, panorama a cubemap, cubemaps gratis, equirrectangular a mapa cubico, skybox unity 6 caras',
        h1: 'Generador de Cubemaps: Panorama 360 a 6 Caras',
        sub: 'Convierte un panorama 2:1 en seis PNG de 256, 512 o 1024 píxeles por cara. Descarga el ZIP sin subir archivos ni iniciar sesión.',
        faq: [
          { q: '¿Puedo descargar cubemaps gratis?', a: 'Sí. Abre primero la herramienta en inglés y elige un ejemplo para comparar el panorama con las seis caras y descargar el ZIP sin subir fotos.' },
          { q: '¿Qué motores son compatibles?', a: 'Asigna los PNG por eje en el skybox 6 Sided de Unity. El ZIP no es un recurso TextureCube de Unreal; HDRI Backdrop requiere un archivo .hdr compatible. Los PNG no conservan los valores de iluminación HDR.' }
        ]
      },
      de: {
        title: 'Cubemap Generator — 360° Panoramen in 6 Würfelflächen Aufteilen',
        description: 'Wandle 2:1-Panoramen lokal in sechs PNGs mit 256, 512 oder 1024 Pixeln pro Fläche um. Kostenlos mit Beispielen, ZIP-Download und Unity-Anleitung.',
        keywords: 'cubemap generator, panorama zu cubemap, kostenlose cubemaps, equirektangulaer zu cubemap, unity skybox slicer',
        h1: 'Cubemap Generator: 360° Panorama zu 6 Würfelflächen',
        sub: 'Wandle ein vollständiges 2:1-Panorama lokal in sechs PNGs mit 256, 512 oder 1024 Pixeln pro Fläche um. ZIP-Download ohne Upload oder Anmeldung.',
        faq: [
          { q: 'Gibt es kostenlose Cubemaps zum Download?', a: 'Ja. Öffnen Sie das englische Werkzeug und wählen Sie ein Beispiel. Vergleichen Sie das Panorama mit den sechs Flächen und laden Sie das ZIP ohne eigene Fotos herunter.' },
          { q: 'Wie lauten die Dateinamen?', a: 'Die Dateien heißen posx.png, negx.png, posy.png, negy.png, posz.png und negz.png. Ordnen Sie sie nach Achsen zu. Das ZIP ist kein Unreal-TextureCube; HDRI Backdrop benötigt eine unterstützte .hdr-Datei. PNGs erhalten keine HDR-Lichtwerte.' }
        ]
      },
      ja: {
        title: 'キューブマップ生成器 — 360度パノラマを6面スカイボックスに分割',
        description: '2:1パノラマをブラウザ内で6枚のPNGに変換。各面256・512・1024ピクセル、無料サンプル、ZIP出力、Unity設定ガイドに対応。',
        keywords: 'キューブマップ生成器, パノラマからキューブマップ, 無料キューブマップ, スカイボックス分割, unityキューブマップ作成, unrealスカイボックス',
        h1: 'キューブマップ生成器：360°パノラマを6面に分割',
        sub: '完全な2:1パノラマを各面256・512・1024ピクセルの6枚のPNGに変換します。アップロードやログインなしでZIPを保存できます。',
        faq: [
          { q: '画像をアップロードせずに無料キューブマップを入手できますか？', a: 'はい。英語のツールを開いてサンプルを選ぶと、元のパノラマと6面を比較し、写真をアップロードせずにZIPを保存できます。' },
          { q: 'UnityやThree.jsに対応していますか？', a: 'PNGを軸に合わせてUnityの6 Sidedスカイボックスに割り当てます。ZIPはUnrealのTextureCubeではありません。HDRI Backdropには対応する元の.hdrを使用してください。PNGはHDR照明値を保持しません。' }
        ]
      }
    }
  },
  {
    id: 'photo360',
    slug: 'photo-to-360-converter',
    translations: {
      en: {
        title: 'Photo to 360 Converter AI — Convert 2D Images to 360 Panoramas',
        description: 'Transform normal 2D photos and wide architectural renders into spherical 360 equirectangular panoramas using reference-image AI generation.',
        keywords: 'convert image to 360, 360 image converter, how to make photo 360 degree, photo to 360 converter, 2d to 360 panorama, image to 360',
        h1: 'Photo to 360 Converter AI',
        sub: 'Convert ordinary 2D photos and wide landscape shots into immersive 360° panoramas with seam healing.',
        faq: [
          { q: 'How does photo to 360 conversion work?', a: 'Reference photos guide server-side AI generation of a new 2:1 panorama. Generated details may differ from the original scene.' },
          { q: 'Is this converter free?', a: 'AI generation requires credits; trial credits depend on availability. The local panorama viewer is free.' }
        ]
      },
      zh: {
        title: '照片转360全景图AI — 普通2D图片一键转换为360度全景',
        description: '使用AI智能重投影与无缝边缘融合技术，将普通2D平面照片、广角风光与效果图转换为标准的2:1等距柱状360度全景图。',
        keywords: '图片转360全景, 普通照片做成全景图, 2D转360全景AI, 照片转全景图在线, 平面图片转球形全景, 免费图片转全景',
        h1: '照片转 360° 全景图 AI 工具',
        sub: '将普通的2D宽幅照片、建筑效果图转化为可在VR与全景播放器中环顾漫游的360度球形全景。',
        faq: [
          { q: '普通照片怎么转成360全景？', a: '参考照片会发送至AI生成服务，用于生成新的2:1全景图。AI补充的细节不一定与真实场景一致，生成需要积分。' },
          { q: '转换后的全景图可以在手机上查看吗？', a: '可以！直接在内置的360全景查看器中拖拽转动，或下载后发送至支持全景浏览的应用中。' }
        ]
      },
      es: {
        title: 'Conversor de Foto a 360 IA — Convierte Fotos 2D a Panoramas 360°',
        description: 'Transforma fotos 2D normales y tomas panorámicas en panoramas equirrectangulares 360° esféricos con IA y fusión de bordes.',
        keywords: 'convertir imagen a 360, foto a 360 grados, conversor imagen 360, como hacer foto 360, 2d a panorama 360',
        h1: 'Conversor de Foto a Panorama 360° con IA',
        sub: 'Convierte fotos 2D estándar en experiencias inmersivas 360° listas para visores VR y redes sociales.',
        faq: [
          { q: '¿Cómo funciona la conversión de 2D a 360?', a: 'Las fotos de referencia se envían al servicio de IA para generar un panorama 2:1 nuevo. Los detalles generados pueden diferir de la escena real.' },
          { q: '¿Es gratuito?', a: 'La generación con IA requiere créditos y envía las referencias al servicio. El visor local es gratuito.' }
        ]
      },
      de: {
        title: 'Foto zu 360 Grad Konverter KI — 2D Bilder in 360° Panoramen',
        description: 'Verwandle normale 2D-Fotos und Weitwinkelaufnahmen in equirektanguläre 360°-Kugelpanoramen mit automatischer Nahtkorrektur.',
        keywords: 'bild in 360 umwandeln, foto zu 360 grad, 2d bild in panorama, 360 grad bild konverter kostenlos',
        h1: 'Foto zu 360° Panorama Konverter KI',
        sub: 'Wandle normale Fotos in nahtlose 360°-Kugeln um, die sich drehen und erkunden lassen.',
        faq: [
          { q: 'Wie funktioniert die Konvertierung?', a: 'Referenzfotos werden an den KI-Dienst gesendet, der ein neues 2:1-Panorama erzeugt. Generierte Details können von der realen Szene abweichen.' },
          { q: 'Bleiben meine Fotos privat?', a: 'Für die KI-Generierung werden Referenzbilder an den Dienst gesendet. Nur der lokale Panorama-Viewer arbeitet ohne Upload.' }
        ]
      },
      ja: {
        title: '写真360度変換AI — 通常の2D写真を360°パノラマ画像に変換',
        description: '参照写真をAIサービスに送信し、新しい2:1正距円筒360度パノラマを生成します。AI生成にはクレジットが必要です。',
        keywords: '画像360変換, 写真を360度写真にする方法, 2Dから360度パノラマ, 写真360度変換オンライン, 無料360変換',
        h1: '写真から 360° パノラマ変換 AI',
        sub: 'スマートな球体投影と境界ブレンドにより、手持ちの2D写真を全方位見渡せるパノラマ空間に変換。',
        faq: [
          { q: '普通の写真を360度化できますか？', a: 'はい。参照写真をAIサービスに送信し、新しい2:1パノラマを生成します。生成された細部は実際の場面と異なる場合があります。' },
          { q: '無料で使用できますか？', a: 'AI生成にはクレジットが必要で、無料体験は利用状況によります。ローカル表示ツールは無料です。' }
        ]
      }
    }
  }
];

function generateAlternateLinks(pageSlug) {
  const links = [];
  for (const lang of LANGUAGES) {
    const pathPrefix = lang.code === 'en' ? '' : `/${lang.code}`;
    const fullSlug = pageSlug ? `${pageSlug}/` : '';
    const href = `${DOMAIN}${pathPrefix}/${fullSlug}`;
    links.push(`    <link rel="alternate" hreflang="${lang.code}" href="${href}" />`);
  }
  // x-default points to English
  const defaultHref = `${DOMAIN}/${pageSlug ? `${pageSlug}/` : ''}`;
  links.push(`    <link rel="alternate" hreflang="x-default" href="${defaultHref}" />`);
  return links.join('\n');
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function buildHtmlPage(page, langObj) {
  const lang = langObj.code;
  const t = page.translations[lang];
  const ui = LABELS[lang];
  const toolPath = `/${page.slug ? `${page.slug}/` : ''}`;
  const canonicalUrl = `${DOMAIN}/${lang}${toolPath}`;
  const usesCredits = page.id === 'home' || page.id === 'photo360';
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        '@id': `${canonicalUrl}#software`,
        name: t.title,
        description: t.description,
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Web Browser',
        url: canonicalUrl,
        ...(usesCredits ? {} : { offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } }),
      },
      {
        '@type': 'FAQPage',
        '@id': `${canonicalUrl}#faq`,
        mainEntity: t.faq.map(item => ({
          '@type': 'Question', name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
    ],
  };
  // ponytail: localized guides link to the English tool until its UI is translated.
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="stylesheet" href="/blog/blog.css" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(t.title)}</title>
    <meta name="title" content="${escapeHtml(t.title)}" />
    <meta name="description" content="${escapeHtml(t.description)}" />
    <meta name="keywords" content="${escapeHtml(t.keywords)}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="canonical" href="${canonicalUrl}" />
    <meta name="theme-color" content="#040c1a" />
${generateAlternateLinks(page.slug)}
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="${langObj.locale}" />
    <meta property="og:site_name" content="360 Panorama Viewer" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:title" content="${escapeHtml(t.title)}" />
    <meta property="og:description" content="${escapeHtml(t.description)}" />
    <meta property="og:image" content="${DOMAIN}/og-preview.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${canonicalUrl}" />
    <meta name="twitter:title" content="${escapeHtml(t.title)}" />
    <meta name="twitter:description" content="${escapeHtml(t.description)}" />
    <meta name="twitter:image" content="${DOMAIN}/og-preview.png" />
    <script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>
  </head>
  <body>
    <a class="skip-link" href="#content">${ui.skip}</a>
    <header class="topbar">
      <div class="wrap">
        <a class="brand" href="/${lang}/" lang="en">360 Panorama Viewer</a>
        <nav aria-label="${ui.languages}">
          ${LANGUAGES.map(l => `<a href="${l.code === 'en' ? '' : `/${l.code}`}${toolPath}" lang="${l.code}" hreflang="${l.code}"${l.code === lang ? ' aria-current="page"' : ''}>${l.name}</a>`).join('\n          ')}
        </nav>
      </div>
    </header>
    <main class="wrap" id="content">
      <h1>${escapeHtml(t.h1)}</h1>
      <p>${escapeHtml(t.sub)}</p>
      <div class="cta">
        <p>${ui.notice}</p>
        <a class="button" href="${toolPath}" hreflang="en">${ui.open}</a>
      </div>
      ${usesCredits ? `<p class="callout">${ui.ai}</p>` : ''}
      <section aria-labelledby="faq">
        <h2 id="faq">${ui.faq}</h2>
        ${t.faq.map(item => `<h3>${escapeHtml(item.q)}</h3><p>${escapeHtml(item.a)}</p>`).join('\n        ')}
      </section>
      <section aria-labelledby="tools">
        <h2 id="tools">${ui.tools}</h2>
        <div class="grid">
          ${PAGES.filter(p => p.id !== page.id).map(p => `<a class="card" href="/${lang}/${p.slug ? `${p.slug}/` : ''}"><strong>${escapeHtml(p.translations[lang].h1)}</strong><span>${escapeHtml(p.translations[lang].sub)}</span></a>`).join('\n          ')}
        </div>
      </section>
    </main>
    <footer class="wrap"><a href="/${lang}/">${ui.home}</a></footer>
  </body>
</html>`.replace(/^[ \t]+$/gm, '');
}

export function generateAllI18n() {
  let generatedCount = 0;
  const updatedUrls = new Set();

  // Generate for non-English languages (English has existing main templates)
  for (const lang of LANGUAGES) {
    if (lang.code === 'en') continue;

    for (const page of PAGES) {
      const targetDir = page.slug 
        ? path.join(rootDir, lang.code, page.slug)
        : path.join(rootDir, lang.code);

      fs.mkdirSync(targetDir, { recursive: true });
      const targetFile = path.join(targetDir, 'index.html');
      const content = buildHtmlPage(page, lang);
      if (!fs.existsSync(targetFile) || fs.readFileSync(targetFile, 'utf8') !== content) {
        fs.writeFileSync(targetFile, content, 'utf8');
        updatedUrls.add(`${DOMAIN}/${lang.code}/${page.slug ? `${page.slug}/` : ''}`);
      }
      generatedCount++;
    }
  }

  console.log(`Generated ${generatedCount} multilingual i18n landing pages across ${LANGUAGES.length - 1} languages.`);
  for (const page of PAGES) {
    const englishPath = path.join(rootDir, page.slug, 'index.html');
    const html = fs.readFileSync(englishPath, 'utf8').replace(/\n    <!-- Locale alternates -->[\s\S]*?<!-- End locale alternates -->/g, '');
    const alternates = `\n    <!-- Locale alternates -->\n${generateAlternateLinks(page.slug)}\n    <!-- End locale alternates -->`;
    const content = html.replace(/<link rel="canonical"[^>]+>/, match => match + alternates);
    if (fs.readFileSync(englishPath, 'utf8') !== content) {
      fs.writeFileSync(englishPath, content, 'utf8');
      updatedUrls.add(`${DOMAIN}/${page.slug ? `${page.slug}/` : ''}`);
    }
  }
  updateSitemapXml(updatedUrls);
}

function updateSitemapXml(updatedUrls) {
  const sitemapPath = path.join(rootDir, 'public', 'sitemap.xml');
  const modifiedAt = new Date().toISOString();
  const previousXml = fs.readFileSync(sitemapPath, 'utf8');
  const previousDates = new Map([...previousXml.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)].map(match => [match[1], match[2]]));
  const lastmod = url => updatedUrls.has(url) ? modifiedAt : previousDates.get(url) ?? modifiedAt;

  // All canonical pages including our new product-video and hdri-to-cubemap
  const canonicalUrls = [
    { slug: '', prio: '1.0', change: 'daily' },
    { slug: '360-panorama-viewer', prio: '0.95', change: 'daily' },
    { slug: 'photo-to-globe', prio: '0.9', change: 'weekly' },
    { slug: 'cubemap-generator', prio: '0.9', change: 'weekly' },
    { slug: 'photo-to-360-converter', prio: '0.9', change: 'weekly' },
    { slug: '360-product-video-generator', prio: '0.9', change: 'weekly' },
    { slug: 'hdri-to-cubemap', prio: '0.9', change: 'weekly' },
    { slug: 'ai-hdri-generator', prio: '0.9', change: 'weekly' },
    { slug: 'skybox-generator', prio: '0.9', change: 'weekly' },
    { slug: '360-image-maker', prio: '0.9', change: 'weekly' },
    { slug: '360-photo-to-video', prio: '0.9', change: 'weekly' },
    { slug: 'cubemap-to-equirectangular', prio: '0.85', change: 'weekly' },
    { slug: '360-metadata-injector', prio: '0.85', change: 'weekly' },
    { slug: 'hdri-viewer', prio: '0.85', change: 'weekly' },
    { slug: 'text-to-panorama-ai', prio: '0.85', change: 'weekly' },
    { slug: 'developers', prio: '0.7', change: 'monthly' },
    { slug: 'showcase', prio: '0.7', change: 'daily' },
    { slug: 'blog', prio: '0.7', change: 'weekly' },
    { slug: 'blog/facebook-360-photo-not-working', prio: '0.6', change: 'monthly' },
    { slug: 'blog/equirectangular-projection-explained', prio: '0.6', change: 'monthly' },
    { slug: 'blog/how-to-make-a-360-panorama-without-a-360-camera', prio: '0.6', change: 'monthly' },
    { slug: 'blog/hdri-vs-ldr-environment-lighting', prio: '0.6', change: 'monthly' },
  ];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n`;
  xml += `        xmlns:xhtml="http://www.w3.org/1999/xhtml"\n`;
  xml += `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n`;

  for (const item of canonicalUrls) {
    const isI18nSupported = PAGES.some(p => p.slug === item.slug);
    const slugPart = item.slug ? `${item.slug}/` : '';
    const loc = `${DOMAIN}/${slugPart}`;

    xml += `  <url>\n`;
    xml += `    <loc>${loc}</loc>\n`;
    xml += `    <lastmod>${lastmod(loc)}</lastmod>\n`;
    xml += `    <changefreq>${item.change}</changefreq>\n`;
    xml += `    <priority>${item.prio}</priority>\n`;

    if (isI18nSupported) {
      for (const lang of LANGUAGES) {
        const prefix = lang.code === 'en' ? '' : `/${lang.code}`;
        xml += `    <xhtml:link rel="alternate" hreflang="${lang.code}" href="${DOMAIN}${prefix}/${slugPart}" />\n`;
      }
      xml += `    <xhtml:link rel="alternate" hreflang="x-default" href="${DOMAIN}/${slugPart}" />\n`;
    }

    xml += `  </url>\n`;

    // If i18n is supported, also emit each language URL into the sitemap
    if (isI18nSupported) {
      for (const lang of LANGUAGES) {
        if (lang.code === 'en') continue;
        const langLoc = `${DOMAIN}/${lang.code}/${slugPart}`;
        xml += `  <url>\n`;
        xml += `    <loc>${langLoc}</loc>\n`;
        xml += `    <lastmod>${lastmod(langLoc)}</lastmod>\n`;
        xml += `    <changefreq>${item.change}</changefreq>\n`;
        xml += `    <priority>${item.prio}</priority>\n`;
        for (const l of LANGUAGES) {
          const prefix = l.code === 'en' ? '' : `/${l.code}`;
          xml += `    <xhtml:link rel="alternate" hreflang="${l.code}" href="${DOMAIN}${prefix}/${slugPart}" />\n`;
        }
        xml += `    <xhtml:link rel="alternate" hreflang="x-default" href="${DOMAIN}/${slugPart}" />\n`;
        xml += `  </url>\n`;
      }
    }
  }

  xml += `</urlset>\n`;
  fs.writeFileSync(sitemapPath, xml, 'utf8');
  console.log(`Updated ${sitemapPath} with comprehensive multilingual and tool routes.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateAllI18n();
}
