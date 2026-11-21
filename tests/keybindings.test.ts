import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_KEYBINDINGS,
  formatKeyCode,
  KEYBIND_CATEGORIES,
  KEYBIND_DEFINITIONS,
  rebindKey,
  validateKeybindings,
} from '../src/settings/keybindings.ts';
import {
  DEFAULT_SETTINGS,
  loadPersistedSettings,
  resetPersistedSettings,
  savePersistedSettings,
  SETTINGS_STORAGE_KEY,
  validateSettings,
} from '../src/settings/settingsStorage.ts';

function withMockLocalStorage(fn: (store: Map<string, string>) => void): void {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };

  const prevWindow = (globalThis as Record<string, unknown>).window;
  (globalThis as Record<string, unknown>).window = { localStorage: mockStorage };
  try {
    fn(store);
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      (globalThis as Record<string, unknown>).window = prevWindow;
    }
  }
}

test('Keybindings: definitions cover movement, weapon switching, and abilities', () => {
  const categories = new Set(KEYBIND_CATEGORIES.map((c) => c.id));
  assert.deepStrictEqual(categories, new Set(['movement', 'weapons', 'abilities']));

  for (const def of KEYBIND_DEFINITIONS) {
    assert.ok(categories.has(def.category));
    assert.ok(DEFAULT_KEYBINDINGS[def.action], `Missing default for ${def.action}`);
  }
});

test('Keybindings: rebindKey swaps conflicting keys and ignores reserved keys', () => {
  // Non-conflicting rebind
  const clean = rebindKey(DEFAULT_KEYBINDINGS, 'quickMelee', 'KeyG');
  assert.strictEqual(clean.swappedWith, null);
  assert.strictEqual(clean.keybindings.quickMelee, 'KeyG');
  assert.strictEqual(clean.keybindings.reload, DEFAULT_KEYBINDINGS.reload);

  // Conflicting rebind swaps previous binding cleanly
  const swapped = rebindKey(clean.keybindings, 'quickMelee', 'KeyR');
  assert.strictEqual(swapped.swappedWith, 'reload');
  assert.strictEqual(swapped.keybindings.quickMelee, 'KeyR');
  assert.strictEqual(swapped.keybindings.reload, 'KeyG');

  // Reserved system keys (Escape, MetaLeft) are ignored
  const reserved = rebindKey(swapped.keybindings, 'jump', 'Escape');
  assert.strictEqual(reserved.swappedWith, null);
  assert.strictEqual(reserved.keybindings.jump, DEFAULT_KEYBINDINGS.jump);

  const metaReserved = rebindKey(swapped.keybindings, 'jump', 'MetaLeft');
  assert.strictEqual(metaReserved.keybindings.jump, DEFAULT_KEYBINDINGS.jump);
});

test('Keybindings: validateKeybindings deduplicates corrupt/duplicate entries cleanly', () => {
  const validated = validateKeybindings({
    moveForward: 'ArrowUp',
    moveBackward: 'ArrowUp', // duplicate conflict!
    jump: 'Escape', // reserved!
    reload: 'bad key!', // invalid chars!
  });

  assert.strictEqual(validated.moveForward, 'ArrowUp');
  assert.notStrictEqual(validated.moveBackward, 'ArrowUp');
  assert.strictEqual(validated.jump, DEFAULT_KEYBINDINGS.jump);
  assert.strictEqual(validated.reload, DEFAULT_KEYBINDINGS.reload);

  const values = Object.values(validated);
  assert.strictEqual(new Set(values).size, values.length, 'All bindings must remain unique');
});

test('Keybindings: formatKeyCode renders crisp labels', () => {
  assert.strictEqual(formatKeyCode('KeyW'), 'W');
  assert.strictEqual(formatKeyCode('Digit1'), '1');
  assert.strictEqual(formatKeyCode('Space'), 'SPACE');
  assert.strictEqual(formatKeyCode('ShiftLeft'), 'L-SHIFT');
  assert.strictEqual(formatKeyCode('ControlLeft'), 'L-CTRL');
  assert.strictEqual(formatKeyCode('ArrowUp'), 'UP');
  assert.strictEqual(formatKeyCode('F2'), 'F2');
});

test('Keybindings: persisted to localStorage across save/load/reset', () => {
  withMockLocalStorage((store) => {
    const custom = {
      ...DEFAULT_SETTINGS,
      keybindings: {
        ...DEFAULT_KEYBINDINGS,
        moveForward: 'ArrowUp',
        slotGun: 'KeyQ',
        streakUav: 'Digit4',
      },
    };

    const saved = savePersistedSettings(custom);
    assert.strictEqual(saved.keybindings.moveForward, 'ArrowUp');
    assert.strictEqual(saved.keybindings.slotGun, 'KeyQ');
    assert.strictEqual(saved.keybindings.streakUav, 'Digit4');

    const rawStored = store.get(SETTINGS_STORAGE_KEY);
    assert.ok(rawStored, 'Settings JSON must be written to localStorage');

    const reloaded = loadPersistedSettings();
    assert.strictEqual(reloaded.keybindings.moveForward, 'ArrowUp');
    assert.strictEqual(reloaded.keybindings.slotGun, 'KeyQ');
    assert.strictEqual(reloaded.keybindings.streakUav, 'Digit4');

    const reset = resetPersistedSettings();
    assert.deepStrictEqual(reset.keybindings, DEFAULT_KEYBINDINGS);
    assert.deepStrictEqual(loadPersistedSettings().keybindings, DEFAULT_KEYBINDINGS);
  });

  // Legacy settings object without keybindings safely falls back to defaults
  const legacy = validateSettings({ callsign: 'LegacyOp', fovDeg: 90 });
  assert.deepStrictEqual(legacy.keybindings, DEFAULT_KEYBINDINGS);
});
