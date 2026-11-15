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
  zh: { open: '打开工具（中文界面）', notice: '主要工具界面支持中文，部分专业功能与说明仍为英文。', faq: '常见问题', tools: '相关工具', languages: '语言', home: '首页', skip: '跳到正文', ai: 'AI 生成功能需要积分，免费试用以当前可用额度为准；本地查看和切图工具免费。', pricing: '价格与积分', blog: '教程与修复', about: '关于', showcase: '作品展示', developers: '嵌入与 API', allTools: '全部工具' },
  es: { open: 'Abrir herramienta en español', notice: 'La interfaz principal está disponible en español. Algunas funciones especializadas y explicaciones siguen en inglés.', faq: 'Preguntas frecuentes', tools: 'Herramientas relacionadas', languages: 'Idiomas', home: 'Inicio', skip: 'Ir al contenido', ai: 'La generación con IA requiere créditos; la prueba depende de la disponibilidad. El visor y el corte local son gratuitos.', pricing: 'Precios y créditos', blog: 'Guías y soluciones', about: 'Acerca de', showcase: 'Galería', developers: 'Insertar y API', allTools: 'Todas las herramientas' },
  de: { open: 'Werkzeug auf Deutsch öffnen', notice: 'Die wichtigsten Werkzeuge sind auf Deutsch verfügbar. Einige Spezialfunktionen und Erläuterungen sind weiterhin auf Englisch.', faq: 'Häufig gestellte Fragen', tools: 'Weitere Werkzeuge', languages: 'Sprachen', home: 'Startseite', skip: 'Zum Inhalt', ai: 'KI-Generierung benötigt Guthaben; eine Testphase hängt von der Verfügbarkeit ab. Lokaler Viewer und Zuschnitt sind kostenlos.', pricing: 'Preise und Guthaben', blog: 'Anleitungen und Lösungen', about: 'Über uns', showcase: 'Galerie', developers: 'Einbetten und API', allTools: 'Alle Werkzeuge' },
  ja: { open: 'ツールを開く（日本語の画面）', notice: '主要な操作画面は日本語に対応しています。一部の専門機能や説明は引き続き英語です。', faq: 'よくある質問', tools: '関連ツール', languages: '言語', home: 'ホーム', skip: '本文へ', ai: 'AI生成にはクレジットが必要です。無料体験は利用状況によります。ローカル表示と分割ツールは無料です。', pricing: '料金とクレジット', blog: 'ガイドと修正', about: '概要', showcase: '作品ギャラリー', developers: '埋め込みとAPI', allTools: 'すべてのツール' },
};

// Extra body copy per localized page. The translated hero and FAQ alone left these
// pages at roughly a quarter of the English page length, which is thin content.
const PAGE_SECTIONS = {
  home: {
    zh: [
      {
        h2: 'AI 全景图是怎么生成的',
        p: [
          '输入一段场景描述，或上传最多三张参考照片，服务端会调用图像模型生成一张 2:1 等距柱状全景图。生成前可以选风格预设、机位和负向提示词，输出分辨率分 1K、2K、4K 三档。',
          '每次成功生成按分辨率扣积分：1K 扣 1 分，2K 扣 2 分，4K 扣 4 分。失败或未通过自动质量检查的请求会释放预扣积分。',
        ],
      },
      {
        h2: '能拿来做什么',
        p: ['生成结果可以直接当游戏引擎的天空盒、VR 场景背景，也可以作为建筑与展陈方案的氛围图。'],
        list: ['Unity、Unreal Engine、Godot 的天空盒与环境贴图', 'VR 头显和 Cardboard 的 360° 预览', '建筑、室内和展陈方案的氛围提案', '社交媒体 360 视频与短视频素材'],
      },
      {
        h2: '它做不到什么',
        p: ['AI 生成的是新画面，不是对参考照片的真实还原：细节、文字和空间结构都可能与原场景不同，多次生成也无法保证同一空间完全一致。非 2:1 的结果会被居中裁切而不做拉伸补全。需要精确匹配真实场地时，应使用实拍全景或 HDRI。'],
      },
    ],
    es: [
      {
        h2: 'Cómo se genera un panorama con IA',
        p: [
          'Describe la escena o sube hasta tres fotos de referencia; el servicio llama a un modelo de imagen y devuelve un panorama equirrectangular 2:1. Antes de generar puedes elegir estilo, punto de vista y prompt negativo, y la resolución de salida: 1K, 2K o 4K.',
          'Cada generación correcta consume créditos según la resolución: 1 para 1K, 2 para 2K y 4 para 4K. Los intentos fallidos o rechazados por el control de calidad liberan los créditos reservados.',
        ],
      },
      {
        h2: 'Para qué sirve',
        p: ['El resultado se puede usar como skybox de motor de juego, fondo de escena VR o imagen de ambiente para una propuesta de arquitectura.'],
        list: ['Skybox y mapas de entorno en Unity, Unreal Engine y Godot', 'Previsualización 360° en visores VR y Cardboard', 'Propuestas de ambiente para arquitectura, interiorismo y exposiciones', 'Material para vídeo 360° y redes sociales'],
      },
      {
        h2: 'Qué no hace',
        p: ['La IA crea una imagen nueva, no una reconstrucción de tu foto: los detalles, el texto y la geometría pueden diferir de la escena original, y dos generaciones no garantizan el mismo espacio. Los resultados que no son 2:1 se recortan desde el centro, sin estirarlos. Si necesitas coincidencia exacta con un lugar real, usa un panorama capturado o un HDRI.'],
      },
    ],
    de: [
      {
        h2: 'So entsteht ein KI-Panorama',
        p: [
          'Beschreibe die Szene oder lade bis zu drei Referenzfotos hoch. Der Dienst ruft ein Bildmodell auf und liefert ein 2:1-Panorama in equirektangulärer Projektion. Vor dem Start wählst du Stil, Kameraposition, Negativ-Prompt und die Ausgabeauflösung 1K, 2K oder 4K.',
          'Jede erfolgreiche Generierung kostet Guthaben nach Auflösung: 1 für 1K, 2 für 2K und 4 für 4K. Fehlgeschlagene oder von der Qualitätsprüfung abgelehnte Versuche geben reservierte Guthaben wieder frei.',
        ],
      },
      {
        h2: 'Wofür sich das eignet',
        p: ['Das Ergebnis lässt sich als Skybox in einer Engine, als Hintergrund einer VR-Szene oder als Stimmungsbild für ein Architekturkonzept verwenden.'],
        list: ['Skybox und Environment-Maps in Unity, Unreal Engine und Godot', '360°-Vorschau auf VR-Brillen und Cardboard', 'Stimmungsbilder für Architektur, Innenraum und Ausstellung', 'Material für 360°-Video und Social Media'],
      },
      {
        h2: 'Was es nicht leistet',
        p: ['Die KI erzeugt ein neues Bild, keine Rekonstruktion deines Fotos: Details, Schrift und Geometrie können von der realen Szene abweichen, und zwei Durchläufe ergeben nicht denselben Raum. Ergebnisse, die nicht 2:1 sind, werden mittig beschnitten statt gestreckt. Wenn ein Ort exakt stimmen muss, nutze ein echtes Panorama oder ein HDRI.'],
      },
    ],
    ja: [
      {
        h2: 'AIパノラマの生成方法',
        p: [
          'シーンを文章で指定するか、最大3枚の参考写真をアップロードすると、画像モデルが2:1正距円筒パノラマを生成します。生成前にスタイル、視点、ネガティブプロンプト、出力解像度（1K・2K・4K）を選べます。',
          '成功した生成は解像度に応じてクレジットを消費します（1K=1、2K=2、4K=4）。失敗した場合や自動品質チェックで不合格になった場合は、確保されたクレジットが解放されます。',
        ],
      },
      {
        h2: '用途',
        p: ['生成した画像はゲームエンジンのスカイボックス、VRシーンの背景、建築や展示の雰囲気検討にそのまま使えます。'],
        list: ['Unity・Unreal Engine・Godotのスカイボックスと環境マップ', 'VRヘッドセットやCardboardでの360°プレビュー', '建築・インテリア・展示計画のイメージ共有', '360°動画やSNS用の素材'],
      },
      {
        h2: 'できないこと',
        p: ['AIが作るのは新しい画像で、参考写真の再現ではありません。細部・文字・空間構造が実際と異なることがあり、同じ空間を複数回生成しても一致しません。2:1以外の比率は中央でトリミングされ、引き伸ばし補正は行いません。実在の場所と正確に合わせたい場合は、実写パノラマかHDRIを使用してください。'],
      },
    ],
  },
  viewer: {
    zh: [
      {
        h2: '查看器如何工作',
        p: [
          '全景图在浏览器里用 WebGL 贴到球体内壁，拖动、滑动或方向键即可环顾，视野角可在 30° 到 105° 之间调整。文件不会上传，渲染全部在本机 GPU 完成。',
          '支持 JPG、PNG、WebP 的 2:1 等距柱状图，提供球形、小行星（Little Planet）和 VR 分屏三种投影，并带实时方位罗盘与 2:1 小地图。',
        ],
      },
      {
        h2: '支持的相机与导出',
        p: ['大疆 Mini 3/4 Pro、Mavic、Air 系列导出的球面全景，Insta360 X3/X4/ONE RS，GoPro MAX 和理光 Theta 的 2:1 JPEG 都可以直接拖进来。'],
        list: ['Ctrl+V 直接粘贴截图或复制的图片', '导出当前视角的 PNG 快照', '一键送入立方体切图或 3D 地球', 'VR 分屏配合手机陀螺仪环顾'],
      },
      {
        h2: '使用边界',
        p: ['能打开的分辨率取决于设备内存，超大图可能被浏览器降采样。非 2:1 的图片在球形模式下会拉伸变形。只有本地预览不上传；主动创建分享链接时，副本才会保存到服务器。'],
      },
    ],
    es: [
      {
        h2: 'Cómo funciona el visor',
        p: [
          'El panorama se proyecta en el interior de una esfera con WebGL en el navegador. Puedes mirar alrededor arrastrando, deslizando o con las flechas, y ajustar el campo de visión entre 30° y 105°. El archivo no se sube: el render ocurre en la GPU de tu equipo.',
          'Admite JPG, PNG y WebP en formato equirrectangular 2:1, con proyección esférica, Little Planet y VR dividida, además de brújula y minimapa 2:1.',
        ],
      },
      {
        h2: 'Cámaras compatibles y exportación',
        p: ['Los panoramas esféricos de DJI (Mini 3/4 Pro, Mavic, Air), Insta360 X3/X4/ONE RS, GoPro MAX y Ricoh Theta se abren arrastrando el JPEG 2:1.'],
        list: ['Pegar una captura con Ctrl+V', 'Exportar una instantánea PNG del ángulo actual', 'Enviar al cortador de cubemap o al globo 3D', 'VR dividida con el giroscopio del móvil'],
      },
      {
        h2: 'Límites',
        p: ['La resolución que se puede abrir depende de la memoria del dispositivo y las imágenes enormes pueden reducirse. Las fotos que no son 2:1 se estiran en modo esfera. Solo la vista local evita la subida; al crear un enlace para compartir se guarda una copia en el servidor.'],
      },
    ],
    de: [
      {
        h2: 'So funktioniert der Viewer',
        p: [
          'Das Panorama wird per WebGL auf die Innenseite einer Kugel projiziert. Du drehst per Ziehen, Wischen oder Pfeiltasten und stellst den Bildwinkel zwischen 30° und 105° ein. Die Datei wird nicht hochgeladen, das Rendering läuft auf der GPU deines Geräts.',
          'Unterstützt werden JPG, PNG und WebP im 2:1-Format, mit Kugel-, Little-Planet- und geteilter VR-Projektion sowie Kompass und 2:1-Minimap.',
        ],
      },
      {
        h2: 'Kameras und Export',
        p: ['Sphärenpanoramen aus DJI (Mini 3/4 Pro, Mavic, Air), Insta360 X3/X4/ONE RS, GoPro MAX und Ricoh Theta lassen sich als 2:1-JPEG direkt hineinziehen.'],
        list: ['Screenshot mit Strg+V einfügen', 'PNG-Snapshot des aktuellen Blickwinkels exportieren', 'Direkt an Cubemap-Slicer oder 3D-Globus übergeben', 'Geteilte VR-Ansicht mit Handy-Gyroskop'],
      },
      {
        h2: 'Grenzen',
        p: ['Die öffnungsfähige Auflösung hängt am Arbeitsspeicher des Geräts; sehr große Bilder werden vom Browser herunterskaliert. Bilder, die nicht 2:1 sind, werden in der Kugelansicht gestreckt. Nur die lokale Vorschau verzichtet auf Upload; beim Erstellen eines Freigabelinks wird eine Kopie gespeichert.'],
      },
    ],
    ja: [
      {
        h2: 'ビューアーの仕組み',
        p: [
          'パノラマ画像はブラウザのWebGLで球体の内側に貼り付けられます。ドラッグ、スワイプ、矢印キーで見回せ、画角は30°〜105°で調整できます。ファイルはアップロードされず、描画は端末のGPUで完結します。',
          'JPG・PNG・WebPの2:1正距円筒画像に対応し、球面・リトルプラネット・VR分割の3種類の投影、方位コンパス、2:1ミニマップを備えます。',
        ],
      },
      {
        h2: '対応カメラと書き出し',
        p: ['DJI（Mini 3/4 Pro、Mavic、Air）の球面パノラマ、Insta360 X3/X4/ONE RS、GoPro MAX、Ricoh Thetaの2:1 JPEGをそのままドラッグできます。'],
        list: ['Ctrl+Vでスクリーンショットを貼り付け', '現在の視点をPNGで書き出し', 'キューブマップ分割や3D地球儀へ直接送る', 'スマホのジャイロとVR分割表示'],
      },
      {
        h2: '制限',
        p: ['開ける解像度は端末のメモリに依存し、巨大な画像はブラウザが縮小することがあります。2:1でない画像は球面表示で引き伸ばされます。ローカル表示のみアップロードなしで、共有リンクを作成すると複製が保存されます。'],
      },
    ],
  },
  globe: {
    zh: [
      {
        h2: '地图转地球的原理',
        p: [
          '工具把 2D 图片按等距柱状方式包到球体表面，旋转、缩放和自动巡航都在浏览器里实时计算，不上传文件。',
          '世界地图、架空大陆、游戏地图都可以直接铺成可交互的球体，用来检查极地变形和东西向接缝。',
        ],
      },
      {
        h2: '适用场景',
        p: ['任何需要把平面图变成可旋转球体的场合都可以用，尤其是地图本身不追求地理精度的时候。'],
        list: ['小说、跑团的世界观地图立体化', '游戏地图与关卡示意图预览', '把全景照片当天球纹理查看', '课堂演示经纬网与投影概念'],
      },
      {
        h2: '边界',
        p: ['平面地图越靠近两极压缩越明显，工具不做地理配准，也不识别国界或经纬度。要让接缝自然，源图左右边缘需要能首尾相接。'],
      },
    ],
    es: [
      {
        h2: 'Cómo funciona el mapa a globo',
        p: [
          'La herramienta envuelve una imagen 2D sobre una esfera en proyección equirrectangular; rotación, zoom y giro automático se calculan en el navegador sin subir el archivo.',
          'Mapas del mundo, continentes inventados o mapas de juego se convierten en un globo interactivo para revisar la distorsión polar y la costura este-oeste.',
        ],
      },
      {
        h2: 'Cuándo usarlo',
        p: ['Sirve siempre que necesites convertir una imagen plana en una esfera giratoria, sobre todo cuando no buscas precisión geográfica.'],
        list: ['Mapas de mundo para novelas o campañas de rol', 'Previsualización de mapas de juego y niveles', 'Ver una foto panorámica como textura celeste', 'Demostraciones de latitud, longitud y proyección'],
      },
      {
        h2: 'Límites',
        p: ['Cuanto más cerca de los polos, mayor es la compresión de un mapa plano. No hay georreferenciación ni detección de fronteras o coordenadas. Para que la costura quede limpia, los bordes izquierdo y derecho de la imagen deben coincidir.'],
      },
    ],
    de: [
      {
        h2: 'So funktioniert Karte zu Globus',
        p: [
          'Das Werkzeug legt ein 2D-Bild equirektangulär um eine Kugel. Drehung, Zoom und automatischer Lauf werden im Browser berechnet, ohne Upload.',
          'Weltkarten, erfundene Kontinente oder Spielekarten lassen sich als interaktiver Globus prüfen, inklusive Polverzerrung und Ost-West-Naht.',
        ],
      },
      {
        h2: 'Typische Einsatzfälle',
        p: ['Geeignet ist das Werkzeug überall dort, wo aus einem flachen Bild eine drehbare Kugel werden soll, besonders ohne Anspruch auf geografische Genauigkeit.'],
        list: ['Weltkarten für Romane oder Pen-and-Paper-Runden', 'Vorschau von Spielekarten und Levelplänen', 'Ein Panoramafoto als Himmelskugel ansehen', 'Unterricht zu Längen- und Breitengraden'],
      },
      {
        h2: 'Grenzen',
        p: ['Je näher an den Polen, desto stärker staucht eine flache Karte. Es gibt keine Georeferenzierung und keine Erkennung von Grenzen oder Koordinaten. Für eine saubere Naht müssen linker und rechter Bildrand zusammenpassen.'],
      },
    ],
    ja: [
      {
        h2: '地図から地球儀への仕組み',
        p: [
          '2D画像を正距円筒として球体に貼り付け、回転・ズーム・自動回転をブラウザ内で計算します。ファイルのアップロードはありません。',
          '世界地図、架空の大陸、ゲームマップをそのまま操作できる球体にして、極付近の歪みや東西の継ぎ目を確認できます。',
        ],
      },
      {
        h2: '用途',
        p: ['平面的な画像を回転する球体にしたい場面で使えます。地理的な正確さを求めない用途ほど向いています。'],
        list: ['小説やTRPGの世界地図を立体化', 'ゲームマップやレベル図の確認', 'パノラマ写真を天球テクスチャとして表示', '緯度・経度と投影の授業デモ'],
      },
      {
        h2: '制限',
        p: ['平面地図は極に近いほど圧縮が目立ちます。地理的な位置合わせや国境・座標の認識は行いません。継ぎ目を自然にするには、画像の左右端が連続している必要があります。'],
      },
    ],
  },
  cubemap: {
    zh: [
      {
        h2: '切图是怎么算的',
        p: [
          '对立方体的每个面逐像素做射线投射，把 2:1 全景重采样成 6 张无透视畸变的图像，每面可选 256、512 或 1024 像素。',
          '文件按 posx、negx、posy、negy、posz、negz 命名，正好对应 Unity 的 6 Sided 天空盒和 Three.js 的 CubeTextureLoader。',
        ],
      },
      {
        h2: '典型工作流',
        p: ['整个过程在浏览器本地完成，不需要登录，也不消耗 AI 积分。'],
        list: ['选一个示例，或拖入自己的 2:1 全景', '选择每面分辨率', '在预览里检查接缝与极点', '下载 ZIP 或单张 PNG'],
      },
      {
        h2: '边界',
        p: ['导出的 PNG 是 8 位图像，不保留 HDR 亮度；ZIP 也不是 Unreal 的 TextureCube 资产，Unreal 的 HDRI Backdrop 需要原始 .hdr。原图极点本身有拉伸的话，切面后依然存在。'],
      },
    ],
    es: [
      {
        h2: 'Cómo se calcula el cubemap',
        p: [
          'Cada cara del cubo se genera con un trazado de rayos píxel a píxel que remuestrea el panorama 2:1 en seis imágenes sin distorsión de perspectiva, a 256, 512 o 1024 píxeles por cara.',
          'Los archivos se llaman posx, negx, posy, negy, posz y negz, que coinciden con el skybox 6 Sided de Unity y con CubeTextureLoader de Three.js.',
        ],
      },
      {
        h2: 'Flujo habitual',
        p: ['Todo ocurre en el navegador: sin cuenta y sin gastar créditos de IA.'],
        list: ['Elegir un ejemplo o arrastrar tu panorama 2:1', 'Escoger la resolución por cara', 'Revisar costuras y polos en la vista previa', 'Descargar el ZIP o un PNG suelto'],
      },
      {
        h2: 'Límites',
        p: ['Los PNG son de 8 bits y no conservan luminancia HDR. El ZIP tampoco es un TextureCube de Unreal: HDRI Backdrop necesita el .hdr original. Si el panorama ya tenía estiramiento en los polos, seguirá visible en las caras.'],
      },
    ],
    de: [
      {
        h2: 'So wird das Cubemap berechnet',
        p: [
          'Jede Würfelfläche entsteht durch Raycasting pro Pixel, das das 2:1-Panorama in sechs perspektivisch unverzerrte Bilder mit 256, 512 oder 1024 Pixeln pro Fläche umrechnet.',
          'Die Dateien heißen posx, negx, posy, negy, posz und negz und passen damit zur 6-Sided-Skybox in Unity und zum CubeTextureLoader in Three.js.',
        ],
      },
      {
        h2: 'Üblicher Ablauf',
        p: ['Alles läuft lokal im Browser: ohne Konto und ohne KI-Guthaben.'],
        list: ['Beispiel wählen oder eigenes 2:1-Panorama hineinziehen', 'Auflösung pro Fläche festlegen', 'Naht und Pole in der Vorschau prüfen', 'ZIP oder einzelne PNGs herunterladen'],
      },
      {
        h2: 'Grenzen',
        p: ['Die PNGs sind 8-Bit und tragen keine HDR-Luminanz. Das ZIP ist kein Unreal-TextureCube; HDRI Backdrop benötigt die originale .hdr-Datei. War das Ausgangsbild an den Polen bereits gestreckt, bleibt das in den Flächen sichtbar.'],
      },
    ],
    ja: [
      {
        h2: 'キューブマップの計算方法',
        p: [
          '立方体の各面についてピクセル単位でレイキャストし、2:1パノラマを遠近歪みのない6枚の画像に再サンプリングします。1面あたり256・512・1024ピクセルから選べます。',
          'ファイル名はposx、negx、posy、negy、posz、negzで、Unityの6 SidedスカイボックスやThree.jsのCubeTextureLoaderにそのまま対応します。',
        ],
      },
      {
        h2: '一般的な流れ',
        p: ['すべてブラウザ内で完結し、ログインもAIクレジットも不要です。'],
        list: ['サンプルを選ぶか2:1パノラマをドラッグ', '1面あたりの解像度を選択', 'プレビューで継ぎ目と極を確認', 'ZIPまたは個別PNGをダウンロード'],
      },
      {
        h2: '制限',
        p: ['書き出したPNGは8ビットで、HDRの輝度は保持されません。ZIPはUnrealのTextureCubeではないため、HDRI Backdropには元の.hdrが必要です。元画像の極に伸びがある場合、各面にも残ります。'],
      },
    ],
  },
  photo360: {
    zh: [
      {
        h2: '照片转全景做了什么',
        p: [
          '参考照片会发送到 AI 服务，模型据此生成一张新的 2:1 全景图。它补全的是看起来合理的周围环境，而不是相机没拍到的真实画面。',
          '生成按分辨率扣积分，可选用边缘融合减轻接缝；结果可以直接在内置查看器里环顾。',
        ],
      },
      {
        h2: '适合与不适合',
        p: ['适合概念图、建筑效果图、氛围提案，以及需要快速铺满 360° 的素材。'],
        list: ['室内方案的多角度氛围预览', '游戏与影视的概念场景', '社交媒体 360° 内容', '不适合取证、测绘或要求精确还原的场合'],
      },
      {
        h2: '边界',
        p: ['文字、直线建筑结构和人物最容易变形，同一张参考图多次生成会得到不同结果。必须保持空间一致时，应改用真实拍摄的全景。'],
      },
    ],
    es: [
      {
        h2: 'Qué hace el conversor foto a 360',
        p: [
          'La foto de referencia se envía al servicio de IA, que genera un panorama 2:1 nuevo. Lo que completa es un entorno verosímil, no lo que había detrás de la cámara.',
          'La generación consume créditos según la resolución y la fusión de bordes es opcional; el resultado se puede recorrer en el visor integrado.',
        ],
      },
      {
        h2: 'Cuándo conviene',
        p: ['Sirve para conceptos, renders de arquitectura, propuestas de ambiente y material que necesita cubrir 360° rápido.'],
        list: ['Previsualización de ambientes de interior', 'Escenarios conceptuales para juego o cine', 'Contenido 360° para redes sociales', 'No sirve para peritaje, medición ni reproducción exacta'],
      },
      {
        h2: 'Límites',
        p: ['El texto, las líneas rectas de la arquitectura y las personas son lo que más se deforma; la misma referencia puede dar resultados distintos. Si la coherencia espacial es obligatoria, usa un panorama capturado.'],
      },
    ],
    de: [
      {
        h2: 'Was der Foto-zu-360-Konverter macht',
        p: [
          'Das Referenzfoto geht an den KI-Dienst, der daraus ein neues 2:1-Panorama erzeugt. Ergänzt wird eine plausible Umgebung, nicht die tatsächliche Szene hinter der Kamera.',
          'Die Generierung kostet Guthaben nach Auflösung; Kantenüberblendung ist optional, und das Ergebnis lässt sich direkt im integrierten Viewer drehen.',
        ],
      },
      {
        h2: 'Wann das passt',
        p: ['Für Konzeptbilder, Architektur-Renderings, Stimmungsentwürfe und Material, das schnell 360° füllen soll.'],
        list: ['Stimmungsvorschau von Innenräumen', 'Konzeptszenerien für Game und Film', '360°-Inhalte für Social Media', 'Nicht für Gutachten, Vermessung oder exakte Rekonstruktion'],
      },
      {
        h2: 'Grenzen',
        p: ['Schrift, gerade Architekturlinien und Personen verformen sich am häufigsten; dieselbe Vorlage ergibt unterschiedliche Resultate. Wenn die Räumlichkeit stimmen muss, nutze ein echtes Panorama.'],
      },
    ],
    ja: [
      {
        h2: '写真から360°への変換とは',
        p: [
          '参考写真はAIサービスに送信され、新しい2:1パノラマが生成されます。補完されるのは「それらしい周囲」であり、カメラが捉えていない実際の景色ではありません。',
          '生成は解像度に応じてクレジットを消費し、境界のぼかしは任意で選べます。結果は内蔵ビューアーですぐに見回せます。',
        ],
      },
      {
        h2: '向いている用途',
        p: ['コンセプト画像、建築パース、雰囲気の提案、360°を素早く埋めたい素材に向いています。'],
        list: ['内装案の雰囲気プレビュー', 'ゲーム・映像のコンセプトシーン', 'SNS向けの360°コンテンツ', '鑑定・測量・正確な再現には不向き'],
      },
      {
        h2: '制限',
        p: ['文字、建築の直線、人物が最も崩れやすく、同じ参考写真でも結果は毎回異なります。空間の一貫性が必須なら、実写パノラマを使用してください。'],
      },
    ],
  },
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
        title: 'AI 360全景图生成器与全景制作工作室 — 免费全景查看器',
        description: 'AI 360度全景图生成器与在线全景制作工具：支持文本描述与参考图片一键生成无缝2:1等距柱状全景、VR天空盒与立方体贴图，并提供免上传本地WebGL全景查看器。',
        keywords: 'AI全景图生成器, 360全景查看器, 360全景AI生成, 文本生成全景图, AI生成VR天空盒, 360全景制作, 图片转全景AI, 免费全景制作, 大疆全景查看',
        h1: 'AI 360° 全景图生成器与制作工作室',
        sub: '使用 AI 从自然语言描述或参考照片生成无缝 2:1 等距柱状 360° 全景与 VR 天空盒；内置免上传本地 WebGL 全景查看器。',
        faq: [
          { q: '什么是AI 360全景图生成器？', a: '这是一款基于前沿深度学习的在线工具，能够根据自然语言描述或参考图片，生成标准的2:1等距柱状360度全景照片和VR游戏天空盒。' },
          { q: '是否包含免费的360全景查看器？', a: '是的。支持直接拖拽、粘贴(Ctrl+V)本地全景图在浏览器中平移漫游，完全在本地GPU渲染，绝不上传您的私人照片。' }
        ]
      },
      es: {
        title: 'Generador de Panoramas 360 con IA y Estudio VR — Visor Online',
        description: 'Generador de panoramas 360° con inteligencia artificial: crea panoramas esféricos 2:1, cubemaps y skyboxes VR a partir de texto o fotos con IA y visualízalos gratis.',
        keywords: 'generador de panorama con ia, fotos 360, visor 360 gratis, generador 360 panorama ia, skybox vr ia, texto a panorama ia, creador de panoramas 360, ver fotos 360',
        h1: 'Generador de Panoramas 360° con IA y Estudio VR',
        sub: 'Crea panoramas 360° equirrectangulares 2:1, cubemaps y skyboxes de realidad virtual con IA a partir de texto o fotos; incluye visor WebGL local gratuito.',
        faq: [
          { q: '¿Qué es un generador de panoramas 360 con IA?', a: 'Es una herramienta web que crea imágenes panorámicas esféricas 2:1 y skyboxes de realidad virtual a partir de texto o fotos normales.' },
          { q: '¿Incluye un visor 360 gratuito?', a: 'Sí. Puedes abrir e inspeccionar cualquier panorama directamente en el navegador con WebGL sin subir tus archivos a ningún servidor.' }
        ]
      },
      de: {
        title: 'KI 360° Panorama Generator & VR Skybox Studio — Kostenloser Viewer',
        description: 'KI 360° Panorama Generator und VR Studio: Erstelle nahtlose 2:1 Kugelpanoramen und Skyboxes mit KI aus Textprompts oder Fotos, inklusive lokalem WebGL-Viewer.',
        keywords: '360 panorama viewer, ki panorama generator, 360 panorama generator ki, 360 grad panorama, vr skybox ki, text zu panorama ki, 360 bild ersteller ki',
        h1: 'KI 360° Panorama Generator & VR Skybox Studio',
        sub: 'Erstelle nahtlose 2:1 Kugelpanoramen und VR-Skyboxes mit KI aus Text oder Referenzbildern; inklusive kostenlosem lokalem WebGL-Viewer ohne Upload.',
        faq: [
          { q: 'Was ist ein KI 360 Panorama Generator?', a: 'Ein Webtool, das aus Textprompts oder 2D-Fotos nahtlose 2:1 Kugelpanoramen und 3D-Skyboxes erzeugt.' },
          { q: 'Ist ein kostenloser 360 Viewer enthalten?', a: 'Ja, unser WebGL-Viewer läuft zu 100% lokal im Browser ohne Server-Uploads.' }
        ]
      },
      ja: {
        title: 'AI 360度パノラマ生成器＆VRスカイボックススタジオ — 無料ビューアー',
        description: 'AI 360度パノラマ生成器：テキスト指示や写真から2:1正距円筒パノラマやVRスカイボックスをAIで瞬時に作成。完全無料のローカルWebGLビューアーも搭載。',
        keywords: '360度 写真 閲覧, 全天球 画像 ビューアー, aiパノラマ生成器, 360度パノラマai作成, vrスカイボックス生成, テキストからパノラマai, 360写真作成, 360パノラマビューア',
        h1: 'AI 360° パノラマ生成器＆VRスタジオ',
        sub: 'テキストの指示や参照写真からAIでシームレスな2:1正距円筒360度パノラマやVR空間を生成。ローカルWebGLビューアーも完備。',
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
        keywords: '360 panorama viewer, panorama viewer, panorama view, 360 viewer, view 360 photos, dji 360 viewer, insta360 online viewer, 360 photo viewer online free, photo sphere viewer, equirectangular viewer',
        h1: 'Free 360 Panorama Viewer Online',
        sub: 'Explore, rotate, and inspect 360° equirectangular panoramas directly in your browser. 100% private with local GPU rendering.',
        faq: [
          { q: 'Are my panorama photos uploaded to your server?', a: 'No. All rendering occurs locally on your device via WebGL. Your photos never leave your computer or phone.' },
          { q: 'Can I paste an image directly from the clipboard?', a: 'Yes! Simply press Ctrl+V (or Cmd+V on macOS) to instantly load and view a copied 360 panorama.' },
          { q: 'Which 360 cameras and drones are supported?', a: 'Any 2:1 equirectangular image works: DJI (Air, Mavic, and Mini sphere panoramas), Insta360 (X4, X3, ONE RS), Ricoh Theta (X, Z1), GoPro MAX, and mobile photo spheres.' }
        ]
      },
      zh: {
        title: '免费在线360全景图查看器 — 免上传/剪贴板Ctrl+V直接看',
        description: '完全免费的在线360度全景图查看器。纯前端WebGL实时平移缩放、小行星视角与剪贴板Ctrl+V直接打开，无需上传云端，隐私100%安全。',
        keywords: '360全景查看器, 全景图查看, 360看图工具, 在线全景照片播放器, 全景球查看器, 360度全景照片查看, 大疆全景图查看器, 大疆航拍全景, insta360在线查看, 免上传全景预览',
        h1: '免费在线 360° 全景图查看器',
        sub: '在浏览器中流畅漫游、旋转和检查360度等距柱状全景照片。本地GPU渲染，绝不上传文件。',
        faq: [
          { q: '全景照片会上传到服务器吗？', a: '完全不会。所有渲染过程通过浏览器WebGL直接在您的显卡上运行，照片不离开您的电脑或手机。' },
          { q: '支持剪贴板直接粘贴图片吗？', a: '支持！复制2:1全景图片后，在页面任意位置按下 Ctrl+V（Mac为Cmd+V）即可瞬间展开全景视图。' },
          { q: '支持查看大疆无人机与全景相机的照片吗？', a: '完全支持。将大疆(DJI Mini/Air/Mavic)拼接导出的球形全景或Insta360导出的2:1等距柱状JPG直接拖入页面，即可在本地GPU流畅漫游查看。' }
        ]
      },
      es: {
        title: 'Visor de Panoramas 360 Online Gratis — Sin Subir Archivos',
        description: 'Explora fotos 360° equirrectangulares en tiempo real con WebGL, modo Little Planet y soporte Ctrl+V. 100% privado sin subir a servidores.',
        keywords: 'fotos 360, ver fotos 360, visor de fotos 360, visor 360 gratis, visor panorama 360, como ver fotos 360 en pc, visor panoramico online, ver panorama 360',
        h1: 'Visor de Panoramas 360° Online Gratis',
        sub: 'Gira y navega por fotos panorámicas esféricas 360 al instante en tu navegador. 100% privado y seguro.',
        faq: [
          { q: '¿Mis fotos se suben a algún servidor?', a: 'No. El visor procesa la imagen completamente en la memoria de tu navegador mediante WebGL. Tus fotos nunca salen de tu dispositivo.' },
          { q: '¿Puedo pegar imágenes desde el portapapeles?', a: '¡Sí! Pulsa Ctrl+V (o Cmd+V en Mac) para cargar y ver cualquier panorama copiado inmediatamente.' },
          { q: '¿Es compatible con fotos de drones DJI y cámaras 360?', a: 'Sí. Puedes arrastrar cualquier panorama 2:1 de drones DJI (Mini, Air, Mavic) o cámaras Insta360 y Ricoh Theta para explorarlo al instante sin subir archivos.' }
        ]
      },
      de: {
        title: 'Kostenloser 360° Panorama Viewer Online — Ohne Upload',
        description: '360 Grad Kugelpanoramen direkt im Browser ansehen. Echtzeit-WebGL-Rendering, Little Planet Modus und Strg+V Zwischenablage-Unterstützung.',
        keywords: '360 panorama viewer, panorama viewer, 360 grad panorama, kugelpanorama viewer, 360 grad fotos ansehen, panorama betrachter, photo sphere betrachter, equirektangulaer viewer',
        h1: 'Kostenloser 360° Panorama Betrachter',
        sub: 'Navigiere und erkunde equirektanguläre 360° Panoramen ohne Installation und ohne Server-Upload.',
        faq: [
          { q: 'Werden meine Bilder auf einen Server geladen?', a: 'Nein. Das Rendering läuft vollständig clientseitig im WebGL-Speicher Ihres Browsers.' },
          { q: 'Unterstützt der Viewer das Einfügen per Zwischenablage?', a: 'Ja! Drücken Sie einfach Strg+V (Cmd+V auf Mac), um ein kopiertes Panorama direkt anzuzeigen.' },
          { q: 'Kann ich 360°-Fotos von DJI-Drohnen oder Kameras ansehen?', a: 'Ja. Jedes 2:1-Kugelpanorama von DJI-Drohnen (Mavic, Air, Mini) oder Kameras wie Insta360 und Ricoh Theta kann ohne Server-Upload sofort interaktiv betrachtet werden.' }
        ]
      },
      ja: {
        title: '無料オンライン360度パノラマビューアー — アップロード不要',
        description: '正距円筒図法360度パノラマ写真をブラウザで即座に閲覧。WebGLリアルタイム描画、リトルプラネット表示、Ctrl+V直接貼り付け対応。',
        keywords: '360度 写真 閲覧, 全天球 画像 ビューアー, 360パノラマビューア, 360度写真 見る, パノラマビューア オンライン, ブラウザで360度写真を見る, シータ 360 写真 パソコンで見る, 360ビューア無料',
        h1: '無料オンライン 360° パノラマビューアー',
        sub: 'アップロード不要。ブラウザ内で直接360度パノラマ写真を回転・拡大・探索できます。',
        faq: [
          { q: '写真データはサーバーに送信されますか？', a: 'いいえ。すべてのレンダリングはお使いの端末のGPU（WebGL）でローカル実行され、データは外部に送信されません。' },
          { q: 'クリップボードからの直接貼り付けに対応していますか？', a: 'はい。コピーしたパノラマ画像を画面上で Ctrl+V（Macは Cmd+V）するだけで即座に全天球表示されます。' },
          { q: 'DJIドローンや全天球カメラの写真に対応していますか？', a: 'はい、完全対応しています。DJIドローン（Mini/Air/Mavic）のパノラマやInsta360、RICOH THETAの2:1画像をドラッグするだけで、アップロードなしで即座に閲覧できます。' }
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
          { q: '无需上传可以直接下载免费立方体贴图包吗？', a: '可以。打开工具并选择示例，即可对照原图与6面预览并下载ZIP，无需上传自己的照片。' },
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
          { q: '¿Puedo descargar cubemaps gratis?', a: 'Sí. Abre la herramienta y elige un ejemplo para comparar el panorama con las seis caras y descargar el ZIP sin subir fotos.' },
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
          { q: 'Gibt es kostenlose Cubemaps zum Download?', a: 'Ja. Öffnen Sie das Werkzeug und wählen Sie ein Beispiel. Vergleichen Sie das Panorama mit den sechs Flächen und laden Sie das ZIP ohne eigene Fotos herunter.' },
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
          { q: '画像をアップロードせずに無料キューブマップを入手できますか？', a: 'はい。ツールを開いてサンプルを選ぶと、元のパノラマと6面を比較し、写真をアップロードせずにZIPを保存できます。' },
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
        description: '将参考照片发送至AI服务，生成新的2:1等距柱状360度全景图。生成需要积分，细节可能与真实场景不同；可选边缘融合用于减轻接缝。',
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
        description: 'Envía fotos de referencia al servicio de IA para generar un panorama 2:1 nuevo. Requiere créditos; los detalles pueden variar. La fusión de bordes es opcional.',
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
        description: 'Erzeuge mit Referenzfotos über den KI-Dienst ein neues 2:1-Panorama. Die Generierung benötigt Guthaben; Details können abweichen. Kantenüberblendung ist optional.',
        keywords: 'bild in 360 umwandeln, foto zu 360 grad, 2d bild in panorama, 360 grad bild konverter kostenlos',
        h1: 'Foto zu 360° Panorama Konverter KI',
        sub: 'Nutze Referenzfotos für ein neues 360°-Panorama, das sich drehen und erkunden lässt. KI-generierte Details können von der realen Szene abweichen.',
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
        sub: '参照写真をAIサービスに送信して、新しい360度パノラマを生成します。生成された細部は実際の場面と異なる場合があります。',
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

// Every public tool gets one crawlable link from every landing page, so Google and
// non-JS crawlers can reach pages that the React navigation only renders at runtime.
const SITE_LINKS = [
  { href: '/', label: 'AI 360° Panorama Generator' },
  { href: '/360-panorama-viewer/', label: '360° Panorama Viewer' },
  { href: '/cubemap-generator/', label: 'Cubemap Generator' },
  { href: '/cubemap-to-equirectangular/', label: 'Cubemap to Equirectangular' },
  { href: '/photo-to-360-converter/', label: 'Photo to 360 Converter' },
  { href: '/photo-to-globe/', label: 'Map to Globe' },
  { href: '/skybox-generator/', label: 'AI Skybox Generator' },
  { href: '/ai-hdri-generator/', label: 'AI HDRI Generator' },
  { href: '/hdri-viewer/', label: 'HDRI Viewer' },
  { href: '/hdri-to-cubemap/', label: 'HDRI to Cubemap' },
  { href: '/360-metadata-injector/', label: '360° Metadata Injector' },
  { href: '/360-image-maker/', label: '360 Image Maker' },
  { href: '/360-photo-to-video/', label: '360 Photo to Video' },
  { href: '/360-product-video-generator/', label: 'Panorama Showcase Video' },
  { href: '/minecraft-panorama-maker/', label: 'Minecraft Panorama Maker' },
  { href: '/text-to-panorama-ai/', label: 'Text to Panorama AI' },
];

const SITE_LINK_GROUPS = [
  { title: 'All 360° panorama tools', links: SITE_LINKS },
  {
    title: 'Plans and guides',
    links: [
      { href: '/pricing/', label: 'Pricing and credits' },
      { href: '/skybox-ai-alternative/', label: 'Skybox AI alternative' },
      { href: '/showcase/', label: 'Panorama showcase' },
      { href: '/blog/', label: 'Guides and fixes' },
      { href: '/developers/', label: 'Embed and API' },
      { href: '/about/', label: 'About and open source' },
    ],
  },
];

function buildEnglishSiteLinks() {
  const groups = SITE_LINK_GROUPS.map(group => `<h2>${group.title}</h2>
          <ul>
${group.links.map(link => `            <li><a href="${link.href}">${link.label}</a></li>`).join('\n')}
          </ul>`).join('\n          ');
  return `<!-- site-links:start -->
        <nav class="site-links" aria-label="All pages">
          ${groups}
        </nav>
        <!-- site-links:end -->`;
}

function injectEnglishSiteLinks(html) {
  const stripped = html.replace(/\n?\s*<!-- site-links:start -->[\s\S]*?<!-- site-links:end -->/g, '');
  if (!stripped.includes('</main>')) return stripped;
  return stripped.replace('</main>', `${buildEnglishSiteLinks()}\n      </main>`);
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
        inLanguage: lang,
        ...(usesCredits ? {} : { offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } }),
      },
      {
        '@type': 'FAQPage',
        '@id': `${canonicalUrl}#faq`,
        inLanguage: lang,
        mainEntity: t.faq.map(item => ({
          '@type': 'Question', name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
    ],
  };
  // ponytail: keep indexable guides static; the query selects the tool's interface language.
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
          ${LANGUAGES.map(l => `<a href="${l.code === 'en' ? `${toolPath}?lang=en` : `/${l.code}${toolPath}`}" lang="${l.code}" hreflang="${l.code}"${l.code === lang ? ' aria-current="page"' : ''}>${l.name}</a>`).join('\n          ')}
        </nav>
      </div>
    </header>
    <main class="wrap" id="content">
      <h1>${escapeHtml(t.h1)}</h1>
      <p>${escapeHtml(t.sub)}</p>
      <div class="cta">
        <p>${ui.notice}</p>
        <a class="button" href="${toolPath}?lang=${lang}" hreflang="${lang}">${ui.open}</a>
      </div>
      ${usesCredits ? `<p class="callout">${ui.ai}</p>` : ''}
      ${(PAGE_SECTIONS[page.id]?.[lang] || []).map((section, index) => `<section aria-labelledby="section-${index}">
        <h2 id="section-${index}">${escapeHtml(section.h2)}</h2>
        ${section.p.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('\n        ')}
        ${section.list ? `<ul>
          ${section.list.map(item => `<li>${escapeHtml(item)}</li>`).join('\n          ')}
        </ul>` : ''}
      </section>`).join('\n      ')}
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
    <footer class="wrap">
      <nav aria-label="${ui.allTools}">
        <a href="/${lang}/">${ui.home}</a>
        <a href="/pricing/">${ui.pricing}</a>
        <a href="/blog/">${ui.blog}</a>
        <a href="/showcase/">${ui.showcase}</a>
        <a href="/developers/">${ui.developers}</a>
        <a href="/about/">${ui.about}</a>
      </nav>
    </footer>
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
    const content = injectEnglishSiteLinks(html.replace(/<link rel="canonical"[^>]+>/, match => match + alternates));
    if (fs.readFileSync(englishPath, 'utf8') !== content) {
      fs.writeFileSync(englishPath, content, 'utf8');
      updatedUrls.add(`${DOMAIN}/${page.slug ? `${page.slug}/` : ''}`);
    }
  }
  injectSiteLinksIntoEnglishPages(updatedUrls);
  updateSitemapXml(updatedUrls);
}

// Pages outside PAGES (engines, metadata, showcase, developers, pricing) still need
// the same crawlable index so no tool page depends on runtime React navigation.
const SITE_LINK_SKIP_DIRS = new Set(['node_modules', 'dist', 'public', 'output', 'tests', 'scripts', 'server', 'src', 'docs', '.git', '.github', '.wrangler', '.playwright-cli', 'en']);

function injectSiteLinksIntoEnglishPages(updatedUrls) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || SITE_LINK_SKIP_DIRS.has(entry.name) || /^[a-z]{2}$/.test(entry.name)) continue;
    const file = path.join(rootDir, entry.name, 'index.html');
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    const content = injectEnglishSiteLinks(html);
    if (content !== html) {
      fs.writeFileSync(file, content, 'utf8');
      updatedUrls.add(`${DOMAIN}/${entry.name}/`);
    }
  }
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
    { slug: 'minecraft-panorama-maker', prio: '0.9', change: 'weekly' },
    { slug: 'ai-hdri-generator', prio: '0.9', change: 'weekly' },
    { slug: 'skybox-generator', prio: '0.9', change: 'weekly' },
    { slug: '360-image-maker', prio: '0.9', change: 'weekly' },
    { slug: '360-photo-to-video', prio: '0.9', change: 'weekly' },
    { slug: 'cubemap-to-equirectangular', prio: '0.85', change: 'weekly' },
    { slug: '360-metadata-injector', prio: '0.85', change: 'weekly' },
    { slug: 'hdri-viewer', prio: '0.85', change: 'weekly' },
    { slug: 'text-to-panorama-ai', prio: '0.85', change: 'weekly' },
    { slug: 'pricing', prio: '0.8', change: 'monthly' },
    { slug: 'skybox-ai-alternative', prio: '0.7', change: 'monthly' },
    { slug: 'developers', prio: '0.7', change: 'monthly' },
    { slug: 'showcase', prio: '0.7', change: 'daily' },
    { slug: 'blog', prio: '0.7', change: 'weekly' },
    { slug: 'blog/facebook-360-photo-not-working', prio: '0.6', change: 'monthly' },
    { slug: 'blog/equirectangular-projection-explained', prio: '0.6', change: 'monthly' },
    { slug: 'blog/how-to-make-a-360-panorama-without-a-360-camera', prio: '0.6', change: 'monthly' },
    { slug: 'blog/hdri-vs-ldr-environment-lighting', prio: '0.6', change: 'monthly' },
    { slug: 'blog/panorama-to-skybox-threejs-unity', prio: '0.6', change: 'monthly' },
    { slug: 'about', prio: '0.6', change: 'monthly' },
    { slug: 'examples/panorama-skybox', prio: '0.5', change: 'monthly' },
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
