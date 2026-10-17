import { useState, useEffect, useRef } from 'react';
import {
  X,
  Video,
  Download,
  Film,
  Smartphone,
  Monitor,
  Square,
  RotateCw,
  CheckCircle2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { renderPanoramaToVideoBlob, type VideoRecordOptions } from '../../utils/videoRecorder';

interface PhotoToVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPanoramaUrl: string;
}

export function PhotoToVideoModal({
  isOpen,
  onClose,
  currentPanoramaUrl,
}: PhotoToVideoModalProps) {
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [duration, setDuration] = useState<number>(8);
  const [tilt, setTilt] = useState<boolean>(true);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [videoResult, setVideoResult] = useState<{ source: string; aspectRatio: string; duration: number; tilt: boolean; url: string; type: string } | null>(null);
  const videoDownloadUrl = videoResult?.source === currentPanoramaUrl && videoResult.aspectRatio === aspectRatio &&
    videoResult.duration === duration && videoResult.tilt === tilt ? videoResult.url : null;
  const renderVersionRef = useRef(0);

  useEffect(() => {
    renderVersionRef.current += 1;
    return () => { renderVersionRef.current += 1; };
  }, [isOpen]);

  useEffect(() => {
    return () => { if (videoResult) URL.revokeObjectURL(videoResult.url); };
  }, [videoResult]);

  if (!isOpen) return null;

  const handleStartRender = async () => {
    if (isRecording) return;
    const renderVersion = renderVersionRef.current;
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

      const blob = await renderPanoramaToVideoBlob(currentPanoramaUrl, options);
      if (renderVersionRef.current !== renderVersion) return;
      const url = URL.createObjectURL(blob);
      setVideoResult({ source: currentPanoramaUrl, aspectRatio, duration, tilt, url, type: blob.type || '' });

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
    a.download = `panorama-360-rotation-${videoResult.aspectRatio.replace(':', 'x')}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#040e22] border border-cyan-400/40 rounded-3xl p-6 sm:p-8 shadow-[0_0_60px_rgba(0,242,254,0.15)] text-sky-100 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-cyan-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-400 to-blue-600 text-slate-950 font-bold shadow-md shadow-cyan-500/30">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-white">360° Photo to Video Animator</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-400/20 text-cyan-300 font-bold">
                  MP4 / WebM
                </span>
              </div>
              <p className="text-xs text-cyan-300/70">
                Render a 360° rotating video clip for TikTok, Instagram Reels, and Amazon
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-cyan-400 hover:text-white hover:bg-cyan-500/15 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Aspect Ratio */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
              <span>Aspect Ratio</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setAspectRatio('16:9')}
                className={`p-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  aspectRatio === '16:9'
                    ? 'border-cyan-400 bg-cyan-500/20 text-white'
                    : 'border-cyan-500/20 bg-[#030d1c] text-cyan-200/70 hover:bg-cyan-500/10'
                }`}
              >
                <Monitor className="w-4 h-4 text-cyan-400" />
                <span>16:9 Wide</span>
                <span className="text-[9px] text-cyan-400/60 font-mono">YouTube</span>
              </button>

              <button
                type="button"
                onClick={() => setAspectRatio('9:16')}
                className={`p-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  aspectRatio === '9:16'
                    ? 'border-cyan-400 bg-cyan-500/20 text-white'
                    : 'border-cyan-500/20 bg-[#030d1c] text-cyan-200/70 hover:bg-cyan-500/10'
                }`}
              >
                <Smartphone className="w-4 h-4 text-cyan-400" />
                <span>9:16 Vertical</span>
                <span className="text-[9px] text-cyan-400/60 font-mono">TikTok/Reels</span>
              </button>

              <button
                type="button"
                onClick={() => setAspectRatio('1:1')}
                className={`p-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  aspectRatio === '1:1'
                    ? 'border-cyan-400 bg-cyan-500/20 text-white'
                    : 'border-cyan-500/20 bg-[#030d1c] text-cyan-200/70 hover:bg-cyan-500/10'
                }`}
              >
                <Square className="w-4 h-4 text-cyan-400" />
                <span>1:1 Square</span>
                <span className="text-[9px] text-cyan-400/60 font-mono">Feed</span>
              </button>
            </div>
          </div>

          {/* Duration & Movement */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-cyan-300 flex items-center justify-between">
                <span>Duration</span>
                <span className="font-mono text-cyan-400">{duration} seconds</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[6, 8, 12].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setDuration(sec)}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
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

            <label className="flex items-center gap-2 cursor-pointer text-xs text-cyan-200">
              <input
                type="checkbox"
                checked={tilt}
                onChange={(e) => setTilt(e.target.checked)}
                className="w-4 h-4 rounded border-cyan-500/40 bg-cyan-950 text-cyan-400 focus:ring-0 cursor-pointer"
              />
              <span>Add Dynamic Elevation Wave (Drone Flight Feel)</span>
            </label>
          </div>
        </div>

        {/* Progress & Actions */}
        <div className="pt-2 border-t border-cyan-500/20 space-y-4">
          {isRecording && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-cyan-300 font-semibold">
                  <RotateCw className="w-3.5 h-3.5 animate-spin text-teal-400" />
                  <span>Recording 360° Video Rotation in Browser...</span>
                </span>
                <span className="font-mono text-teal-400 font-bold">{progress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-cyan-950 overflow-hidden border border-cyan-500/30">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-teal-400 transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {videoDownloadUrl && !isRecording && (
            <div className="p-3 rounded-2xl bg-teal-950/40 border border-teal-500/30 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs text-teal-300 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                <span>360° Rotation Video Render Complete!</span>
              </div>
              <button
                type="button"
                onClick={handleDownload}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-teal-400 to-cyan-400 text-slate-950 shadow-md hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Video</span>
              </button>
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-cyan-950/40 text-cyan-300 hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={isRecording}
              onClick={handleStartRender}
              className="px-6 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 shadow-lg shadow-cyan-400/30 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              <Video className="w-4 h-4 fill-slate-950" />
              <span>{isRecording ? 'Rendering...' : 'Render 360° Video'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
