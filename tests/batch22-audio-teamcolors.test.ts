import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AudioEngine } from '../src/game/AudioEngine.ts';
import { WEAPONS } from '../src/game/types.ts';
import { INITIAL_HUD } from '../src/match/matchMachine.ts';
import { computeReticleGeometry, DEFAULT_CROSSHAIR_SETTINGS } from '../src/settings/crosshairConfig.ts';
import {
  DEFAULT_SETTINGS,
  loadPersistedSettings,
  resetPersistedSettings,
  savePersistedSettings,
  SETTINGS_STORAGE_KEY,
  validateSettings,
} from '../src/settings/settingsStorage.ts';
import {
  DEFAULT_TEAM_COLORS,
  hexToRgba,
  normalizeTeamColor,
  resolveSideColors,
  TEAM_COLOR_PRESET_PAIRS,
  TEAM_COLOR_SWATCHES,
  validateTeamColors,
} from '../src/settings/teamColorsConfig.ts';
import { DeathScreen } from '../src/ui/DeathScreen.tsx';
import { GameHUD } from '../src/ui/GameHUD.tsx';
import { ScoreboardOverlay } from '../src/ui/ScoreboardOverlay.tsx';
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

test('Batch 22: AudioEngine master volume, mute, and sfxEnabled toggle compute effective gains', () => {
  const audio = new AudioEngine();
  audio.setVolumes(0.8, 0.5, 0.4, false, true);
  let state = audio.getVolumeState();
  assert.strictEqual(state.masterVolume, 0.8);
  assert.strictEqual(state.sfxVolume, 0.5);
  assert.strictEqual(state.sfxEnabled, true);
  assert.ok(Math.abs(state.effectiveMasterGain - 0.8) < 1e-6);
  assert.ok(Math.abs(state.effectiveSfxGain - 0.4) < 1e-6);
  assert.ok(Math.abs(state.effectiveMusicGain - 0.32) < 1e-6);

  // Toggling SFX off zeroes effective SFX gain while preserving chosen sfxVolume and music
  audio.setVolumes(0.8, 0.5, 0.4, false, false);
  state = audio.getVolumeState();
  assert.strictEqual(state.sfxEnabled, false);
  assert.strictEqual(state.sfxVolume, 0.5);
  assert.strictEqual(state.effectiveSfxGain, 0);
  assert.ok(Math.abs(state.effectiveMusicGain - 0.32) < 1e-6);

  // Master mute zeroes both SFX and music gains
  audio.setVolumes(0.8, 0.5, 0.4, true, true);
  state = audio.getVolumeState();
  assert.strictEqual(state.effectiveMasterGain, 0);
  assert.strictEqual(state.effectiveSfxGain, 0);
  assert.strictEqual(state.effectiveMusicGain, 0);
});

test('Batch 22: sfxEnabled and teamColors persist, migrate legacy storage, and reset cleanly', () => {
  withLocalStorageStub(() => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        callsign: 'LegacyAudioColors',
        volume: 0.7,
        sfxVolume: 0.6,
      })
    );
    const migrated = loadPersistedSettings();
    assert.strictEqual(migrated.sfxEnabled, true);
    assert.deepStrictEqual(migrated.teamColors, DEFAULT_TEAM_COLORS);

    savePersistedSettings({
      ...DEFAULT_SETTINGS,
      volume: 0.45,
      sfxVolume: 0.75,
      sfxEnabled: false,
      teamColors: { ally: '#22C55E', enemy: '#FBBF24' },
    });

    const reloaded = loadPersistedSettings();
    assert.strictEqual(reloaded.volume, 0.45);
    assert.strictEqual(reloaded.sfxVolume, 0.75);
    assert.strictEqual(reloaded.sfxEnabled, false);
    assert.deepStrictEqual(reloaded.teamColors, { ally: '#22c55e', enemy: '#fbbf24' });

    const sanitized = validateSettings({
      sfxEnabled: 'invalid',
      teamColors: { ally: 'not-hex', enemy: '#0F8' },
    });
    assert.strictEqual(sanitized.sfxEnabled, true);
    assert.deepStrictEqual(sanitized.teamColors, {
      ally: DEFAULT_TEAM_COLORS.ally,
      enemy: '#00ff88',
    });

    const reset = resetPersistedSettings();
    assert.strictEqual(reset.sfxEnabled, true);
    assert.deepStrictEqual(reset.teamColors, DEFAULT_TEAM_COLORS);
  });
});

test('Batch 22: teamColorsConfig helpers normalize, convert RGBA, and resolve ally/enemy sides across teams and modes', () => {
  assert.strictEqual(normalizeTeamColor('#0F8', '#38bdf8'), '#00ff88');
  assert.strictEqual(hexToRgba('#22c55e', 0.2), 'rgba(34, 197, 94, 0.2)');

  const validated = validateTeamColors({ ally: '#14B8A6', enemy: '#F97316' });
  assert.deepStrictEqual(validated, { ally: '#14b8a6', enemy: '#f97316' });

  const blueLocal = resolveSideColors(validated, 'blue', 'tdm');
  assert.strictEqual(blueLocal.allyHex, '#14b8a6');
  assert.strictEqual(blueLocal.enemyHex, '#f97316');
  assert.strictEqual(blueLocal.blueHex, '#14b8a6');
  assert.strictEqual(blueLocal.redHex, '#f97316');

  const redLocal = resolveSideColors(validated, 'red', 'bomb');
  assert.strictEqual(redLocal.allyHex, '#14b8a6');
  assert.strictEqual(redLocal.enemyHex, '#f97316');
  assert.strictEqual(redLocal.blueHex, '#f97316');
  assert.strictEqual(redLocal.redHex, '#14b8a6');

  const ffaLocal = resolveSideColors(validated, 'red', 'ffa');
  assert.strictEqual(ffaLocal.allyHex, '#14b8a6');
  assert.strictEqual(ffaLocal.enemyHex, '#f97316');

  const enemyReticle = computeReticleGeometry(
    DEFAULT_CROSSHAIR_SETTINGS.ak47,
    12,
    false,
    true,
    validated.enemy
  );
  assert.strictEqual(enemyReticle.color, '#f97316');
});

test('Batch 22: SettingsPanel renders Audio (Master + SFX toggle/slider) and Team Colors tab controls', () => {
  withLocalStorageStub(() => {
    const customSettings = {
      ...DEFAULT_SETTINGS,
      volume: 0.55,
      sfxVolume: 0.7,
      sfxEnabled: false,
      teamColors: { ally: '#22c55e', enemy: '#e879f9' },
    };

    const audioHtml = renderToStaticMarkup(
      React.createElement(SettingsPanel, {
        settings: customSettings,
        initialTab: 'audio',
        onUpdateSettings: () => {},
        onResetSettings: () => {},
      })
    );
    assert.ok(audioHtml.includes('data-audio-panel="true"'));
    assert.ok(audioHtml.includes('Master Volume'));
    assert.ok(audioHtml.includes('Sound Effects'));
    assert.ok(audioHtml.includes('aria-label="Master Volume"'));
    assert.ok(audioHtml.includes('aria-label="Toggle Sound Effects"'));
    assert.ok(audioHtml.includes('aria-label="Sound Effects Volume"'));
    assert.ok(audioHtml.includes('55%'));
    assert.ok(audioHtml.includes('Sound effects are toggled off'));

    const teamColorsHtml = renderToStaticMarkup(
      React.createElement(SettingsPanel, {
        settings: customSettings,
        initialTab: 'team_colors',
        onUpdateSettings: () => {},
        onResetSettings: () => {},
      })
    );
    assert.ok(teamColorsHtml.includes('data-team-colors-panel="true"'));
    assert.ok(teamColorsHtml.includes('Ally Color'));
    assert.ok(teamColorsHtml.includes('Enemy Color'));
    assert.ok(teamColorsHtml.includes('aria-label="Custom ally color"'));
    assert.ok(teamColorsHtml.includes('aria-label="Custom enemy color"'));
    assert.ok(teamColorsHtml.includes('Swap Colors'));
    assert.ok(teamColorsHtml.includes('Reset Team Colors'));
    assert.ok(teamColorsHtml.includes('#22c55e'));
    assert.ok(teamColorsHtml.includes('#e879f9'));

    const decodedTeamColorsHtml = teamColorsHtml.replace(/&amp;/g, '&');
    for (const preset of TEAM_COLOR_PRESET_PAIRS) {
      assert.ok(decodedTeamColorsHtml.includes(preset.label));
    }
    for (const swatch of TEAM_COLOR_SWATCHES) {
      assert.ok(teamColorsHtml.includes(`Set ally color to ${swatch.label}`));
      assert.ok(teamColorsHtml.includes(`Set enemy color to ${swatch.label}`));
    }
  });
});

test('Batch 22: Custom ally and enemy colors propagate to GameHUD, ScoreboardOverlay, and DeathScreen', () => {
  const teamColors = { ally: '#22c55e', enemy: '#fbbf24' };

  const hudHtml = renderToStaticMarkup(
    React.createElement(GameHUD, {
      hud: {
        ...INITIAL_HUD,
        isPointerLocked: true,
        isAlive: true,
        targetingEnemy: true,
        localTeam: 'blue',
        activeWeapon: WEAPONS.ak47,
        minimap: {
          ...INITIAL_HUD.minimap,
          actors: [
            { id: 'ally_1', kind: 'teammate', x: 5, z: 5, yawRad: 0 },
            { id: 'enemy_1', kind: 'enemy', x: -5, z: -5, yawRad: 1 },
            { id: 'ping_1', kind: 'enemy', pingKind: 'enemy', x: -8, z: -8, yawRad: 0 },
          ],
        },
        pings: [
          {
            id: 'p1',
            kind: 'enemy',
            senderName: 'Alpha',
            distanceMeters: 24,
            remainingSec: 2,
            screenXPct: 50,
            screenYPct: 50,
            onScreen: true,
          },
        ],
        match: {
          ...INITIAL_HUD.match,
          phase: 'playing',
          killFeed: [
            {
              id: 'k1',
              killerName: 'Alpha',
              killerTeam: 'blue',
              victimName: 'Hostile-1',
              victimTeam: 'red',
              weaponName: 'AK-47',
              headshot: true,
              timestamp: Date.now(),
            },
          ],
        },
      },
      teamColors,
    })
  );

  assert.ok(hudHtml.includes('data-ally-color="#22c55e"'));
  assert.ok(hudHtml.includes('data-enemy-color="#fbbf24"'));
  assert.ok(hudHtml.includes('data-reticle-color="#fbbf24"'));
  assert.ok(hudHtml.includes('fill="#22c55e"'));
  assert.ok(hudHtml.includes('fill="#fbbf24"'));

  const scoreboardHtml = renderToStaticMarkup(
    React.createElement(ScoreboardOverlay, {
      match: {
        ...INITIAL_HUD.match,
        mode: 'tdm',
        blueScore: 14,
        redScore: 9,
      },
      teamColors,
      localTeam: 'red',
    })
  );
  // When localTeam is 'red', Blue uses enemy (#fbbf24) and Red uses ally (#22c55e)
  assert.ok(scoreboardHtml.includes('color:#fbbf24'));
  assert.ok(scoreboardHtml.includes('color:#22c55e'));

  const deathHtml = renderToStaticMarkup(
    React.createElement(DeathScreen, {
      hud: {
        ...INITIAL_HUD,
        isAlive: false,
        localTeam: 'blue',
        killerBanner: {
          name: 'Viper-Red',
          team: 'red',
          weaponName: 'AWP Sniper',
          distanceMeters: 42.5,
          headshot: true,
          killerHpRemaining: 65,
        },
      },
      teamColors,
      onSelectGun: () => {},
      onRespawn: () => {},
    })
  );
  assert.ok(deathHtml.includes('Viper-Red'));
  assert.ok(deathHtml.includes('color:#fbbf24'));
  assert.ok(deathHtml.includes('background-color:#fbbf24'));
});
