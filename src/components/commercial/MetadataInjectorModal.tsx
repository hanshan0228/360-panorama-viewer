import { useState, useRef, useEffect } from 'react';
import {
  X,
  UploadCloud,
  FileCheck2,
  Download,
  ShieldCheck,
  Sparkles,
  Info,
  CheckCircle2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { exportPhotoSphereFile } from '../../utils/xmpInjector';

interface MetadataInjectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MetadataInjectorModal({ isOpen, onClose }: MetadataInjectorModalProps) {
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

  useEffect(() => {
    const lifecycle = operations.current;
    return () => { lifecycle.version++; };
  }, [isOpen, operations]);

  const [previousIsOpen, setPreviousIsOpen] = useState(isOpen);
  if (previousIsOpen !== isOpen) {
    setPreviousIsOpen(isOpen);
    if (!isOpen) setIsProcessing(false);
  }

  if (!isOpen) return null;

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
  const isAspectRatio2to1 =
    imageDimensions &&
    Math.abs(imageDimensions.width / imageDimensions.height - 2.0) < 0.05;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#030d1d] border border-cyan-400/40 rounded-3xl p-6 sm:p-8 shadow-2xl text-white">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 hover:text-white hover:bg-cyan-500/20 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 rounded-2xl bg-cyan-500/15 border border-cyan-400/30 text-cyan-300">
            <ShieldCheck className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>360° PhotoSphere Metadata Injector</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-400/20 text-cyan-300 border border-cyan-400/30">
                CLIENT-SIDE
              </span>
            </h2>
            <p className="text-xs text-cyan-200/70">
              Embed Google GPano XMP tags into any equirectangular JPG/PNG for native VR recognition.
            </p>
          </div>
        </div>

        {/* Dropzone */}
        {!imagePreviewUrl ? (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
              dragActive
                ? 'border-cyan-400 bg-cyan-500/15 scale-[1.01]'
                : 'border-cyan-500/30 hover:border-cyan-400/60 bg-cyan-950/20'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => handleFiles(e.target.files)}
              className="hidden"
            />
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center mx-auto mb-4 text-cyan-400">
              <UploadCloud className="w-7 h-7" />
            </div>
            <div className="text-sm font-bold text-white mb-1">
              Drag &amp; drop your 360° panorama image here
            </div>
            <div className="text-xs text-cyan-300/60">
              Supports JPEG, PNG, WebP up to 16K (Processed 100% locally in your browser)
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Image Preview & Details */}
            <div className="relative rounded-2xl overflow-hidden border border-cyan-500/30 bg-black/60 h-44 flex items-center justify-center">
              <img
                src={imagePreviewUrl}
                alt="Panorama to inject metadata"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full border border-cyan-500/30 text-xs font-mono text-cyan-300">
                {imageDimensions
                  ? `${imageDimensions.width} × ${imageDimensions.height} px`
                  : 'Detecting...'}
              </div>
              <button
                type="button"
                onClick={() => {
                  operations.current.version++;
                  setIsProcessing(false);
                  setError(null);
                  setImagePreviewUrl(null);
                  setSelectedFile(null);
                  setImageDimensions(null);
                  setIsSuccess(false);
                }}
                className="absolute top-3 right-3 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-full border border-cyan-500/30 text-[11px] text-cyan-300 hover:text-white transition-colors cursor-pointer"
              >
                Change Image
              </button>
            </div>

            {/* Validation & Tag Information */}
            <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-cyan-200/70">Aspect Ratio Check:</span>
                <span
                  className={`font-mono font-bold flex items-center gap-1 ${
                    isAspectRatio2to1 ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {isAspectRatio2to1 ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Valid 2:1 Equirectangular Standard</span>
                    </>
                  ) : (
                    <>
                      <Info className="w-3.5 h-3.5" />
                      <span>Non-standard ratio (Recommended 2:1 for VR)</span>
                    </>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-cyan-200/70">Injected XMP Packet:</span>
                <span className="font-mono text-cyan-300 text-[11px]">
                  Google GPano v1.0 (Full Sphere 360°×180°)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-cyan-200/70">Compatible Viewers:</span>
                <span className="text-white text-[11px]">
                  Facebook, Google Photos, Apple Vision Pro, Meta Quest
                </span>
              </div>
            </div>

            {/* Action Button */}
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleInjectAndDownload}
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-cyan-400 via-teal-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-black text-sm shadow-lg shadow-cyan-500/30 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
            >
              {isProcessing ? (
                <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : isSuccess ? (
                <>
                  <FileCheck2 className="w-4 h-4 text-slate-950" />
                  <span>Metadata Injected &amp; Downloaded! Click to Download Again</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Inject PhotoSphere XMP &amp; Download VR JPEG</span>
                </>
              )}
            </button>
          </div>
        )}

        {error && <p role="alert" className="text-sm text-red-300 mt-3">{error}</p>}

        {/* Feature Badges */}
        <div className="mt-6 pt-5 border-t border-cyan-500/15 flex flex-wrap items-center justify-between gap-3 text-[11px] text-cyan-300/70">
          <span className="flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Zero server upload • 100% Private</span>
          </span>
          <span>Free Unlimited Use • Open GPano Standard</span>
        </div>
      </div>
    </div>
  );
}
