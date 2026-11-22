import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { isOrdnanceKillName } from '../src/game/ammoDisplay.ts';
import {
  applyTacticalEquipmentSelection,
  isTacticalEquipmentId,
  normalizeTacticalEquipmentId,
  resolveRespawnTacticalEquipment,
  TacticalLoadoutState,
} from '../src/game/loadoutRules.ts';
import {
  TACTICAL_EQUIPMENT,
  TACTICAL_EQUIPMENT_IDS,
  WEAPONS,
} from '../src/game/types.ts';
import { INITIAL_HUD } from '../src/match/matchMachine.ts';
import { DEFAULT_KEYBINDINGS } from '../src/settings/keybindings.ts';
import {
  DEFAULT_SETTINGS,
  loadPersistedSettings,
  resetPersistedSettings,
  savePersistedSettings,
  SETTINGS_STORAGE_KEY,
} from '../src/settings/settingsStorage.ts';
import { DeathScreen } from '../src/ui/DeathScreen.tsx';
import { GameHUD } from '../src/ui/GameHUD.tsx';
import { MainMenu } from '../src/ui/MainMenu.tsx';
import { PauseMenu } from '../src/ui/PauseMenu.tsx';
import { TacticalEquipmentPreview } from '../src/ui/WeaponPreview.tsx';

function createMemoryWindow() {
  const store = new Map<string, string>();
  const mockLocalStorage = {
    getItem(key: string): string | null {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value));
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    clear(): void {
      store.clear();
    },
  };
  return { windowObj: { localStorage: mockLocalStorage }, store };
}

test('Tactical Equipment: registry, loadout selection, and settings persistence', async (t) => {
  await t.test('TACTICAL_EQUIPMENT_IDS defines 4 tactical items in Slot 3 including Smoke and Flashbang', () => {
    assert.deepStrictEqual(TACTICAL_EQUIPMENT_IDS, [
      'smoke_grenade',
      'flashbang',
      'frag_grenade',
      'stun_grenade',
    ]);

    for (const id of TACTICAL_EQUIPMENT_IDS) {
      assert.strictEqual(isTacticalEquipmentId(id), true);
      const cfg = TACTICAL_EQUIPMENT[id];
      assert.strictEqual(cfg.slot, 3);
      assert.ok(cfg.name.length > 0);
      assert.ok(cfg.shortName.length > 0);
      assert.ok(cfg.chargesPerSpawn >= 1);
      assert.ok(cfg.fuseSec > 0);
      assert.ok(cfg.cooldownSec > 0);
      assert.ok(cfg.radiusMeters > 0);
      assert.ok(cfg.tooltip.length > 20);
      assert.match(cfg.accentHex, /^#[0-9a-fA-F]{6}$/);
    }

    assert.strictEqual(isTacticalEquipmentId('invalid_gadget'), false);
    assert.strictEqual(normalizeTacticalEquipmentId('invalid_gadget'), 'smoke_grenade');
    assert.strictEqual(isOrdnanceKillName(TACTICAL_EQUIPMENT.frag_grenade.name), true);
  });

  await t.test('applyTacticalEquipmentSelection switches immediately pre-spawn/dead and queues while alive', () => {
    const start: TacticalLoadoutState = {
      equippedTacticalId: 'smoke_grenade',
      queuedTacticalId: 'smoke_grenade',
    };

    const menuSwitch = applyTacticalEquipmentSelection(start, 'flashbang', 'menu', true);
    assert.strictEqual(menuSwitch.switchedImmediately, true);
    assert.strictEqual(menuSwitch.queuedForNextSpawn, false);
    assert.strictEqual(menuSwitch.loadout.equippedTacticalId, 'flashbang');
    assert.strictEqual(menuSwitch.loadout.queuedTacticalId, 'flashbang');

    const aliveQueue = applyTacticalEquipmentSelection(
      menuSwitch.loadout,
      'frag_grenade',
      'playing',
      true
    );
    assert.strictEqual(aliveQueue.switchedImmediately, false);
    assert.strictEqual(aliveQueue.queuedForNextSpawn, true);
    assert.strictEqual(aliveQueue.loadout.equippedTacticalId, 'flashbang');
    assert.strictEqual(aliveQueue.loadout.queuedTacticalId, 'frag_grenade');

    const respawned = resolveRespawnTacticalEquipment(aliveQueue.loadout);
    assert.strictEqual(respawned.equippedTacticalId, 'frag_grenade');
    assert.strictEqual(respawned.queuedTacticalId, 'frag_grenade');

    const deadSwitch = applyTacticalEquipmentSelection(
      start,
      'stun_grenade',
      'playing',
      false
    );
    assert.strictEqual(deadSwitch.switchedImmediately, true);
    assert.strictEqual(deadSwitch.loadout.equippedTacticalId, 'stun_grenade');
  });

  await t.test('tacticalEquipmentId and useTactical keybinding persist and sanitize safely', () => {
    assert.strictEqual(DEFAULT_KEYBINDINGS.useTactical, 'KeyX');
    assert.strictEqual(DEFAULT_SETTINGS.tacticalEquipmentId, 'smoke_grenade');

    const previousWindow = (globalThis as any).window;
    const { windowObj, store } = createMemoryWindow();
    (globalThis as any).window = windowObj;

    try {
      const initial = loadPersistedSettings();
      assert.strictEqual(initial.tacticalEquipmentId, 'smoke_grenade');
      assert.strictEqual(initial.keybindings.useTactical, 'KeyX');

      for (const id of TACTICAL_EQUIPMENT_IDS) {
        savePersistedSettings({
          ...initial,
          tacticalEquipmentId: id,
        });
        const reloaded = loadPersistedSettings();
        assert.strictEqual(reloaded.tacticalEquipmentId, id);
      }

      store.set(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ tacticalEquipmentId: 'broken_tactical' })
      );
      const sanitized = loadPersistedSettings();
      assert.strictEqual(sanitized.tacticalEquipmentId, 'smoke_grenade');

      const reset = resetPersistedSettings();
      assert.strictEqual(reset.tacticalEquipmentId, 'smoke_grenade');
    } finally {
      if (previousWindow === undefined) {
        delete (globalThis as any).window;
      } else {
        (globalThis as any).window = previousWindow;
      }
    }
  });
});

test('Tactical Equipment UI: MainMenu, PauseMenu, DeathScreen, GameHUD, and SVG previews render cleanly', async (t) => {
  await t.test('TacticalEquipmentPreview renders vector SVG art for every tactical item', () => {
    for (const id of TACTICAL_EQUIPMENT_IDS) {
      const html = renderToStaticMarkup(
        React.createElement(TacticalEquipmentPreview, { equipmentId: id })
      );
      assert.ok(html.includes(`data-tactical-preview="${id}"`));
      assert.ok(html.includes(`data-tactical-art="${id}"`));
    }
  });

  await t.test('MainMenu renders Slot 03 Tactical Equipment summary and all equipment quick selectors', () => {
    const html = renderToStaticMarkup(
      React.createElement(MainMenu, {
        selectedMapId: 'urban',
        selectedCharacterId: 'assault',
        selectedGunId: 'ak47',
        knifeCharmId: 'tactical_tag',
        tacticalEquipmentId: 'flashbang',
        settings: { ...DEFAULT_SETTINGS, tacticalEquipmentId: 'flashbang' },
        xp: 0,
        onSelectCharacter: () => {},
        onSelectGun: () => {},
        onSelectKnifeCharm: () => {},
        onSelectTacticalEquipment: () => {},
        onPlayOfflineTdm: () => {},
        onOpenCustomMatch: () => {},
        onOpenMapSelect: () => {},
        onUpdateSettings: () => {},
      })
    );

    assert.ok(html.includes('SLOT 03 · TACTICAL EQUIPMENT'));
    assert.ok(html.includes('M84 Flashbang'));
    assert.ok(html.includes('data-tactical-preview="flashbang"'));
    assert.ok(html.includes('data-tactical-tooltip="flashbang"'));
    assert.ok(html.includes(TACTICAL_EQUIPMENT.flashbang.tooltip));
    assert.ok(html.includes('9.5m'));
    assert.ok(html.includes('3.2s'));
    assert.ok(html.includes('0.5s CD'));
    assert.ok(html.includes('Smoke'));
    assert.ok(html.includes('Frag'));
    assert.ok(html.includes('Stun'));
  });

  await t.test('PauseMenu and DeathScreen display Slot 03 Tactical Equipment selectors', () => {
    const hud = {
      ...INITIAL_HUD,
      tacticalEquipmentId: 'smoke_grenade' as const,
      queuedTacticalEquipmentId: 'flashbang' as const,
      tacticalCharges: 1,
      tacticalMaxCharges: 2,
      isGunSwitchLocked: true,
      match: {
        ...INITIAL_HUD.match,
        phase: 'paused' as const,
      },
    };

    const pauseHtml = renderToStaticMarkup(
      React.createElement(PauseMenu, {
        hud,
        settings: DEFAULT_SETTINGS,
        onResume: () => {},
        onRestartMatch: () => {},
        onLeaveToMenu: () => {},
        onSelectCharacter: () => {},
        onSelectGun: () => {},
        onSelectKnifeCharm: () => {},
        onSelectTacticalEquipment: () => {},
        onUpdateSettings: () => {},
      })
    );
    assert.ok(pauseHtml.includes('Tactical Equipment (Slot 03)'));
    assert.ok(pauseHtml.includes('1/2 CHARGES'));
    assert.ok(pauseHtml.includes('NEXT'));
    assert.ok(pauseHtml.includes('data-tactical-tooltip="flashbang"'));
    assert.ok(pauseHtml.includes(TACTICAL_EQUIPMENT.flashbang.tooltip));
    assert.ok(pauseHtml.includes('6.5m · 10s Dur · 0.5s CD'));

    const deathHtml = renderToStaticMarkup(
      React.createElement(DeathScreen, {
        hud: {
          ...hud,
          isAlive: false,
          respawnTimer: 0,
          match: { ...hud.match, phase: 'playing' },
        },
        onSelectGun: () => {},
        onSelectTacticalEquipment: () => {},
        onRespawn: () => {},
      })
    );
    assert.ok(deathHtml.includes('Slot 03 · M84 Flashbang'));
    assert.ok(deathHtml.includes('Smoke ×2'));
    assert.ok(deathHtml.includes('Frag ×1'));
    assert.ok(deathHtml.includes('data-tactical-tooltip="flashbang"'));
    assert.ok(deathHtml.includes('Radius 9.5m'));
    assert.ok(deathHtml.includes('Duration 3.2s'));
    assert.ok(deathHtml.includes('Cooldown 0.5s'));
  });

  await t.test('GameHUD renders Slot 03 charge counter and flashbang blindness overlay when flashed', () => {
    const hud = {
      ...INITIAL_HUD,
      isAlive: true,
      isPointerLocked: true,
      activeWeapon: WEAPONS.ak47,
      tacticalEquipmentId: 'flashbang' as const,
      queuedTacticalEquipmentId: 'flashbang' as const,
      tacticalCharges: 2,
      tacticalMaxCharges: 2,
      flashBlindIntensity: 0.85,
      match: {
        ...INITIAL_HUD.match,
        phase: 'playing' as const,
      },
    };

    const html = renderToStaticMarkup(
      React.createElement(GameHUD, {
        hud,
        keybindings: DEFAULT_KEYBINDINGS,
      })
    );

    assert.ok(html.includes('data-tactical-slot-hud="flashbang"'));
    assert.ok(html.includes('[X] Flashbang ×2'));
    assert.ok(html.includes('data-flash-blind-overlay="true"'));
  });
});
