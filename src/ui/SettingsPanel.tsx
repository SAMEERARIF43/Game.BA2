import React, { useEffect, useState } from 'react';
import { Keyboard, Maximize2, Minimize2, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import {
  GameSettings,
  GraphicsQuality,
  PostSlideStance,
  SlideTriggerMode,
} from '../game/types';
import {
  DEFAULT_KEYBINDINGS,
  formatKeyCode,
  isValidKeyCode,
  KEYBIND_CATEGORIES,
  KEYBIND_DEFINITIONS,
  KeybindAction,
  rebindKey,
  RESERVED_KEY_CODES,
} from '../settings/keybindings';
import {
  isFullscreenActive,
  isFullscreenSupported,
  toggleFullscreen,
} from '../utils/fullscreen';
import { playUiAudioCue } from '../utils/uiAudio';

interface SettingsPanelProps {
  settings: GameSettings;
  inMatch?: boolean;
  onUpdateSettings: (next: GameSettings) => void;
  onResetSettings?: () => void;
}

type SettingsTab = 'aim' | 'controls' | 'graphics' | 'audio' | 'match';

const QUALITY_OPTIONS: { id: GraphicsQuality; label: string; detail: string }[] = [
  { id: 'LOW', label: 'LOW', detail: 'Shadows off · reduced FX' },
  { id: 'MEDIUM', label: 'MEDIUM', detail: 'Dynamic shadows · balanced' },
  { id: 'HIGH', label: 'HIGH', detail: 'Full shadows · enhanced FX' },
];

const RANGE_CLASS = 'mt-2 w-full cursor-pointer accent-amber-400';
const LABEL_CLASS = 'text-xs text-slate-300';
const FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e131b]';

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  inMatch = false,
  onUpdateSettings,
  onResetSettings,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('controls');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => isFullscreenActive());
  const [listeningAction, setListeningAction] = useState<KeybindAction | null>(null);
  const [bindNotice, setBindNotice] = useState<string | null>(null);
  const fullscreenSupported = isFullscreenSupported();
  const keybindings = settings.keybindings ?? DEFAULT_KEYBINDINGS;

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'controls', label: 'Controls' },
    { id: 'aim', label: 'Aim & Mouse' },
    { id: 'graphics', label: 'Graphics' },
    { id: 'audio', label: 'Audio' },
    ...(!inMatch ? [{ id: 'match' as const, label: 'Match' }] : []),
  ];

  useEffect(() => {
    const syncFs = () => setIsFullscreen(isFullscreenActive());
    document.addEventListener('fullscreenchange', syncFs);
    document.addEventListener('webkitfullscreenchange', syncFs);
    return () => {
      document.removeEventListener('fullscreenchange', syncFs);
      document.removeEventListener('webkitfullscreenchange', syncFs);
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'controls' && listeningAction !== null) {
      setListeningAction(null);
    }
  }, [activeTab, listeningAction]);

  useEffect(() => {
    if (!listeningAction) return;

    const onCaptureKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.code === 'Escape') {
        setListeningAction(null);
        setBindNotice('Rebind cancelled.');
        return;
      }

      if (RESERVED_KEY_CODES.has(event.code) || !isValidKeyCode(event.code)) {
        setListeningAction(null);
        setBindNotice(`${formatKeyCode(event.code)} is a reserved system key.`);
        return;
      }

      const { keybindings: nextBindings, swappedWith } = rebindKey(
        keybindings,
        listeningAction,
        event.code
      );
      onUpdateSettings({
        ...settings,
        keybindings: nextBindings,
      });

      const currentDef = KEYBIND_DEFINITIONS.find((d) => d.action === listeningAction);
      if (swappedWith) {
        const swappedDef = KEYBIND_DEFINITIONS.find((d) => d.action === swappedWith);
        setBindNotice(
          `Bound [${formatKeyCode(event.code)}] to ${currentDef?.label ?? listeningAction} (swapped with ${swappedDef?.label ?? swappedWith}).`
        );
      } else {
        setBindNotice(
          `Bound [${formatKeyCode(event.code)}] to ${currentDef?.label ?? listeningAction}.`
        );
      }
      setListeningAction(null);
    };

    window.addEventListener('keydown', onCaptureKey, { capture: true });
    return () => window.removeEventListener('keydown', onCaptureKey, { capture: true });
  }, [keybindings, listeningAction, onUpdateSettings, settings]);

  const handleToggleFullscreen = () => {
    void toggleFullscreen().then((active) => setIsFullscreen(active));
  };

  const handleResetKeybindings = () => {
    setListeningAction(null);
    onUpdateSettings({
      ...settings,
      keybindings: { ...DEFAULT_KEYBINDINGS },
    });
    setBindNotice('Keybindings restored to defaults.');
  };

  const renderToggle = (label: string, checked: boolean, onChange: () => void) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`flex w-full items-center justify-between gap-4 border border-white/10 bg-black/25 px-3 py-2.5 text-left text-xs text-slate-200 transition-colors hover:border-white/20 ${FOCUS_CLASS}`}
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
          checked ? 'border-amber-400 bg-amber-400/30' : 'border-slate-600 bg-slate-800'
        }`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-transform ${
            checked ? 'translate-x-4 bg-amber-300' : 'translate-x-0.5 bg-slate-300'
          }`}
        />
      </span>
    </button>
  );

  const renderSlider = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    displayValue: string,
    onChange: (value: number) => void
  ) => (
    <label className="block border border-white/10 bg-black/25 p-3">
      <span className="flex items-center justify-between gap-3">
        <span className={LABEL_CLASS}>{label}</span>
        <span className="font-mono-tabular text-xs text-white">{displayValue}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={RANGE_CLASS}
      />
    </label>
  );

  const effectiveVolumePct = settings.muted ? 0 : Math.round(settings.volume * 100);

  return (
    <div className="space-y-4">
      <section
        aria-label="Global audio controls"
        className="flex flex-col gap-3 border border-white/12 bg-black/35 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center justify-between gap-3 sm:justify-start">
          <button
            type="button"
            role="switch"
            aria-checked={!settings.muted}
            aria-label={settings.muted ? 'Unmute game sound effects and UI clicks' : 'Mute game sound effects and UI clicks'}
            onClick={() => onUpdateSettings({ ...settings, muted: !settings.muted })}
            className={`inline-flex min-h-10 cursor-pointer items-center gap-2 border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${FOCUS_CLASS} ${
              settings.muted
                ? 'border-red-400/50 bg-red-500/15 text-red-200 hover:bg-red-500/25'
                : 'border-amber-400/50 bg-amber-400/15 text-amber-200 hover:bg-amber-400/25'
            }`}
          >
            {settings.muted ? (
              <VolumeX className="h-4 w-4 text-red-400" aria-hidden="true" />
            ) : (
              <Volume2 className="h-4 w-4 text-amber-400" aria-hidden="true" />
            )}
            <span>{settings.muted ? 'Audio Muted' : 'Audio Active'}</span>
          </button>

          <span className="text-[11px] text-slate-400">
            SFX &amp; UI clicks
          </span>
        </div>

        <label className="flex flex-1 items-center gap-3 sm:max-w-xs">
          <span className="shrink-0 text-xs text-slate-300">Master</span>
          <input
            type="range"
            aria-label="Global master volume"
            min={0}
            max={1}
            step={0.05}
            value={settings.volume}
            onChange={(event) => {
              const nextVolume = Number(event.target.value);
              onUpdateSettings({
                ...settings,
                volume: nextVolume,
                muted: nextVolume <= 0,
              });
            }}
            className="w-full cursor-pointer accent-amber-400"
          />
          <span className="w-10 shrink-0 text-right font-mono-tabular text-xs font-semibold text-white">
            {effectiveVolumePct}%
          </span>
        </label>
      </section>

      <div
        className={`grid gap-1 border-b border-white/10 pb-3 ${
          inMatch ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-5'
        }`}
        role="tablist"
        aria-label="Settings categories"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`settings-tab-${tab.id}`}
            type="button"
            role="tab"
            tabIndex={activeTab === tab.id ? 0 : -1}
            aria-selected={activeTab === tab.id}
            aria-controls="settings-tab-panel"
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => {
              const currentIndex = tabs.findIndex((entry) => entry.id === tab.id);
              let nextIndex: number | null = null;
              if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
              if (event.key === 'ArrowLeft') {
                nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
              }
              if (event.key === 'Home') nextIndex = 0;
              if (event.key === 'End') nextIndex = tabs.length - 1;
              if (nextIndex === null) return;
              event.preventDefault();
              const nextTab = tabs[nextIndex];
              setActiveTab(nextTab.id);
              document.getElementById(`settings-tab-${nextTab.id}`)?.focus();
            }}
            className={`border px-2 py-2 text-xs font-semibold transition-colors ${FOCUS_CLASS} ${
              activeTab === tab.id
                ? 'border-amber-400/70 bg-amber-400/10 text-amber-300'
                : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/25 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section
        id="settings-tab-panel"
        role="tabpanel"
        aria-labelledby={`settings-tab-${activeTab}`}
        className="max-h-[min(56vh,480px)] space-y-3 overflow-y-auto pr-1"
      >
        {activeTab === 'controls' && (
          <div className="space-y-4">
            <section
              aria-label="Tactical Slide"
              className="space-y-2.5 border border-white/12 bg-black/30 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-xs font-bold tracking-wider text-amber-300 uppercase">
                  Tactical Slide
                </h3>
                <span className="text-[11px] text-slate-400">
                  Sprint + Crouch while moving forward
                </span>
              </div>

              {(() => {
                const slideEnabled = settings.slideEnabled ?? true;
                const slideInputMode = settings.slideInputMode ?? settings.slideTrigger ?? 'tap';
                const slidePostStance =
                  settings.slidePostStance ?? settings.postSlideStance ?? 'stand';
                const slideJumpCancel =
                  settings.slideJumpCancel ?? settings.jumpCancelsSlide ?? true;
                const slideCameraTilt =
                  settings.slideCameraTilt ?? (settings.slideCameraIntensity ?? 1.0) > 0;

                return (
                  <>
                    {renderToggle(
                      `Enable Tactical Slide (${slideEnabled ? 'On' : 'Off'})`,
                      slideEnabled,
                      () =>
                        onUpdateSettings({
                          ...settings,
                          slideEnabled: !slideEnabled,
                        })
                    )}

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <div className="border border-white/10 bg-black/25 p-2.5">
                        <div className={LABEL_CLASS}>Slide Trigger</div>
                        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                          {(
                            [
                              { id: 'tap', label: 'Tap Crouch' },
                              { id: 'hold', label: 'Hold Crouch' },
                            ] as { id: SlideTriggerMode; label: string }[]
                          ).map((opt) => {
                            const active = slideInputMode === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                aria-pressed={active}
                                onClick={() =>
                                  onUpdateSettings({
                                    ...settings,
                                    slideInputMode: opt.id,
                                    slideTrigger: opt.id,
                                  })
                                }
                                className={`cursor-pointer border px-2 py-1.5 text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors ${FOCUS_CLASS} ${
                                  active
                                    ? 'border-amber-400 bg-amber-400/15 text-amber-200'
                                    : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25 hover:text-white'
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="border border-white/10 bg-black/25 p-2.5">
                        <div className={LABEL_CLASS}>End-of-Slide Stance</div>
                        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                          {(
                            [
                              { id: 'stand', label: 'Auto-Stand' },
                              { id: 'crouch', label: 'Stay Crouched' },
                            ] as { id: PostSlideStance; label: string }[]
                          ).map((opt) => {
                            const active = slidePostStance === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                aria-pressed={active}
                                onClick={() =>
                                  onUpdateSettings({
                                    ...settings,
                                    slidePostStance: opt.id,
                                    postSlideStance: opt.id,
                                  })
                                }
                                className={`cursor-pointer border px-2 py-1.5 text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors ${FOCUS_CLASS} ${
                                  active
                                    ? 'border-amber-400 bg-amber-400/15 text-amber-200'
                                    : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25 hover:text-white'
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {renderToggle(
                        `Jump-Cancel Slide (${slideJumpCancel ? 'On' : 'Off'})`,
                        slideJumpCancel,
                        () => {
                          const next = !slideJumpCancel;
                          onUpdateSettings({
                            ...settings,
                            slideJumpCancel: next,
                            jumpCancelsSlide: next,
                          });
                        }
                      )}
                      {renderToggle(
                        `Slide Camera Tilt & FOV Boost (${slideCameraTilt ? 'On' : 'Off'})`,
                        slideCameraTilt,
                        () => {
                          const next = !slideCameraTilt;
                          onUpdateSettings({
                            ...settings,
                            slideCameraTilt: next,
                            slideCameraIntensity: next ? 1.0 : 0,
                          });
                        }
                      )}
                    </div>
                  </>
                );
              })()}
            </section>

            <div className="flex flex-wrap items-center justify-between gap-2 border border-white/10 bg-black/30 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Keyboard className="h-3.5 w-3.5 text-amber-400" />
                <span>
                  {listeningAction
                    ? 'Press any key to assign · [Esc] to cancel'
                    : 'Click any binding to assign a new key (duplicates swap automatically)'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleResetKeybindings}
                className={`cursor-pointer border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition-colors hover:bg-white/10 hover:text-white ${FOCUS_CLASS}`}
              >
                Reset Keys
              </button>
            </div>

            {bindNotice && (
              <div
                className="border border-amber-400/35 bg-amber-400/10 px-3 py-1.5 text-[11px] text-amber-200"
                role="status"
              >
                {bindNotice}
              </div>
            )}

            {KEYBIND_CATEGORIES.map((category) => {
              const items = KEYBIND_DEFINITIONS.filter((d) => d.category === category.id);
              return (
                <div key={category.id} className="space-y-1.5">
                  <div className="font-display text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                    {category.title}
                  </div>
                  <div className="space-y-1">
                    {items.map((def) => {
                      const isListening = listeningAction === def.action;
                      const currentCode = keybindings[def.action] ?? DEFAULT_KEYBINDINGS[def.action];
                      const isModified = currentCode !== DEFAULT_KEYBINDINGS[def.action];
                      return (
                        <div
                          key={def.action}
                          className="flex items-center justify-between gap-3 border border-white/10 bg-black/25 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-slate-100">{def.label}</div>
                            <div className="text-[10px] text-slate-400">{def.description}</div>
                          </div>
                          <button
                            type="button"
                            aria-label={`Rebind ${def.label}, current key ${formatKeyCode(currentCode)}`}
                            aria-pressed={isListening}
                            onClick={() => {
                              setBindNotice(null);
                              setListeningAction((prev) =>
                                prev === def.action ? null : def.action
                              );
                            }}
                            className={`min-w-[92px] shrink-0 cursor-pointer border px-2.5 py-1.5 font-mono-tabular text-xs font-bold transition-colors ${FOCUS_CLASS} ${
                              isListening
                                ? 'animate-pulse border-amber-400 bg-amber-400/20 text-amber-200'
                                : isModified
                                  ? 'border-sky-400/60 bg-sky-500/15 text-sky-200 hover:border-sky-300'
                                  : 'border-white/15 bg-white/5 text-white hover:border-amber-400/60 hover:text-amber-200'
                            }`}
                          >
                            {isListening ? 'PRESS KEY...' : formatKeyCode(currentCode)}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'aim' && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {renderSlider(
                'Mouse Sensitivity',
                settings.sensitivity,
                0.0005,
                0.008,
                0.0001,
                (settings.sensitivity * 1000).toFixed(1),
                (sensitivity) => onUpdateSettings({ ...settings, sensitivity })
              )}
              {renderSlider(
                'ADS Scope Sensitivity',
                settings.adsSensitivityMultiplier,
                0.3,
                1.2,
                0.02,
                `${settings.adsSensitivityMultiplier.toFixed(2)}x`,
                (adsSensitivityMultiplier) =>
                  onUpdateSettings({ ...settings, adsSensitivityMultiplier })
              )}
            </div>
            {renderToggle('Invert Y Axis', settings.invertY, () =>
              onUpdateSettings({ ...settings, invertY: !settings.invertY })
            )}
            {renderSlider(
              'Screen Shake & Feedback',
              settings.screenShakeScale ?? 1,
              0,
              1,
              0.05,
              `${Math.round((settings.screenShakeScale ?? 1) * 100)}%`,
              (screenShakeScale) => onUpdateSettings({ ...settings, screenShakeScale })
            )}
          </>
        )}

        {activeTab === 'graphics' && (
          <>
            {renderSlider(
              'Field of View',
              settings.fovDeg,
              70,
              110,
              1,
              `${settings.fovDeg}°`,
              (fovDeg) => onUpdateSettings({ ...settings, fovDeg })
            )}
            <div>
              <div className="mb-1.5 text-xs text-slate-300">Graphics Quality</div>
              <div className="grid grid-cols-3 gap-2">
                {QUALITY_OPTIONS.map((quality) => {
                  const selected = settings.graphicsQuality === quality.id;
                  return (
                    <button
                      key={quality.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        onUpdateSettings({ ...settings, graphicsQuality: quality.id })
                      }
                      className={`border px-2 py-2 text-left transition-colors ${FOCUS_CLASS} ${
                        selected
                          ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                          : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <span className="block font-mono-tabular text-xs font-bold">
                        {quality.label}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-slate-400">
                        {quality.detail}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            {renderToggle('Show FPS', settings.showFps, () =>
              onUpdateSettings({ ...settings, showFps: !settings.showFps })
            )}
            <div className="border border-white/10 bg-black/25 p-3.5 space-y-3">
              <div className="text-xs font-semibold text-slate-200">Team Color Customization</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="border border-white/10 bg-black/40 p-2.5">
                  <div className="flex items-center justify-between text-xs text-slate-300 mb-1.5">
                    <span>Ally / Friendly Color</span>
                    <span className="font-mono-tabular text-[10px]" style={{ color: settings.allyTeamColor ?? '#3b82f6' }}>
                      {settings.allyTeamColor ?? '#3b82f6'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.allyTeamColor ?? '#3b82f6'}
                      onChange={(e) => onUpdateSettings({ ...settings, allyTeamColor: e.target.value })}
                      className="h-7 w-10 cursor-pointer bg-transparent border border-white/20"
                    />
                    <div className="flex gap-1.5 flex-wrap">
                      {['#3b82f6', '#06b6d4', '#10b981', '#8b5cf6'].map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => onUpdateSettings({ ...settings, allyTeamColor: hex })}
                          className="h-5 w-5 border border-white/30 transition-transform hover:scale-110 cursor-pointer"
                          style={{ backgroundColor: hex }}
                          title={`Preset ${hex}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="border border-white/10 bg-black/40 p-2.5">
                  <div className="flex items-center justify-between text-xs text-slate-300 mb-1.5">
                    <span>Enemy / Hostile Color</span>
                    <span className="font-mono-tabular text-[10px]" style={{ color: settings.enemyTeamColor ?? '#ef4444' }}>
                      {settings.enemyTeamColor ?? '#ef4444'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.enemyTeamColor ?? '#ef4444'}
                      onChange={(e) => onUpdateSettings({ ...settings, enemyTeamColor: e.target.value })}
                      className="h-7 w-10 cursor-pointer bg-transparent border border-white/20"
                    />
                    <div className="flex gap-1.5 flex-wrap">
                      {['#ef4444', '#f97316', '#dc2626', '#eab308'].map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => onUpdateSettings({ ...settings, enemyTeamColor: hex })}
                          className="h-5 w-5 border border-white/30 transition-transform hover:scale-110 cursor-pointer"
                          style={{ backgroundColor: hex }}
                          title={`Preset ${hex}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 border border-white/10 bg-black/25 px-3 py-2.5">
              <span className="text-xs text-slate-300">Display</span>
              <button
                type="button"
                disabled={!fullscreenSupported}
                onClick={handleToggleFullscreen}
                className={`inline-flex cursor-pointer items-center justify-center gap-2 border border-white/15 bg-white/5 px-3 py-2 text-xs text-slate-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_CLASS}`}
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 className="h-3.5 w-3.5 text-amber-400" />
                    Exit Fullscreen
                  </>
                ) : (
                  <>
                    <Maximize2 className="h-3.5 w-3.5 text-amber-400" />
                    Fullscreen
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {activeTab === 'audio' && (
          <>
            {renderSlider(
              'SFX & UI Clicks Volume',
              settings.sfxVolume,
              0,
              1,
              0.05,
              `${Math.round(settings.sfxVolume * 100)}%`,
              (sfxVolume) => onUpdateSettings({ ...settings, sfxVolume })
            )}
            {renderSlider(
              'Ambient / Music Volume',
              settings.musicVolume,
              0,
              1,
              0.05,
              `${Math.round(settings.musicVolume * 100)}%`,
              (musicVolume) => onUpdateSettings({ ...settings, musicVolume })
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border border-white/10 bg-black/25 px-3 py-2.5">
              <div className="flex items-center gap-2 text-[11px] text-slate-300">
                {settings.muted || settings.volume <= 0 ? (
                  <VolumeX className="h-3.5 w-3.5 text-red-400" aria-hidden="true" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                )}
                <span>
                  {settings.muted
                    ? 'All game SFX, ambient audio, and UI clicks are muted.'
                    : 'Global mute and master volume apply to game SFX and UI clicks.'}
                </span>
              </div>
              <button
                type="button"
                data-ui-sound="none"
                disabled={settings.muted || settings.volume <= 0}
                onClick={() => playUiAudioCue('sfx_preview')}
                className={`cursor-pointer border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-amber-400/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap ${FOCUS_CLASS}`}
              >
                Test Sound
              </button>
            </div>
          </>
        )}

        {activeTab === 'match' && !inMatch && (
          <>
            <label className="block">
              <span className={LABEL_CLASS}>Operator Callsign</span>
              <input
                type="text"
                maxLength={20}
                value={settings.callsign}
                onChange={(event) =>
                  onUpdateSettings({ ...settings, callsign: event.target.value })
                }
                onBlur={(event) => {
                  const callsign = event.target.value.trim() || 'Operator-101';
                  if (callsign !== settings.callsign) {
                    onUpdateSettings({ ...settings, callsign });
                  }
                }}
                className={`mt-1.5 w-full border border-white/15 bg-black/50 px-3 py-2 text-xs text-white outline-none focus:border-amber-400 ${FOCUS_CLASS}`}
                placeholder="Operator-101"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className={LABEL_CLASS}>TDM Score Limit</div>
                <div className="mt-1.5 flex gap-2">
                  {[15, 30, 50].map((limit) => (
                    <button
                      key={limit}
                      type="button"
                      aria-pressed={settings.killLimit === limit}
                      onClick={() => onUpdateSettings({ ...settings, killLimit: limit })}
                      className={`flex-1 border py-2 font-mono-tabular text-xs font-semibold ${FOCUS_CLASS} ${
                        settings.killLimit === limit
                          ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      {limit}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className={LABEL_CLASS}>Squad Size</div>
                <div className="mt-1.5 flex gap-2">
                  {[3, 4, 5].map((size) => (
                    <button
                      key={size}
                      type="button"
                      aria-pressed={settings.botsPerTeam === size}
                      onClick={() => onUpdateSettings({ ...settings, botsPerTeam: size })}
                      className={`flex-1 border py-2 font-mono-tabular text-xs font-semibold ${FOCUS_CLASS} ${
                        settings.botsPerTeam === size
                          ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      {size}v{size}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {onResetSettings && (
        <div className="flex justify-end border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => {
              setListeningAction(null);
              setBindNotice(null);
              onResetSettings();
            }}
            className={`inline-flex cursor-pointer items-center gap-1.5 border border-white/15 bg-white/5 px-3 py-2 text-xs text-slate-300 transition-colors hover:bg-white/10 hover:text-white ${FOCUS_CLASS}`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to Defaults
          </button>
        </div>
      )}
    </div>
  );
};
