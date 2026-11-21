export type UiAudioCue = 'click' | 'toggle' | 'sfx_preview';

type UiAudioHandler = (cue: UiAudioCue) => void;

let activeHandler: UiAudioHandler | null = null;

export function registerUiAudioHandler(handler: UiAudioHandler | null): void {
  activeHandler = handler;
}

export function playUiAudioCue(cue: UiAudioCue = 'click'): void {
  activeHandler?.(cue);
}
