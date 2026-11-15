import { useEffect, useRef } from 'react';
import { useTranslation } from '../../utils/i18n';
import { generatorMessages } from '../../utils/generatorTranslations';
import { Sparkles, X, Zap } from 'lucide-react';

interface UpgradePromptProps {
  isOpen: boolean;
  onClose: () => void;
  resultUrl?: string | null;
  costPer2K: number;
  onBuyPack: () => void;
  onSubscribe: () => void;
  onSeePlans: () => void;
}

// Mirrors the default pack catalog; the pricing page renders the server values.
const PACK = { credits: 25, priceCents: 499 };
const PRO_PRICE_CENTS = 990;

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function UpgradePrompt({ isOpen, onClose, resultUrl, costPer2K, onBuyPack, onSubscribe, onSeePlans }: UpgradePromptProps) {
  const t = useTranslation(generatorMessages);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    else if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  if (!isOpen) return null;

  const extraPanoramas = costPer2K > 0 ? Math.floor(PACK.credits / costPer2K) : 0;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="upgrade-title"
      onCancel={event => { event.preventDefault(); onClose(); }}
      className="app-dialog m-auto p-0 w-[calc(100%-2rem)] max-w-md bg-[#030d1d] border border-cyan-500/30 rounded-3xl text-sky-100 backdrop:bg-slate-950/80 backdrop:backdrop-blur-md"
    >
      <div className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Sparkles className="w-6 h-6 text-cyan-300 mb-3" />
            <h2 id="upgrade-title" className="text-lg font-bold text-white">{t("You're out of credits.")}</h2>
            <p className="text-sm text-cyan-200/80 mt-1">
              {resultUrl ? t("Your panorama is ready to download. Keep creating with more credits.") : t("Add credits to keep generating panoramas.")}
            </p>
          </div>
          <button type="button" aria-label={t("Close")} onClick={onClose} className="p-2 rounded-xl hover:bg-cyan-500/15">
            <X className="w-5 h-5" />
          </button>
        </div>

        {resultUrl && (
          <img src={resultUrl} alt={t("Your last generated panorama")} className="w-full h-32 object-cover rounded-xl border border-cyan-500/20" />
        )}

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => { onClose(); onBuyPack(); }}
            className="w-full py-3 rounded-xl bg-cyan-300 hover:bg-cyan-200 text-slate-950 font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-cyan-400/20"
          >
            <Zap className="w-4 h-4 fill-current" />
            <span>{t("Buy {credits} credits for {price}").replace("{credits}", () => String(PACK.credits)).replace("{price}", () => money(PACK.priceCents))}</span>
          </button>
          <p className="text-center text-[11px] text-cyan-200/70">
            {t("One-time payment · credits never expire · about {count} more 2K panoramas").replace("{count}", () => String(extraPanoramas))}
          </p>
        </div>

        <div className="rounded-xl border border-cyan-500/25 p-4 space-y-2">
          <p className="text-xs font-bold text-teal-300 uppercase tracking-wide">{t("Best value per image")}</p>
          <button
            type="button"
            onClick={() => { onClose(); onSubscribe(); }}
            className="w-full py-3 rounded-xl border border-cyan-400/50 text-cyan-100 font-bold hover:bg-cyan-500/10 transition-colors cursor-pointer"
          >
            {t("Subscribe — {price}/mo").replace("{price}", () => money(PRO_PRICE_CENTS))}
          </button>
          <p className="text-[11px] text-cyan-200/70">{t("120 credits per month. Cancel automatic renewal any time.")}</p>
        </div>

        <div className="flex items-center justify-between text-xs">
          <button type="button" onClick={onSeePlans} className="underline text-cyan-300 hover:text-white">{t("See all plans")}</button>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">{t("Not now")}</button>
        </div>
      </div>
    </dialog>
  );
}
