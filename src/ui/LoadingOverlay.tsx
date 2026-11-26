import React from 'react';
import { Crosshair, Loader2, X } from 'lucide-react';

interface LoadingOverlayProps {
  title: string;
  stage: string;
  progress?: number;
  detail?: string;
  onCancel?: () => void;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  title,
  stage,
  progress,
  detail,
  onCancel,
}) => {
  const isDeterminate = typeof progress === 'number' && Number.isFinite(progress);
  const clampedProgress = isDeterminate
    ? Math.max(0, Math.min(100, Math.round(progress)))
    : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[#070b11]/96 p-6"
    >
      <div className="w-full max-w-md border border-slate-400/20 bg-[#0e131b]/95 p-6 shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center border border-amber-400/40 bg-amber-500/10 text-amber-400">
              <Crosshair className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate font-display text-base font-bold tracking-wide text-white">
                {title}
              </div>
              {detail && (
                <div className="truncate text-xs text-slate-400">{detail}</div>
              )}
            </div>
          </div>

          <Loader2
            aria-hidden="true"
            className="h-5 w-5 shrink-0 animate-spin text-amber-400 motion-reduce:animate-none"
          />
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate font-medium text-slate-200">{stage}</span>
            {clampedProgress !== null && (
              <span className="shrink-0 font-mono-tabular font-semibold text-amber-300">
                {clampedProgress}%
              </span>
            )}
          </div>

          <div
            role="progressbar"
            aria-label={stage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={clampedProgress ?? undefined}
            className="mt-2.5 h-2 w-full overflow-hidden border border-white/10 bg-black/50"
          >
            {clampedProgress !== null ? (
              <div
                className="h-full w-full origin-left bg-amber-400 transition-transform duration-300 ease-out motion-reduce:transition-none"
                style={{ transform: `scaleX(${clampedProgress / 100})` }}
              />
            ) : (
              <div className="h-full w-2/5 origin-left animate-[loading-sweep_1.2s_ease-in-out_infinite] bg-amber-400 motion-reduce:w-full motion-reduce:animate-none" />
            )}
          </div>
        </div>

        {onCancel && (
          <div className="mt-5 flex justify-end border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex min-h-10 cursor-pointer items-center gap-2 border border-white/15 bg-white/5 px-4 py-2 font-display text-xs font-semibold text-slate-200 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 whitespace-nowrap"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
