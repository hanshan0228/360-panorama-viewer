import { useState, useEffect, useRef } from 'react';
import {
  Film,
  Video,
  Download,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Smartphone,
  Monitor,
  Square,
  RotateCw,
  ShoppingBag,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { renderPanoramaToVideoBlob, type VideoRecordOptions } from '../../utils/videoRecorder';

interface PhotoToVideoPageProps {
  onLaunchStudio: () => void;
  currentPanoramaUrl: string;
  onPanoramaChange: (url: string) => void;
}

export function PhotoToVideoPage({ onLaunchStudio, currentPanoramaUrl: activePanoUrl, onPanoramaChange: setActivePanoUrl }: PhotoToVideoPageProps) {
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const isProductMode = typeof window !== 'undefined' && window.location.pathname.includes('360-product-video');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>(() => (isProductMode ? '1:1' : '16:9'));
  const [duration, setDuration] = useState<number>(8);
  const [tilt, setTilt] = useState<boolean>(true);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [videoResult, setVideoResult] = useState<{ source: string; aspectRatio: string; duration: number; tilt: boolean; url: string; type: string } | null>(null);
  const videoDownloadUrl = videoResult?.source === activePanoUrl && videoResult.aspectRatio === aspectRatio &&
    videoResult.duration === duration && videoResult.tilt === tilt ? videoResult.url : null;
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    return () => { if (videoResult) URL.revokeObjectURL(videoResult.url); };
  }, [videoResult]);

  const handleCustomUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        setActivePanoUrl(event.target.result);
        setVideoResult(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleStartRender = async () => {
    if (isRecording) return;
    setIsRecording(true);
    setProgress(0);
    setVideoResult(null);

    let width = 1920;
    let height = 1080;

    if (aspectRatio === '9:16') {
      width = 1080;
      height = 1920;
    } else if (aspectRatio === '1:1') {
      width = 1080;
      height = 1080;
    }

    try {
      const options: VideoRecordOptions = {
        durationSeconds: duration,
        fps: 30,
        width,
        height,
        rotationRounds: 1,
        tiltDeg: tilt ? 6 : 0,
        onProgress: (pct) => setProgress(pct),
      };

      const blob = await renderPanoramaToVideoBlob(activePanoUrl, options);
      if (!mountedRef.current) return;
      const url = URL.createObjectURL(blob);
      setVideoResult({ source: activePanoUrl, aspectRatio, duration, tilt, url, type: blob.type || '' });

      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
      });
    } catch {
      alert('Video export failed. Please verify browser MediaRecorder support.');
    } finally {
      setIsRecording(false);
    }
  };

  const handleDownload = () => {
    if (!videoDownloadUrl || !videoResult) return;
    const a = document.createElement('a');
    a.href = videoDownloadUrl;
    const ext = (videoResult.type.includes('mp4') || videoResult.type.includes('h264') || videoResult.type.includes('avc')) ? 'mp4' : 'webm';
    a.download = `panorama-360-video-${videoResult.aspectRatio.replace(':', 'x')}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const faqs = [
    ...(isProductMode ? [
      {
        q: 'How does the 360 Product Video Generator improve conversion rates on Shopify & Amazon?',
        a: 'Rotating turntable videos give prospective buyers an all-angles view of textures, seams, and dimensions. Adding a 360 spin video to product media feeds has been shown to increase purchase intent by up to 30% while reducing customer return rates by clarifying real-world expectations.',
      },
      {
        q: 'Which aspect ratio is best for Shopify and Amazon product cards?',
        a: 'The 1:1 Square (1080x1080) preset is the e-commerce standard for Shopify and Amazon product gallery thumbnails. For full-width website hero displays, 16:9 Landscape is recommended.',
      },
    ] : []),
    {
      q: 'How does 360 Photo to Video generation work?',
      a: '360 Panorama Viewer maps your 2:1 equirectangular panorama onto a virtual 360° sphere and animates a cinematic camera rotating smoothly along the horizon. It captures the WebGL viewport in real-time using the browser MediaRecorder API, producing a ready-to-post MP4 or WebM video file without requiring any video editing software.',
    },
    {
      q: 'Which platforms can I post the generated 360 rotation videos on?',
      a: 'Because the output is a standard video file (16:9, 9:16, or 1:1), you can post it anywhere standard video is accepted: Instagram Reels, TikTok, YouTube Shorts, Shopify product showcases, Amazon 360 product listings, Facebook feed, and LinkedIn.',
    },
    {
      q: 'Can I choose vertical video format for TikTok and Instagram Reels?',
      a: 'Yes. Simply select the 9:16 Vertical option. The engine configures the virtual camera field-of-view for vertical smartphone displays, capturing an immersive look-around rotation optimized for mobile social feeds.',
    },
    {
      q: 'Is my photo uploaded to any external server during video rendering?',
      a: 'No. The entire rendering and encoding pipeline executes locally in your web browser memory using Three.js and HTML5 Canvas captureStream. Your source images and rendered videos remain 100% private on your machine.',
    },
    {
      q: 'Is this tool free to use?',
      a: 'Yes, the 360 Photo to Video Generator is 100% free with unlimited exports. You can upload any 360 panorama, customize duration and aspect ratio, and download high-definition video clips immediately.',
    },
  ];

  return (
    <div className="space-y-16 pb-16">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs text-cyan-400/70 pt-2">
        <a href="/" className="hover:text-cyan-300 transition-colors">Home</a>
        <span>/</span>
        <span className="text-cyan-300">Tools</span>
        <span>/</span>
        <span className="text-white font-medium">{isProductMode ? '360° Product Video Generator' : '360° Photo to Video'}</span>
      </nav>

      {/* Hero Section */}
      <section className="relative rounded-3xl overflow-hidden border border-cyan-500/25 bg-gradient-to-b from-[#061833]/85 via-[#030e20]/90 to-[#020914] p-6 sm:p-12 shadow-[0_0_60px_rgba(0,242,254,0.08)]">
        <div className="max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-400/15 border border-cyan-400/40 text-cyan-300 text-xs font-semibold tracking-wide">
            <Film className="w-3.5 h-3.5 text-cyan-400" />
            <span>{isProductMode ? 'E-COMMERCE 360 TURNTABLE • SHOPIFY • AMAZON • ETSY' : 'VIRAL VIDEO TOOL • TIKTOK • INSTAGRAM REELS • AMAZON 360'}</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
            {isProductMode ? '360° Product Video Generator: ' : '360° Photo to Video: '}
            <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-300 bg-clip-text text-transparent">
              {isProductMode ? 'Turn 360 Photos into Rotating E-Commerce Videos' : 'Turn Panoramas into Rotating Videos'}
            </span>
          </h1>

          <p className="text-base sm:text-lg text-cyan-100/80 leading-relaxed max-w-3xl">
            {isProductMode
              ? 'Convert 360° panoramic product captures and turntable photos into smooth rotating MP4/WebM videos for Shopify, Amazon, Etsy, and WooCommerce listings. 100% free and client-side.'
              : 'Convert any 360° equirectangular photo into a cinematic rotating MP4/WebM video in seconds. Optimized for TikTok, Instagram Reels, YouTube Shorts, and e-commerce 360 product showcases with zero server uploads.'}
          </p>

          <div className="flex flex-wrap items-center gap-6 pt-2 text-xs text-cyan-300/70">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
              <span>16:9 &bull; 9:16 (TikTok) &bull; 1:1 Formats</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
              <span>100% Client-Side WebGL Rendering</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
              <span>Silky-Smooth 30 FPS Camera Orbit</span>
            </span>
          </div>
        </div>
      </section>

      {/* Embedded Live Video Animator Tool */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
              Interactive Animator
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              Render Your 360 Rotation Video Online
            </h2>
          </div>
          <label className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 hover:text-white hover:bg-cyan-900/60 cursor-pointer transition-colors">
            <span>Upload Custom 360 Photo</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleCustomUpload}
              className="hidden"
            />
          </label>
        </div>

        <div className="rounded-3xl border border-cyan-500/30 bg-[#020b18] p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Aspect Ratio Selection */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-cyan-300">Choose Output Ratio &amp; Target Platform</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setAspectRatio('16:9')}
                  className={`p-4 rounded-2xl border text-xs font-semibold flex flex-col items-center gap-2 transition-all cursor-pointer ${
                    aspectRatio === '16:9'
                      ? 'border-cyan-400 bg-cyan-500/20 text-white shadow-lg shadow-cyan-500/20'
                      : 'border-cyan-500/20 bg-[#030d1c] text-cyan-200/70 hover:bg-cyan-500/10'
                  }`}
                >
                  <Monitor className="w-5 h-5 text-cyan-400" />
                  <span className="font-bold">16:9 Landscape</span>
                  <span className="text-[10px] text-cyan-400/60 font-mono">YouTube</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAspectRatio('9:16')}
                  className={`p-4 rounded-2xl border text-xs font-semibold flex flex-col items-center gap-2 transition-all cursor-pointer ${
                    aspectRatio === '9:16'
                      ? 'border-cyan-400 bg-cyan-500/20 text-white shadow-lg shadow-cyan-500/20'
                      : 'border-cyan-500/20 bg-[#030d1c] text-cyan-200/70 hover:bg-cyan-500/10'
                  }`}
                >
                  <Smartphone className="w-5 h-5 text-cyan-400" />
                  <span className="font-bold">9:16 Vertical</span>
                  <span className="text-[10px] text-cyan-400/60 font-mono">TikTok &bull; Reels</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAspectRatio('1:1')}
                  className={`p-4 rounded-2xl border text-xs font-semibold flex flex-col items-center gap-2 transition-all cursor-pointer ${
                    aspectRatio === '1:1'
                      ? 'border-cyan-400 bg-cyan-500/20 text-white shadow-lg shadow-cyan-500/20'
                      : 'border-cyan-500/20 bg-[#030d1c] text-cyan-200/70 hover:bg-cyan-500/10'
                  }`}
                >
                  <Square className="w-5 h-5 text-cyan-400" />
                  <span className="font-bold">1:1 Square</span>
                  <span className="text-[10px] text-cyan-400/60 font-mono">Instagram Feed</span>
                </button>
              </div>
            </div>

            {/* Duration & Movement */}
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-cyan-300 flex items-center justify-between">
                  <span>Loop Duration</span>
                  <span className="font-mono text-cyan-400">{duration} seconds</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[6, 8, 12].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setDuration(sec)}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                        duration === sec
                          ? 'border-cyan-400 bg-cyan-500/20 text-white font-bold'
                          : 'border-cyan-500/20 bg-[#030d1c] text-cyan-200/70 hover:bg-cyan-500/10'
                      }`}
                    >
                      {sec}s Loop
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer text-xs text-cyan-200 pt-2">
                <input
                  type="checkbox"
                  checked={tilt}
                  onChange={(e) => setTilt(e.target.checked)}
                  className="w-4 h-4 rounded border-cyan-500/40 bg-cyan-950 text-cyan-400 focus:ring-0 cursor-pointer"
                />
                <span>Add Dynamic Elevation Wave (Cinematic Drone Look)</span>
              </label>
            </div>
          </div>

          {/* Render Action Area */}
          <div className="pt-4 border-t border-cyan-500/20 space-y-4">
            {isRecording && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-cyan-300 font-semibold">
                    <RotateCw className="w-4 h-4 animate-spin text-teal-400" />
                    <span>Rendering 360° Rotating Video Frame-by-Frame...</span>
                  </span>
                  <span className="font-mono text-teal-400 font-bold">{progress}%</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-cyan-950 overflow-hidden border border-cyan-500/30">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-400 to-teal-400 transition-all duration-150"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {videoDownloadUrl && !isRecording && (
              <div className="p-4 rounded-2xl bg-teal-950/40 border border-teal-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2.5 text-xs text-teal-300 font-semibold">
                  <CheckCircle2 className="w-5 h-5 text-teal-400 shrink-0" />
                  <span>Your 360° rotation video has been successfully rendered!</span>
                </div>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-teal-400 to-cyan-400 text-slate-950 shadow-md hover:scale-105 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Video File</span>
                </button>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-cyan-400/60 font-mono">Client-Side MediaRecorder API</span>
              <button
                type="button"
                disabled={isRecording}
                onClick={handleStartRender}
                className="px-8 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 shadow-lg shadow-cyan-400/30 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                <Video className="w-4 h-4 fill-slate-950" />
                <span>{isRecording ? 'Rendering Video...' : 'Start 360° Video Render'}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Target Audiences Grid */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            Platform Ready
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            Where Can You Use 360 Rotation Videos?
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-6 space-y-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-400 w-fit">
              <Smartphone className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">TikTok &amp; Instagram Reels</h3>
            <p className="text-xs text-cyan-200/70 leading-relaxed">
              Export in 9:16 vertical mode to instantly showcase immersive AI environments, game backgrounds, and virtual worlds on mobile feeds.
            </p>
          </div>

          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-6 space-y-3">
            <div className="p-2.5 rounded-xl bg-teal-500/15 text-teal-400 w-fit">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Shopify &amp; Amazon 360</h3>
            <p className="text-xs text-cyan-200/70 leading-relaxed">
              Create rotating ambient product showcase videos and studio turntable videos that increase e-commerce listing conversion rates.
            </p>
          </div>

          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-6 space-y-3">
            <div className="p-2.5 rounded-xl bg-blue-500/15 text-blue-400 w-fit">
              <Monitor className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">YouTube Shorts &amp; Websites</h3>
            <p className="text-xs text-cyan-200/70 leading-relaxed">
              Export standard 16:9 widescreen video loops for website hero backgrounds, video trailers, and YouTube Shorts clips.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Accordion Section */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            Frequently Asked Questions
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            360 Photo to Video FAQs
          </h2>
        </div>

        <div className="max-w-3xl mx-auto space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = activeFaq === idx;
            return (
              <div
                key={idx}
                className="rounded-xl border border-cyan-500/25 bg-[#030e20] overflow-hidden transition-colors"
              >
                <button
                  type="button"
                  onClick={() => setActiveFaq(isOpen ? null : idx)}
                  className="w-full py-4 px-5 text-left flex items-center justify-between gap-4 font-semibold text-sm text-white hover:text-cyan-300 cursor-pointer transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-cyan-400 shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 text-xs text-cyan-100/80 leading-relaxed border-t border-cyan-500/15 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Final Action Callout */}
      <section className="rounded-3xl border border-cyan-400/40 bg-gradient-to-r from-[#031d42] via-[#042858] to-[#011430] p-8 sm:p-12 text-center space-y-6 shadow-2xl">
        <h2 className="text-2xl sm:text-4xl font-black text-white">
          Need a New 360 Panorama to Animate?
        </h2>
        <p className="text-sm sm:text-base text-cyan-100/80 max-w-xl mx-auto">
          Generate high-resolution equirectangular environments with AI, then convert to video in one click.
        </p>
        <div>
          <button
            type="button"
            onClick={onLaunchStudio}
            className="px-8 py-4 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-400 to-teal-400 text-slate-950 shadow-xl shadow-cyan-400/40 hover:scale-105 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 fill-slate-950" />
            <span>Open AI Panorama Studio</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>
    </div>
  );
}
