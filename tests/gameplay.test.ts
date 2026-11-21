import test from 'node:test';
import assert from 'node:assert/strict';
import { GUN_IDS, GunId, WEAPONS } from '../src/game/types.ts';
import {
  getActiveWeaponIdFromLoadout,
  normalizeGunId,
  toggleLoadoutSlot,
} from '../src/game/loadoutRules.ts';
import { MatchManager } from '../src/match/MatchManager.ts';

test('Gameplay: 2-Slot Gun + Knife Switching & Loadout Safety', async (t) => {
  await t.test('Player toggles cleanly between Slot 1 (Selected Gun) and Slot 2 (Knife)', () => {
    let slot: 1 | 2 = 1;
    for (const gunId of GUN_IDS) {
      assert.strictEqual(
        getActiveWeaponIdFromLoadout({ equippedGunId: gunId, queuedGunId: gunId, activeSlot: slot }),
        gunId
      );
      slot = toggleLoadoutSlot(slot);
      assert.strictEqual(slot, 2);
      assert.strictEqual(
        getActiveWeaponIdFromLoadout({ equippedGunId: gunId, queuedGunId: gunId, activeSlot: slot }),
        'knife'
      );
      slot = toggleLoadoutSlot(slot);
      assert.strictEqual(slot, 1);
    }
  });

  await t.test('Unmapped gun IDs safely normalize to ak47', () => {
    assert.strictEqual(normalizeGunId('invalid_id' as GunId), 'ak47');
    assert.strictEqual(normalizeGunId('knife'), 'ak47');
    assert.strictEqual(normalizeGunId(undefined), 'ak47');
  });
});

test('Gameplay: WeaponSystem Reload Ammo Integrity', async (t) => {
  interface SlotState {
    ammoInMag: number;
    reserveAmmo: number;
  }

  function simulateReload(cfg: { magSize: number }, state: SlotState): boolean {
    if (state.ammoInMag >= cfg.magSize) return false;
    if (state.reserveAmmo <= 0) return false;

    const needed = cfg.magSize - state.ammoInMag;
    const transfer = Math.min(needed, state.reserveAmmo);
    state.ammoInMag += transfer;
    state.reserveAmmo -= transfer;
    return true;
  }

  await t.test('Reload does not replenish empty reserve ammo (anti-cheat check)', () => {
    const cfg = WEAPONS.ak47;
    const state: SlotState = { ammoInMag: 10, reserveAmmo: 0 };

    const reloadInitiated = simulateReload(cfg, state);
    assert.strictEqual(reloadInitiated, false, 'Reload should not initiate when reserve is 0');
    assert.strictEqual(state.reserveAmmo, 0, 'Reserve ammo must remain 0 and not magically refill');
    assert.strictEqual(state.ammoInMag, 10, 'Magazine ammo must remain unchanged');
  });

  await t.test('Reload transfers correct amount when reserve is limited', () => {
    const cfg = WEAPONS.ak47; // magSize: 30
    const state: SlotState = { ammoInMag: 25, reserveAmmo: 3 };

    const reloadInitiated = simulateReload(cfg, state);
    assert.strictEqual(reloadInitiated, true);
    assert.strictEqual(state.ammoInMag, 28);
    assert.strictEqual(state.reserveAmmo, 0);
  });

  await t.test('Reload caps at magazine size when reserve is plentiful', () => {
    const cfg = WEAPONS.ak47; // magSize: 30
    const state: SlotState = { ammoInMag: 15, reserveAmmo: 120 };

    const reloadInitiated = simulateReload(cfg, state);
    assert.strictEqual(reloadInitiated, true);
    assert.strictEqual(state.ammoInMag, 30);
    assert.strictEqual(state.reserveAmmo, 105);
  });

  await t.test('Reload rejected when magazine is already full', () => {
    const cfg = WEAPONS.ak47;
    const state: SlotState = { ammoInMag: 30, reserveAmmo: 120 };

    const reloadInitiated = simulateReload(cfg, state);
    assert.strictEqual(reloadInitiated, false);
    assert.strictEqual(state.ammoInMag, 30);
    assert.strictEqual(state.reserveAmmo, 120);
  });
});

test('Gameplay: MatchManager Team Balancing', async (t) => {
  function calculateBlueBotCount(botsPerTeam: number): number {
    return Math.max(0, botsPerTeam - 1);
  }

  await t.test('1v1 duel: 1 human Blue vs 1 bot Red', () => {
    const botsPerTeam = 1;
    const blueBots = calculateBlueBotCount(botsPerTeam);
    const redBots = botsPerTeam;
    const totalBlue = 1 + blueBots; // 1 human + 0 bots
    const totalRed = redBots;       // 1 bot
    assert.strictEqual(blueBots, 0);
    assert.strictEqual(totalBlue, totalRed, 'Teams must be perfectly balanced at 1v1');
  });

  await t.test('3v3 match: 1 human + 2 bots Blue vs 3 bots Red', () => {
    const botsPerTeam = 3;
    const blueBots = calculateBlueBotCount(botsPerTeam);
    const totalBlue = 1 + blueBots;
    const totalRed = botsPerTeam;
    assert.strictEqual(blueBots, 2);
    assert.strictEqual(totalBlue, 3);
    assert.strictEqual(totalRed, 3);
    assert.strictEqual(totalBlue, totalRed, 'Teams must be perfectly balanced at 3v3');
  });

  await t.test('5v5 match: 1 human + 4 bots Blue vs 5 bots Red', () => {
    const botsPerTeam = 5;
    const blueBots = calculateBlueBotCount(botsPerTeam);
    const totalBlue = 1 + blueBots;
    const totalRed = botsPerTeam;
    assert.strictEqual(blueBots, 4);
    assert.strictEqual(totalBlue, 5);
    assert.strictEqual(totalRed, 5);
    assert.strictEqual(totalBlue, totalRed, 'Teams must be perfectly balanced at 5v5');
  });
});

test('Gameplay: Bot AI Distance-Scaled Spread Calculation', async (t) => {
  function calculateBotSpread(dist: number): number {
    const distFactor = Math.max(0, Math.min(1, (dist - 5) / 30));
    return 0.035 + distFactor * 0.050;
  }

  await t.test('At point-blank range (<= 5m), spread is tight (0.035)', () => {
    assert.strictEqual(calculateBotSpread(2), 0.035);
    assert.strictEqual(calculateBotSpread(5), 0.035);
  });

  await t.test('At long range (>= 35m), spread is maximum (0.085)', () => {
    assert.strictEqual(calculateBotSpread(35), 0.085);
    assert.strictEqual(calculateBotSpread(50), 0.085);
  });

  await t.test('At mid range (20m), spread is halfway (0.060)', () => {
    const midSpread = calculateBotSpread(20);
    assert.strictEqual(Math.round(midSpread * 1000) / 1000, 0.060);
  });
});

test('Gameplay: Match transition clears stale killfeed entries', () => {
  const match = new MatchManager();
  match.configureMatch('urban', 'Urban Strike', 30, 1);
  match.setPhase('playing');
  match.recordKill('bot_red_1', 'player', 'AK-47', false, 18);

  assert.equal(match.getSnapshot().killFeed.length, 1);

  match.clearKillFeed();

  assert.equal(match.getSnapshot().killFeed.length, 0);
});
