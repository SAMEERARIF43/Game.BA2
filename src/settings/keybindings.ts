export type KeybindAction =
  | 'moveForward'
  | 'moveBackward'
  | 'moveLeft'
  | 'moveRight'
  | 'jump'
  | 'sprint'
  | 'crouchToggle'
  | 'crouchHold'
  | 'slotGun'
  | 'slotKnife'
  | 'quickMelee'
  | 'reload'
  | 'cycleOptic'
  | 'streakUav'
  | 'streakBarrage'
  | 'streakOverdrive'
  | 'scoreboard';

export type KeybindCategory = 'movement' | 'weapons' | 'abilities';

export type KeybindingsConfig = Record<KeybindAction, string>;

export interface KeybindDefinition {
  action: KeybindAction;
  category: KeybindCategory;
  label: string;
  description: string;
}

export const DEFAULT_KEYBINDINGS: KeybindingsConfig = {
  moveForward: 'KeyW',
  moveBackward: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  jump: 'Space',
  sprint: 'ShiftLeft',
  crouchToggle: 'KeyC',
  crouchHold: 'ControlLeft',
  slotGun: 'Digit1',
  slotKnife: 'Digit2',
  quickMelee: 'KeyV',
  reload: 'KeyR',
  cycleOptic: 'KeyB',
  streakUav: 'F1',
  streakBarrage: 'F2',
  streakOverdrive: 'F3',
  scoreboard: 'Tab',
};

export const KEYBIND_DEFINITIONS: readonly KeybindDefinition[] = [
  // Movement
  { action: 'moveForward', category: 'movement', label: 'Move Forward', description: 'Advance toward aim direction' },
  { action: 'moveBackward', category: 'movement', label: 'Move Backward', description: 'Retreat backward' },
  { action: 'moveLeft', category: 'movement', label: 'Strafe Left', description: 'Sidestep left' },
  { action: 'moveRight', category: 'movement', label: 'Strafe Right', description: 'Sidestep right' },
  { action: 'jump', category: 'movement', label: 'Jump', description: 'Vertical leap / slide cancel' },
  { action: 'sprint', category: 'movement', label: 'Sprint', description: 'Hold while moving forward' },
  { action: 'crouchToggle', category: 'movement', label: 'Crouch (Toggle) / Slide', description: 'Toggle crouch or slide while sprinting' },
  { action: 'crouchHold', category: 'movement', label: 'Crouch (Hold) / Slide', description: 'Hold crouch or slide while sprinting' },

  // Weapon Switching & Combat
  { action: 'slotGun', category: 'weapons', label: 'Primary Gun (Slot 1)', description: 'Switch to equipped firearm' },
  { action: 'slotKnife', category: 'weapons', label: 'Combat Knife (Slot 2)', description: 'Switch to K-Bar knife' },
  { action: 'quickMelee', category: 'weapons', label: 'Quick Melee', description: 'Instant knife slash + return to gun' },
  { action: 'reload', category: 'weapons', label: 'Reload', description: 'Replenish active magazine' },
  { action: 'cycleOptic', category: 'weapons', label: 'Cycle Sniper Zoom', description: 'Toggle 4x / 6x / 8x magnification' },

  // Abilities & Utility
  { action: 'streakUav', category: 'abilities', label: 'UAV Sweep (3 Kills)', description: 'Reveal enemy radar pings' },
  { action: 'streakBarrage', category: 'abilities', label: 'Precision Barrage (5 Kills)', description: 'Call artillery strike on aim point' },
  { action: 'streakOverdrive', category: 'abilities', label: 'Tactical Overdrive (7 Kills)', description: 'Boost speed, reload & armor regen' },
  { action: 'scoreboard', category: 'abilities', label: 'Scoreboard', description: 'Hold to inspect match stats' },
];

export const KEYBIND_CATEGORIES: readonly { id: KeybindCategory; title: string }[] = [
  { id: 'movement', title: 'Movement' },
  { id: 'weapons', title: 'Weapon Switching & Combat' },
  { id: 'abilities', title: 'Abilities & Utility' },
];

export const RESERVED_KEY_CODES = new Set<string>([
  'Escape',
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight',
  'ContextMenu',
]);

const ALL_ACTIONS = Object.keys(DEFAULT_KEYBINDINGS) as KeybindAction[];

export function isValidKeyCode(code: unknown): code is string {
  if (typeof code !== 'string') return false;
  const trimmed = code.trim();
  if (trimmed.length === 0 || trimmed.length > 24) return false;
  if (RESERVED_KEY_CODES.has(trimmed)) return false;
  return /^[A-Za-z0-9_]+$/.test(trimmed);
}

export function validateKeybindings(
  raw: unknown,
  fallback: KeybindingsConfig = DEFAULT_KEYBINDINGS
): KeybindingsConfig {
  const safeFallback: KeybindingsConfig = { ...DEFAULT_KEYBINDINGS };
  for (const action of ALL_ACTIONS) {
    if (isValidKeyCode(fallback[action])) {
      safeFallback[action] = fallback[action];
    }
  }

  if (!raw || typeof raw !== 'object') {
    return safeFallback;
  }

  const obj = raw as Record<string, unknown>;
  const result: Partial<KeybindingsConfig> = {};
  const used = new Set<string>();

  // First pass: accept valid, unique bindings from stored config
  for (const action of ALL_ACTIONS) {
    const candidate = obj[action];
    if (isValidKeyCode(candidate) && !used.has(candidate)) {
      result[action] = candidate;
      used.add(candidate);
    }
  }

  // Second pass: fill missing or conflicting entries using fallback, then default, then any unused code
  for (const action of ALL_ACTIONS) {
    if (result[action]) continue;
    const fb = safeFallback[action];
    if (!used.has(fb)) {
      result[action] = fb;
      used.add(fb);
      continue;
    }
    const def = DEFAULT_KEYBINDINGS[action];
    if (!used.has(def)) {
      result[action] = def;
      used.add(def);
      continue;
    }
    const fallbackUnused = ALL_ACTIONS.map((a) => DEFAULT_KEYBINDINGS[a]).find(
      (code) => !used.has(code)
    );
    const chosen = fallbackUnused ?? def;
    result[action] = chosen;
    used.add(chosen);
  }

  return result as KeybindingsConfig;
}

export function rebindKey(
  current: KeybindingsConfig,
  action: KeybindAction,
  newCode: string
): { keybindings: KeybindingsConfig; swappedWith: KeybindAction | null } {
  const normalized = validateKeybindings(current);
  if (!isValidKeyCode(newCode)) {
    return { keybindings: normalized, swappedWith: null };
  }

  const prevCode = normalized[action];
  if (prevCode === newCode) {
    return { keybindings: normalized, swappedWith: null };
  }

  const conflictAction = ALL_ACTIONS.find(
    (other) => other !== action && normalized[other] === newCode
  ) ?? null;

  const next: KeybindingsConfig = {
    ...normalized,
    [action]: newCode,
  };

  if (conflictAction) {
    next[conflictAction] = prevCode;
  }

  return {
    keybindings: next,
    swappedWith: conflictAction,
  };
}

const SPECIAL_KEY_LABELS: Record<string, string> = {
  Space: 'SPACE',
  ShiftLeft: 'L-SHIFT',
  ShiftRight: 'R-SHIFT',
  ControlLeft: 'L-CTRL',
  ControlRight: 'R-CTRL',
  AltLeft: 'L-ALT',
  AltRight: 'R-ALT',
  Tab: 'TAB',
  CapsLock: 'CAPS',
  Enter: 'ENTER',
  NumpadEnter: 'NUM ENTER',
  Backspace: 'BACKSPACE',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
};

export function formatKeyCode(code: string): string {
  if (!code) return '?';
  if (SPECIAL_KEY_LABELS[code]) return SPECIAL_KEY_LABELS[code];
  if (code.startsWith('Key') && code.length === 4) {
    return code.slice(3).toUpperCase();
  }
  if (code.startsWith('Digit') && code.length === 6) {
    return code.slice(5);
  }
  if (code.startsWith('Numpad') && code.length > 6) {
    return `NUM ${code.slice(6).toUpperCase()}`;
  }
  return code.toUpperCase();
}
