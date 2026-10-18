import { useState, useRef, useEffect } from 'react';
import {
  ShieldCheck,
  UploadCloud,
  FileCheck2,
  Download,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Lock,
  Globe2,
  Share2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { exportPhotoSphereFile } from '../../utils/xmpInjector';

interface MetadataInjectorPageProps {
  onLaunchStudio: () => void;
}

export function MetadataInjectorPage({ onLaunchStudio }: MetadataInjectorPageProps) {
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const operations = useRef({ version: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!imagePreviewUrl) return;
    const lifecycle = operations.current;
    const operation = lifecycle.version;
    const image = new Image();
    image.onload = () => {
      if (operation === lifecycle.version) {
        setImageDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      }
    };
    image.onerror = () => {
      if (operation === lifecycle.version) {
        setError('Unable to decode this image. Choose a valid JPEG, PNG or WebP.');
        setIsProcessing(false);
      }
    };
    image.src = imagePreviewUrl;
    return () => {
      lifecycle.version++;
      image.onload = image.onerror = null;
      URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl, operations]);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) return;

    operations.current.version++;
    setSelectedFile(file);
    setIsSuccess(false);
    setIsProcessing(false);
    setImageDimensions(null);
    setError(null);

    const url = URL.createObjectURL(file);
    setImagePreviewUrl(url);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleInjectAndDownload = async () => {
    if (!selectedFile || !imagePreviewUrl || isProcessing) return;
    const operation = operations.current.version;
    setIsProcessing(true);
    setIsSuccess(false);
    setError(null);
    try {
      const blob = await exportPhotoSphereFile(selectedFile, imagePreviewUrl);
      if (operation !== operations.current.version) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      try {
        anchor.href = url;
        anchor.download = `${selectedFile.name.replace(/\.[^/.]+$/, '')}-photosphere-360.jpg`;
        document.body.appendChild(anchor);
        anchor.click();
      } finally {
        anchor.remove();
        URL.revokeObjectURL(url);
      }
      setIsSuccess(true);
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
    } catch {
      if (operation === operations.current.version) {
        setError('Failed to inject metadata. Choose a valid JPEG, PNG or WebP and try again.');
      }
    } finally {
      if (operation === operations.current.version) setIsProcessing(false);
    }
  };

  const faqs = [
    {
      q: 'Why do my 360 photos show up flat instead of interactive on Facebook?',
      a: 'Platforms like Facebook, Google Street View, and VR headsets inspect the binary headers of uploaded images for official Google PhotoSphere XMP tags (specifically GPano:ProjectionType="equirectangular"). Without these tags, the platform assumes the image is a standard flat panorama and will not render the interactive 3D navigation sphere.',
    },
    {
      q: 'Does injecting metadata decrease image quality or compress pixels?',
      a: 'JPEG files retain their original encoded pixels and existing metadata: only a PhotoSphere XMP packet is added. PNG and WebP files are converted to JPEG at 0.95 quality before tagging, so that conversion can change pixels.',
    },
    {
      q: 'Is this tool safe and private?',
      a: 'Yes, 100%. All binary parsing and byte manipulation happens locally in your web browser memory. Your images are never transmitted or saved to any external cloud server.',
    },
    {
      q: 'Can I inject metadata into PNG or WebP files?',
      a: 'The official PhotoSphere XMP specification requires a JPEG container. When you upload a PNG or WebP image, 360 Panorama Viewer automatically packages it into a high-quality (0.95 quality factor) JPEG container with injected XMP tags ready for instant upload.',
    },
    {
      q: 'What specific XMP tags are added to the file?',
      a: '360 Panorama Viewer injects the full Google PhotoSphere GPano specification: ProjectionType=equirectangular, UsePanoramaViewer=True, FullPanoWidthPixels, FullPanoHeightPixels, CroppedAreaImageWidthPixels, CroppedAreaImageHeightPixels, and PoseHeadingDegrees=0.0.',
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
        <span className="text-white font-medium">360° Metadata Injector</span>
      </nav>

      {/* Hero Section */}
      <section className="relative rounded-3xl overflow-hidden border border-cyan-500/25 bg-gradient-to-b from-[#061833]/85 via-[#030e20]/90 to-[#020914] p-6 sm:p-12 shadow-[0_0_60px_rgba(0,242,254,0.08)]">
        <div className="max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-400/15 border border-blue-400/40 text-blue-300 text-xs font-semibold tracking-wide">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            <span>FREE TOOL &bull; OFFICIAL GOOGLE PHOTOSPHERE XMP TAGGER</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
            Free 360° Photo Metadata Injector:{' '}
            <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-teal-300 bg-clip-text text-transparent">
              Facebook &amp; Street View Ready
            </span>
          </h1>

          <p className="text-base sm:text-lg text-cyan-100/80 leading-relaxed max-w-3xl">
            Embed official Google PhotoSphere XMP and EXIF metadata into any equirectangular JPG image directly in your browser.
            Fix "flat panorama" upload issues and make your AI panoramas interactive on Facebook, Google Street View, and VR platforms.
          </p>

          <div className="flex flex-wrap items-center gap-6 pt-2 text-xs text-cyan-300/70">
            <span className="flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-teal-400" />
              <span>100% Client-Side (No Uploads)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
              <span>Standards-Compliant Adobe XMP</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
              <span>Lossless JPEG Metadata Injection</span>
            </span>
          </div>
        </div>
      </section>

      {/* Live In-Page Drag & Drop Injector Tool */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
              Interactive Tool
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              Drop Your 360 Panorama Below to Inject Metadata
            </h2>
          </div>
          <div className="text-xs text-cyan-300/80">
            Supports JPG &bull; PNG &bull; WebP
          </div>
        </div>

        <div className="rounded-2xl border border-cyan-500/30 bg-[#020b18] p-6 sm:p-8 shadow-2xl">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          {!selectedFile ? (
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 sm:p-14 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center gap-4 ${
                dragActive
                  ? 'border-cyan-400 bg-cyan-500/10 scale-[1.01]'
                  : 'border-cyan-500/30 hover:border-cyan-400/60 bg-[#041024]/60 hover:bg-[#061836]/60'
              }`}
            >
              <div className="p-4 rounded-2xl bg-cyan-500/15 text-cyan-400 shadow-inner">
                <UploadCloud className="w-10 h-10 animate-pulse" />
              </div>
              <div className="space-y-1">
                <div className="text-base font-bold text-white">
                  Drop your 2:1 equirectangular panorama here
                </div>
                <div className="text-xs text-cyan-300/60">
                  or click to browse from your computer (JPG, PNG, WebP)
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Image Preview & Details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center bg-[#041026] p-4 rounded-2xl border border-cyan-500/25">
                <div className="relative rounded-xl overflow-hidden border border-cyan-500/30 aspect-[2/1] bg-black">
                  {imagePreviewUrl && (
                    <img
                      src={imagePreviewUrl}
                      alt="Uploaded preview"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>

                <div className="md:col-span-2 space-y-3">
                  <div className="flex items-center gap-2">
                    <FileCheck2 className="w-5 h-5 text-teal-400" />
                    <span className="font-bold text-white text-sm truncate">{selectedFile.name}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    <div className="bg-[#030c1c] p-2.5 rounded-lg border border-cyan-500/15">
                      <div className="text-cyan-400/60 text-[10px]">Dimensions</div>
                      <div className="font-mono text-cyan-200 font-semibold">
                        {imageDimensions ? `${imageDimensions.width} × ${imageDimensions.height}` : 'Reading...'}
                      </div>
                    </div>
                    <div className="bg-[#030c1c] p-2.5 rounded-lg border border-cyan-500/15">
                      <div className="text-cyan-400/60 text-[10px]">Aspect Ratio</div>
                      <div className="font-mono text-teal-400 font-semibold">
                        {imageDimensions
                          ? `${(imageDimensions.width / imageDimensions.height).toFixed(2)} : 1`
                          : 'Checking...'}
                      </div>
                    </div>
                    <div className="bg-[#030c1c] p-2.5 rounded-lg border border-cyan-500/15">
                      <div className="text-cyan-400/60 text-[10px]">XMP Status</div>
                      <div className="font-mono text-amber-300 font-semibold">Ready to Inject</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={handleInjectAndDownload}
                      className="px-6 py-3 rounded-xl font-bold text-xs bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 shadow-lg shadow-cyan-400/30 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
                    >
                      <Download className="w-4 h-4" />
                      <span>{isProcessing ? 'Injecting XMP Tags...' : 'Inject & Download 360 JPEG'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        operations.current.version++;
                        setIsProcessing(false);
                        setError(null);
                        setImageDimensions(null);
                        setSelectedFile(null);
                        setImagePreviewUrl(null);
                        setIsSuccess(false);
                      }}
                      className="px-4 py-3 rounded-xl font-semibold text-xs bg-cyan-950/40 text-cyan-300 hover:text-white transition-colors cursor-pointer"
                    >
                      Choose Another File
                    </button>
                  </div>

                  {isSuccess && (
                    <div className="flex items-center gap-2 text-xs text-teal-300 bg-teal-950/40 border border-teal-500/30 p-2.5 rounded-xl">
                      <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                      <span>
                        Success! PhotoSphere XMP tags injected. Your 360 photo is ready for Facebook, Street View, and VR.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}

      {/* Platform Compatibility Matrix */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            Verified Support
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            Compatible Platforms &amp; Viewers
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-5 space-y-2">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Share2 className="w-4 h-4 text-blue-400" />
              <span>Facebook 360</span>
            </div>
            <p className="text-xs text-cyan-200/70 leading-relaxed">
              Enables interactive gyroscope navigation on mobile feed and drag-to-look on desktop feeds automatically.
            </p>
          </div>

          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-5 space-y-2">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Globe2 className="w-4 h-4 text-teal-400" />
              <span>Google Street View</span>
            </div>
            <p className="text-xs text-cyan-200/70 leading-relaxed">
              Fulfills Google Maps PhotoSphere requirements for blue line virtual tour submissions.
            </p>
          </div>

          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-5 space-y-2">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>Kuula &amp; Roundme</span>
            </div>
            <p className="text-xs text-cyan-200/70 leading-relaxed">
              Auto-detects full 360° x 180° boundaries without requiring manual projection adjustments.
            </p>
          </div>

          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-5 space-y-2">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>Meta Quest &amp; Vision Pro</span>
            </div>
            <p className="text-xs text-cyan-200/70 leading-relaxed">
              Displays natively in spatial photo viewers and WebXR gallery experiences.
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
            360° Metadata &amp; XMP FAQ
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
      <section className="rounded-3xl border border-blue-400/40 bg-gradient-to-r from-[#031d42] via-[#042452] to-[#011430] p-8 sm:p-12 text-center space-y-6 shadow-2xl">
        <h2 className="text-2xl sm:text-4xl font-black text-white">
          Generate New 360 Panoramas with AI
        </h2>
        <p className="text-sm sm:text-base text-cyan-100/80 max-w-xl mx-auto">
          Need new 360 environments? Create seamless equirectangular panoramas from text prompts with our AI Studio.
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
