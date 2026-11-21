import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GUN_IDS,
  KNIFE_CHARM_IDS,
  KNIFE_CHARMS,
  WEAPON_IDS,
  WEAPONS,
} from '../src/game/types.ts';
import {
  applyGunSelection,
  canSwitchGunImmediately,
  getActiveWeaponIdFromLoadout,
  GUN_LOCKED_WHILE_ALIVE_MESSAGE,
  LoadoutSelectionState,
  resolveRespawnLoadout,
  toggleLoadoutSlot,
} from '../src/game/loadoutRules.ts';
import {
  DEFAULT_SETTINGS,
  loadPersistedSettings,
  resetPersistedSettings,
  savePersistedSettings,
  SETTINGS_STORAGE_KEY,
} from '../src/settings/settingsStorage.ts';
import { MatchRoom } from '../server/rooms/MatchRoom.ts';
import { PlayerSchema } from '../server/schema/MatchState.ts';

function createMockClient(sessionId: string) {
  const sentMessages: Array<{ type: string; data: any }> = [];
  return {
    sessionId,
    sentMessages,
    send(type: string, data: any) {
      sentMessages.push({ type, data });
    },
    enqueueRaw() {},
    raw() {},
  };
}

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

test('Batch 10 (a): 5-Gun Roster + Always-Available Knife Loadout', async (t) => {
  await t.test('GUN_IDS defines exact 5 distinct guns all assigned to Slot 1', () => {
    assert.deepStrictEqual(GUN_IDS, ['shotgun', 'ak47', 'smg', 'sniper', 'pistol']);
    assert.strictEqual(GUN_IDS.length, 5);
    for (const gunId of GUN_IDS) {
      const cfg = WEAPONS[gunId];
      assert.ok(cfg, `Missing config for ${gunId}`);
      assert.strictEqual(cfg.slot, 1, `Gun ${gunId} must occupy slot 1`);
      assert.strictEqual(Boolean(cfg.isMelee), false, `Gun ${gunId} must not be melee`);
    }
  });

  await t.test('WEAPON_IDS includes the 5 guns plus always-available K-Bar Knife in Slot 2', () => {
    assert.deepStrictEqual(WEAPON_IDS, ['shotgun', 'ak47', 'smg', 'sniper', 'pistol', 'knife']);
    const knife = WEAPONS.knife;
    assert.strictEqual(knife.slot, 2);
    assert.strictEqual(knife.isMelee, true);
    assert.strictEqual(knife.suppressed, true);
    assert.strictEqual(knife.magSize, 0);
    assert.ok(knife.moveSpeedMultiplier && knife.moveSpeedMultiplier > 1.0);
  });

  await t.test('Every gun pairs with Knife and toggles seamlessly between Slot 1 and Slot 2', () => {
    for (const gunId of GUN_IDS) {
      const loadout: LoadoutSelectionState = {
        equippedGunId: gunId,
        queuedGunId: gunId,
        activeSlot: 1,
      };
      assert.strictEqual(getActiveWeaponIdFromLoadout(loadout), gunId);

      const toggledToKnife: LoadoutSelectionState = {
        ...loadout,
        activeSlot: toggleLoadoutSlot(loadout.activeSlot),
      };
      assert.strictEqual(toggledToKnife.activeSlot, 2);
      assert.strictEqual(getActiveWeaponIdFromLoadout(toggledToKnife), 'knife');

      const toggledBackToGun: LoadoutSelectionState = {
        ...toggledToKnife,
        activeSlot: toggleLoadoutSlot(toggledToKnife.activeSlot),
      };
      assert.strictEqual(toggledBackToGun.activeSlot, 1);
      assert.strictEqual(getActiveWeaponIdFromLoadout(toggledBackToGun), gunId);
    }
  });
});

test('Batch 10 (b): Knife Charm Selection & Settings Storage Persistence', async (t) => {
  await t.test('All 5 Knife Charm finishes have valid PBR material metadata', () => {
    assert.strictEqual(KNIFE_CHARM_IDS.length, 5);
    for (const charmId of KNIFE_CHARM_IDS) {
      const charm = KNIFE_CHARMS[charmId];
      assert.ok(charm, `Missing charm metadata for ${charmId}`);
      assert.strictEqual(charm.id, charmId);
      assert.ok(charm.name.length > 0);
      assert.ok(charm.finish.length > 0);
      assert.match(charm.accentHex, /^#[0-9a-fA-F]{6}$/);
      assert.ok(charm.metallic >= 0 && charm.metallic <= 1);
      assert.ok(charm.roughness >= 0 && charm.roughness <= 1);
    }
  });

  await t.test('selectedGunId and knifeCharmId persist cleanly across save/load/reset', () => {
    const previousWindow = (globalThis as any).window;
    const { windowObj, store } = createMemoryWindow();
    (globalThis as any).window = windowObj;

    try {
      const initial = loadPersistedSettings();
      assert.strictEqual(initial.selectedGunId, DEFAULT_SETTINGS.selectedGunId);
      assert.strictEqual(initial.knifeCharmId, DEFAULT_SETTINGS.knifeCharmId);

      for (const charmId of KNIFE_CHARM_IDS) {
        const next = {
          ...initial,
          selectedGunId: 'sniper' as const,
          knifeCharmId: charmId,
        };
        savePersistedSettings(next);
        const reloaded = loadPersistedSettings();
        assert.strictEqual(reloaded.selectedGunId, 'sniper');
        assert.strictEqual(reloaded.knifeCharmId, charmId);
      }

      // Corrupted values fall back safely to defaults
      store.set(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ selectedGunId: 'plasma_cannon', knifeCharmId: 'broken_charm' })
      );
      const sanitized = loadPersistedSettings();
      assert.strictEqual(sanitized.selectedGunId, 'ak47');
      assert.strictEqual(sanitized.knifeCharmId, 'tactical_tag');

      // Reset restores defaults
      const reset = resetPersistedSettings();
      assert.strictEqual(reset.selectedGunId, DEFAULT_SETTINGS.selectedGunId);
      assert.strictEqual(reset.knifeCharmId, DEFAULT_SETTINGS.knifeCharmId);
    } finally {
      if (previousWindow === undefined) {
        delete (globalThis as any).window;
      } else {
        (globalThis as any).window = previousWindow;
      }
    }
  });
});

test('Batch 10 (c): Alive vs. Dead / Pre-Spawn Gun Lock Behavior', async (t) => {
  await t.test('canSwitchGunImmediately permits Main Menu / Dead, locks when Alive in Match', () => {
    assert.strictEqual(canSwitchGunImmediately('menu', true), true);
    assert.strictEqual(canSwitchGunImmediately('menu', false), true);
    assert.strictEqual(canSwitchGunImmediately('playing', false), true);
    assert.strictEqual(canSwitchGunImmediately('paused', false), true);
    assert.strictEqual(canSwitchGunImmediately('ended', false), true);

    assert.strictEqual(canSwitchGunImmediately('playing', true), false);
    assert.strictEqual(canSwitchGunImmediately('paused', true), false);
  });

  await t.test('Pre-spawn (menu) selection immediately equips gun without lock message', () => {
    const start: LoadoutSelectionState = {
      equippedGunId: 'ak47',
      queuedGunId: 'ak47',
      activeSlot: 1,
    };

    const outcome = applyGunSelection(start, 'shotgun', 'menu', true);
    assert.strictEqual(outcome.switchedImmediately, true);
    assert.strictEqual(outcome.queuedForNextSpawn, false);
    assert.strictEqual(outcome.lockMessage, null);
    assert.strictEqual(outcome.loadout.equippedGunId, 'shotgun');
    assert.strictEqual(outcome.loadout.queuedGunId, 'shotgun');
  });

  await t.test('Alive selection locks active gun, queues next gun, and returns exact lock banner copy', () => {
    const start: LoadoutSelectionState = {
      equippedGunId: 'ak47',
      queuedGunId: 'ak47',
      activeSlot: 2, // holding knife while alive
    };

    const outcome = applyGunSelection(start, 'sniper', 'playing', true);
    assert.strictEqual(outcome.switchedImmediately, false);
    assert.strictEqual(outcome.queuedForNextSpawn, true);
    assert.strictEqual(
      outcome.lockMessage,
      'Gun locked while alive — select next gun on death or before spawn'
    );
    assert.strictEqual(outcome.lockMessage, GUN_LOCKED_WHILE_ALIVE_MESSAGE);
    assert.strictEqual(outcome.loadout.equippedGunId, 'ak47', 'Active gun must remain unchanged while alive');
    assert.strictEqual(outcome.loadout.queuedGunId, 'sniper', 'Next-spawn gun must be queued');
    assert.strictEqual(outcome.loadout.activeSlot, 2, 'Active knife slot must remain undisturbed');

    // Same lock applies from Pause menu while alive
    const pausedOutcome = applyGunSelection(outcome.loadout, 'smg', 'paused', true);
    assert.strictEqual(pausedOutcome.switchedImmediately, false);
    assert.strictEqual(pausedOutcome.loadout.equippedGunId, 'ak47');
    assert.strictEqual(pausedOutcome.loadout.queuedGunId, 'smg');
  });

  await t.test('Dead selection switches immediately and respawn applies queued gun cleanly', () => {
    const aliveQueued: LoadoutSelectionState = {
      equippedGunId: 'ak47',
      queuedGunId: 'pistol',
      activeSlot: 2,
    };

    // Player dies -> switching while dead updates immediately
    const deadOutcome = applyGunSelection(aliveQueued, 'smg', 'playing', false);
    assert.strictEqual(deadOutcome.switchedImmediately, true);
    assert.strictEqual(deadOutcome.lockMessage, null);
    assert.strictEqual(deadOutcome.loadout.equippedGunId, 'smg');
    assert.strictEqual(deadOutcome.loadout.queuedGunId, 'smg');

    // Or if player queued 'sniper' while alive and then dies -> respawning equips 'sniper' & resets to Slot 1
    const respawned = resolveRespawnLoadout({
      equippedGunId: 'ak47',
      queuedGunId: 'sniper',
      activeSlot: 2,
    });
    assert.strictEqual(respawned.equippedGunId, 'sniper');
    assert.strictEqual(respawned.queuedGunId, 'sniper');
    assert.strictEqual(respawned.activeSlot, 1);
  });
});

test('Batch 10 (d): MatchRoom Shotgun Multi-Pellet & Knife Authoritative Combat', async (t) => {
  function setupRoom() {
    const room = new MatchRoom();
    room.onCreate({
      mapId: 'urban',
      friendlyFire: false,
      killLimit: 25,
      timeLimit: 300,
      botCount: 0,
    });
    room.state.phase = 'playing';

    const addPlayer = (id: string, team: 'blue' | 'red', x: number, z: number, weaponId: string) => {
      const p = new PlayerSchema();
      p.id = id;
      p.name = `Player_${id}`;
      p.team = team;
      p.isBot = false;
      p.isHost = false;
      p.isAlive = true;
      p.health = 100;
      p.kills = 0;
      p.deaths = 0;
      p.x = x;
      p.y = 0;
      p.z = z;
      p.rotY = 0;
      p.pitch = 0;
      p.weaponId = weaponId;
      room.state.players.set(id, p);
      return p;
    };

    const cleanup = () => {
      clearInterval((room as any)._simulationInterval);
      room.onDispose();
    };

    return { room, addPlayer, cleanup };
  }

  await t.test('Shotgun pellets array applies cumulative authoritative damage within 8-pellet cap', () => {
    const { room, addPlayer, cleanup } = setupRoom();
    const shooterClient = createMockClient('p_shotgun');
    const targetClient = createMockClient('p_victim');
    room.clients.push(shooterClient as any, targetClient as any);

    addPlayer('p_shotgun', 'blue', 8, 0, 'shotgun');
    const target = addPlayer('p_victim', 'red', 8, 10, 'ak47');

    // 4 body pellets hitting target (4 * 16 = 64 damage)
    (room as any).onMessageEvents.emit('player_fire', shooterClient, {
      weaponId: 'shotgun',
      pellets: [
        { targetId: target.id, zone: 'body', endX: target.x, endY: 1.2, endZ: target.z },
        { targetId: target.id, zone: 'body', endX: target.x + 0.05, endY: 1.15, endZ: target.z },
        { targetId: target.id, zone: 'body', endX: target.x - 0.05, endY: 1.25, endZ: target.z },
        { targetId: target.id, zone: 'body', endX: target.x, endY: 1.1, endZ: target.z },
      ],
    });

    assert.strictEqual(target.health, 36, 'Target health should be 100 - (4 * 16) = 36');
    const hitConfirms = shooterClient.sentMessages.filter((m) => m.type === 'hit_confirm');
    assert.strictEqual(hitConfirms.length, 4);
    const totalConfirmedDamage = hitConfirms.reduce(
      (sum, msg) => sum + Number(msg.data?.damage ?? 0),
      0
    );
    assert.strictEqual(totalConfirmedDamage, 64);

    cleanup();
  });

  await t.test('Knife melee hit applies 75 body damage at 2m and rejects 12m out-of-range', () => {
    const { room, addPlayer, cleanup } = setupRoom();
    const shooterClient = createMockClient('p_knife');
    const closeClient = createMockClient('p_close');
    room.clients.push(shooterClient as any, closeClient as any);

    addPlayer('p_knife', 'blue', 8, 0, 'knife');
    const closeTarget = addPlayer('p_close', 'red', 8, 2, 'ak47');
    const farTarget = addPlayer('p_far', 'red', 8, 12, 'ak47');

    // Valid melee range (2m <= 2.8m + 6m)
    (room as any).onMessageEvents.emit('player_fire', shooterClient, {
      weaponId: 'knife',
      targetId: closeTarget.id,
      zone: 'body',
      endX: closeTarget.x,
      endY: 1.25,
      endZ: closeTarget.z,
    });
    assert.strictEqual(closeTarget.health, 25, 'Knife body hit must deal 75 damage (100 - 75 = 25)');

    // Clear fire cooldown & try out-of-range melee at 12m (> 2.8m + 6m = 8.8m)
    (room as any).lastShotAt.delete('p_knife');
    (room as any).onMessageEvents.emit('player_fire', shooterClient, {
      weaponId: 'knife',
      targetId: farTarget.id,
      zone: 'body',
      endX: farTarget.x,
      endY: 1.25,
      endZ: farTarget.z,
    });
    assert.strictEqual(farTarget.health, 100, 'Knife hit beyond 8.8m range must deal 0 damage');

    cleanup();
  });
});
