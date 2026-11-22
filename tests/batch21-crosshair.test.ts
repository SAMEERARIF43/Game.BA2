import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WEAPON_IDS, WEAPONS } from '../src/game/types.ts';
import { INITIAL_HUD } from '../src/match/matchMachine.ts';
import {
  cloneCrosshairSettings,
  computeReticleGeometry,
  CROSSHAIR_COLOR_PRESETS,
  CROSSHAIR_GAP_MAX,
  CROSSHAIR_GAP_MIN,
  CROSSHAIR_SIZE_MAX,
  CROSSHAIR_SIZE_MIN,
  DEFAULT_CROSSHAIR_SETTINGS,
  getCrosshairConfigForWeapon,
  normalizeCrosshairColor,
  validateCrosshairConfig,
  validateCrosshairSettingsMap,
} from '../src/settings/crosshairConfig.ts';
import {
  DEFAULT_SETTINGS,
  loadPersistedSettings,
  resetPersistedSettings,
  savePersistedSettings,
  SETTINGS_STORAGE_KEY,
  validateSettings,
} from '../src/settings/settingsStorage.ts';
import { GameHUD } from '../src/ui/GameHUD.tsx';
import { SettingsPanel } from '../src/ui/SettingsPanel.tsx';

function withLocalStorageStub<T>(fn: () => T): T {
  const g = globalThis as Record<string, unknown>;
  const prevWindow = g.window;
  const prevDocument = g.document;
  const store = new Map<string, string>();
  const noop = () => {};

  g.window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
    addEventListener: noop,
    removeEventListener: noop,
  };
  g.document = {
    addEventListener: noop,
    removeEventListener: noop,
    fullscreenElement: null,
    documentElement: {},
  };

  try {
    return fn();
  } finally {
    if (prevWindow === undefined) delete g.window;
    else g.window = prevWindow;
    if (prevDocument === undefined) delete g.document;
    else g.document = prevDocument;
  }
}

test('Batch 21: Crosshair config validation, clamping, color normalization, and weapon defaults', () => {
  for (const weaponId of WEAPON_IDS) {
    const def = DEFAULT_CROSSHAIR_SETTINGS[weaponId];
    assert.ok(def, `Missing default crosshair profile for ${weaponId}`);
    assert.ok(def.size >= CROSSHAIR_SIZE_MIN && def.size <= CROSSHAIR_SIZE_MAX);
    assert.ok(def.gap >= CROSSHAIR_GAP_MIN && def.gap <= CROSSHAIR_GAP_MAX);
    assert.match(def.color, /^#[0-9a-f]{6}$/);
    assert.ok(def.style === 'dynamic' || def.style === 'static');
  }

  assert.strictEqual(normalizeCrosshairColor('#0F8', '#ffffff'), '#00ff88');
  assert.strictEqual(normalizeCrosshairColor('  #38BDF8 ', '#ffffff'), '#38bdf8');
  assert.strictEqual(normalizeCrosshairColor('not-a-hex', '#22c55e'), '#22c55e');

  const clamped = validateCrosshairConfig({
    size: 99,
    gap: -15,
    color: '#AbCdEf',
    style: 'invalid_style',
  });
  assert.strictEqual(clamped.size, CROSSHAIR_SIZE_MAX);
  assert.strictEqual(clamped.gap, CROSSHAIR_GAP_MIN);
  assert.strictEqual(clamped.color, '#abcdef');
  assert.strictEqual(clamped.style, DEFAULT_CROSSHAIR_SETTINGS.ak47.style);

  const map = validateCrosshairSettingsMap({
    sniper: { size: 16, gap: 4, color: '#e879f9', style: 'dynamic' },
  });
  assert.strictEqual(map.sniper.size, 16);
  assert.strictEqual(map.sniper.gap, 4);
  assert.strictEqual(map.sniper.color, '#e879f9');
  assert.strictEqual(map.sniper.style, 'dynamic');
  // Unspecified weapons retain defaults independently
  assert.deepStrictEqual(map.ak47, DEFAULT_CROSSHAIR_SETTINGS.ak47);
  assert.deepStrictEqual(map.shotgun, DEFAULT_CROSSHAIR_SETTINGS.shotgun);
});

test('Batch 21: Crosshair settings persist, migrate legacy storage, and reset per weapon independently', () => {
  withLocalStorageStub(() => {
    // Legacy storage entry without crosshair key migrates smoothly
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        callsign: 'LegacyCrosshair',
        fovDeg: 90,
      })
    );
    const migrated = loadPersistedSettings();
    assert.strictEqual(migrated.callsign, 'LegacyCrosshair');
    assert.deepStrictEqual(migrated.crosshair, DEFAULT_CROSSHAIR_SETTINGS);

    // Customizing ak47 and shotgun persists without mutating other weapons or defaults
    const customCrosshair = cloneCrosshairSettings(DEFAULT_CROSSHAIR_SETTINGS);
    customCrosshair.ak47 = { size: 14, color: '#38bdf8', gap: 5, style: 'static' };
    customCrosshair.shotgun = { size: 18, color: '#fbbf24', gap: 20, style: 'dynamic' };

    savePersistedSettings({
      ...DEFAULT_SETTINGS,
      crosshair: customCrosshair,
    });

    const reloaded = loadPersistedSettings();
    assert.deepStrictEqual(reloaded.crosshair?.ak47, {
      size: 14,
      color: '#38bdf8',
      gap: 5,
      style: 'static',
    });
    assert.deepStrictEqual(reloaded.crosshair?.shotgun, {
      size: 18,
      color: '#fbbf24',
      gap: 20,
      style: 'dynamic',
    });
    assert.deepStrictEqual(reloaded.crosshair?.pistol, DEFAULT_CROSSHAIR_SETTINGS.pistol);

    // Reset restores defaults cleanly
    const reset = resetPersistedSettings();
    assert.deepStrictEqual(reset.crosshair, DEFAULT_CROSSHAIR_SETTINGS);

    // Invalid partial structure in validateSettings recovers gracefully
    const sanitized = validateSettings({ crosshair: { ak47: { size: 'bad', gap: 200 } } });
    assert.strictEqual(sanitized.crosshair?.ak47.size, DEFAULT_CROSSHAIR_SETTINGS.ak47.size);
    assert.strictEqual(sanitized.crosshair?.ak47.gap, CROSSHAIR_GAP_MAX);
  });
});

test('Batch 21: computeReticleGeometry differentiates dynamic bloom vs static lock and target color', () => {
  const staticCfg = { size: 11, color: '#22c55e', gap: 6, style: 'static' as const };
  const staticRest = computeReticleGeometry(staticCfg, 14, false, false);
  const staticFiring = computeReticleGeometry(staticCfg, 36, false, false);
  assert.strictEqual(staticRest.gap, 6);
  assert.strictEqual(staticFiring.gap, 6, 'Static crosshair gap must stay fixed under spread');
  assert.strictEqual(staticRest.tickLen, 11);
  assert.strictEqual(staticRest.color, '#22c55e');

  const dynamicCfg = { size: 11, color: '#38bdf8', gap: 6, style: 'dynamic' as const };
  const dynRest = computeReticleGeometry(dynamicCfg, 14, false, false);
  const dynFiring = computeReticleGeometry(dynamicCfg, 36, false, false);
  assert.strictEqual(dynRest.gap, 6);
  assert.ok(dynFiring.gap > dynRest.gap, 'Dynamic crosshair gap must expand under spread');
  assert.strictEqual(dynRest.color, '#38bdf8');

  const onTarget = computeReticleGeometry(dynamicCfg, 14, false, true);
  assert.strictEqual(onTarget.color, '#ef4444');
});

test('Batch 21: SettingsPanel crosshair tab and GameHUD reticle render per-weapon customization', () => {
  withLocalStorageStub(() => {
    const customMap = cloneCrosshairSettings(DEFAULT_CROSSHAIR_SETTINGS);
    customMap.ak47 = { size: 15, color: '#22c55e', gap: 11, style: 'static' };
    customMap.smg = { size: 6, color: '#e879f9', gap: 4, style: 'dynamic' };

    const settingsHtml = renderToStaticMarkup(
      React.createElement(SettingsPanel, {
        settings: {
          ...DEFAULT_SETTINGS,
          selectedGunId: 'ak47',
          crosshair: customMap,
        },
        initialTab: 'crosshair',
        onUpdateSettings: () => {},
        onResetSettings: () => {},
      })
    );

    assert.ok(settingsHtml.includes('Weapon Type Profile'));
    assert.ok(settingsHtml.includes('Crosshair Style'));
    assert.ok(settingsHtml.includes('Crosshair Color'));
    assert.ok(settingsHtml.includes('Crosshair Size'));
    assert.ok(settingsHtml.includes('Center Gap'));
    assert.ok(settingsHtml.includes('Apply to All Weapons'));
    assert.ok(settingsHtml.includes('Moving / Firing'));
    assert.ok(settingsHtml.includes('data-crosshair-preview="ak47"'));
    assert.ok(settingsHtml.includes('data-crosshair-style="static"'));
    assert.ok(settingsHtml.includes('data-crosshair-size="15"'));
    assert.ok(settingsHtml.includes('data-crosshair-gap="11"'));
    assert.ok(settingsHtml.includes('data-crosshair-color="#22c55e"'));

    for (const weaponId of WEAPON_IDS) {
      assert.ok(
        settingsHtml.includes(WEAPONS[weaponId].shortName),
        `Crosshair menu must allow selecting ${weaponId}`
      );
    }
    for (const preset of CROSSHAIR_COLOR_PRESETS) {
      assert.ok(
        settingsHtml.includes(`Set crosshair color to ${preset.label}`),
        `Crosshair menu must include ${preset.label} swatch`
      );
    }

    // Live GameHUD reflects active weapon's customized static crosshair
    const akHudHtml = renderToStaticMarkup(
      React.createElement(GameHUD, {
        hud: {
          ...INITIAL_HUD,
          isPointerLocked: true,
          isAlive: true,
          isAds: false,
          showScoreboard: false,
          crosshairSpreadPx: 32,
          activeWeapon: WEAPONS.ak47,
          match: { ...INITIAL_HUD.match, phase: 'playing' },
        },
        crosshairSettings: customMap,
      })
    );
    assert.ok(akHudHtml.includes('data-hud-reticle="ak47"'));
    assert.ok(akHudHtml.includes('data-reticle-style="static"'));
    assert.ok(akHudHtml.includes('data-reticle-gap="11"'));
    assert.ok(akHudHtml.includes('data-reticle-size="15"'));
    assert.ok(akHudHtml.includes('data-reticle-color="#22c55e"'));

    // Switching active weapon to SMG reflects SMG's dynamic profile independently
    const smgCfg = getCrosshairConfigForWeapon(customMap, 'smg');
    const expectedSmg = computeReticleGeometry(smgCfg, 32, false, false);
    const smgHudHtml = renderToStaticMarkup(
      React.createElement(GameHUD, {
        hud: {
          ...INITIAL_HUD,
          isPointerLocked: true,
          isAlive: true,
          isAds: false,
          showScoreboard: false,
          crosshairSpreadPx: 32,
          activeWeapon: WEAPONS.smg,
          match: { ...INITIAL_HUD.match, phase: 'playing' },
        },
        crosshairSettings: customMap,
      })
    );
    assert.ok(smgHudHtml.includes('data-hud-reticle="smg"'));
    assert.ok(smgHudHtml.includes('data-reticle-style="dynamic"'));
    assert.ok(smgHudHtml.includes(`data-reticle-gap="${expectedSmg.gap}"`));
    assert.ok(smgHudHtml.includes('data-reticle-size="6"'));
    assert.ok(smgHudHtml.includes('data-reticle-color="#e879f9"'));
  });
});
