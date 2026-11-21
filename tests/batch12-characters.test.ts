import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene } from '@babylonjs/core';
import {
  buildOperatorRig,
  createOperatorPalette,
} from '../src/game/OperatorMeshBuilder.ts';
import {
  applyCharacterSelection,
  getCharacterForWeaponId,
  getSignatureGunForCharacter,
  GUN_LOCKED_WHILE_ALIVE_MESSAGE,
  LoadoutSelectionState,
  normalizeCharacterId,
} from '../src/game/loadoutRules.ts';
import {
  CHARACTER_IDS,
  CHARACTERS,
  CharacterId,
  WEAPONS,
} from '../src/game/types.ts';
import {
  DEFAULT_SETTINGS,
  loadPersistedSettings,
  resetPersistedSettings,
  savePersistedSettings,
  SETTINGS_STORAGE_KEY,
} from '../src/settings/settingsStorage.ts';
import { MatchRoom } from '../server/rooms/MatchRoom.ts';

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

test('Batch 12 (a): 4-Character Roster & Signature Weapon Pairings', async (t) => {
  await t.test('CHARACTER_IDS defines exact 4 distinct archetypes with required signature guns', () => {
    assert.deepStrictEqual(CHARACTER_IDS, ['assault', 'vanguard', 'breacher', 'marksman']);
    assert.strictEqual(CHARACTERS.assault.signatureGunId, 'ak47');
    assert.strictEqual(CHARACTERS.vanguard.signatureGunId, 'smg');
    assert.strictEqual(CHARACTERS.breacher.signatureGunId, 'shotgun');
    assert.strictEqual(CHARACTERS.marksman.signatureGunId, 'sniper');

    const sigGuns = new Set(CHARACTER_IDS.map((id) => CHARACTERS[id].signatureGunId));
    assert.strictEqual(sigGuns.size, 4, 'Each character must map to a unique signature gun');

    for (const id of CHARACTER_IDS) {
      const cfg = CHARACTERS[id];
      assert.ok(cfg.fullName.length > 0);
      assert.ok(cfg.role.length > 0);
      assert.ok(WEAPONS[cfg.signatureGunId]);
      assert.strictEqual(getSignatureGunForCharacter(id), cfg.signatureGunId);
    }

    assert.strictEqual(getCharacterForWeaponId('ak47'), 'assault');
    assert.strictEqual(getCharacterForWeaponId('smg'), 'vanguard');
    assert.strictEqual(getCharacterForWeaponId('shotgun'), 'breacher');
    assert.strictEqual(getCharacterForWeaponId('sniper'), 'marksman');
  });

  await t.test('normalizeCharacterId safely handles unknown values', () => {
    assert.strictEqual(normalizeCharacterId('vanguard'), 'vanguard');
    assert.strictEqual(normalizeCharacterId('unknown_op'), 'assault');
    assert.strictEqual(normalizeCharacterId(undefined, 'marksman'), 'marksman');
  });
});

test('Batch 12 (b): Distinct 3D Sculpted Operator Rigs, Team Clarity & Preserved Hitboxes', async (t) => {
  await t.test('All 4 character archetypes build distinct non-pickable visuals around authoritative hitboxes', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);

    try {
      const expectedMarkers: Record<CharacterId, string[]> = {
        assault: ['op_hairTop_', 'op_scarf_', 'op_boomMic_'],
        vanguard: ['op_ponytailMid_', 'op_capCrown_', 'op_smgPouch_'],
        breacher: ['op_mandible_', 'op_gorget_', 'op_shellLoop_'],
        marksman: ['op_hoodTop_', 'op_coatTail_', 'op_opticGlow_'],
      };

      const bluePalette = createOperatorPalette(scene, 'blue', 'b12_blue');
      const redPalette = createOperatorPalette(scene, 'red', 'b12_red');

      for (const charId of CHARACTER_IDS) {
        const team = charId === 'vanguard' || charId === 'marksman' ? 'red' : 'blue';
        const palette = team === 'blue' ? bluePalette : redPalette;
        const rig = buildOperatorRig(scene, {
          id: `test_${charId}`,
          team,
          palette,
          characterId: charId,
          initialWeaponId: CHARACTERS[charId].signatureGunId,
          buildAllWeapons: true,
          isPickableHitboxes: true,
          hitboxMetadata: { isBot: true, botId: `b_${charId}`, team },
        });

        assert.strictEqual(rig.characterId, charId);
        assert.strictEqual(rig.upperBodyPivot.position.y, 0.8);
        assert.strictEqual(rig.bodyMesh.position.y, 0.36);
        assert.strictEqual(rig.headMesh.position.y, 0.9);
        assert.strictEqual(rig.bodyMesh.isPickable, true);
        assert.strictEqual(rig.headMesh.isPickable, true);
        assert.strictEqual(rig.bodyMesh.metadata?.zone, 'body');
        assert.strictEqual(rig.headMesh.metadata?.zone, 'head');

        const childMeshes = rig.root.getChildMeshes(false);
        const childNames = childMeshes.map((m) => m.name);

        for (const marker of expectedMarkers[charId]) {
          assert.ok(
            childNames.some((n) => n.startsWith(marker)),
            `Character ${charId} must sculpt distinct feature ${marker}`
          );
        }

        // Team IFF clarity bars exist on all archetypes
        assert.ok(childNames.some((n) => n.startsWith('op_iffChest_')));
        assert.ok(childNames.some((n) => n.startsWith('op_iffBack_')));
        assert.ok(childNames.some((n) => n.startsWith('op_beacon_')));

        // All sculpt meshes stay non-pickable so only headMesh & bodyMesh register raycast hits
        for (const m of childMeshes) {
          if (m !== rig.bodyMesh && m !== rig.headMesh && m !== rig.muzzleFlash) {
            assert.strictEqual(m.isPickable, false, `Sculpt mesh ${m.name} must not block hitboxes`);
            assert.strictEqual(m.checkCollisions, false);
          }
        }

        rig.root.dispose();
        rig.bodyMat.dispose();
        rig.headMat.dispose();
      }

      bluePalette.dispose();
      redPalette.dispose();
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});

test('Batch 12 (c): Character Selection Respects Gun Lock Rule & Persists in Storage', async (t) => {
  await t.test('Selecting character pre-spawn/dead pairs signature gun immediately; alive queues for next spawn', () => {
    const start: LoadoutSelectionState = {
      equippedGunId: 'ak47',
      queuedGunId: 'ak47',
      activeSlot: 1,
    };

    // Pre-spawn menu switch -> immediate signature weapon switch
    const menuOutcome = applyCharacterSelection(start, 'vanguard', true, 'menu', true);
    assert.strictEqual(menuOutcome.characterId, 'vanguard');
    assert.strictEqual(menuOutcome.signatureGunId, 'smg');
    assert.strictEqual(menuOutcome.gunOutcome?.switchedImmediately, true);
    assert.strictEqual(menuOutcome.gunOutcome?.loadout.equippedGunId, 'smg');

    // Alive in match -> character chosen, active gun stays locked, signature gun queued for respawn
    const aliveOutcome = applyCharacterSelection(
      menuOutcome.gunOutcome!.loadout,
      'breacher',
      true,
      'playing',
      true
    );
    assert.strictEqual(aliveOutcome.characterId, 'breacher');
    assert.strictEqual(aliveOutcome.signatureGunId, 'shotgun');
    assert.strictEqual(aliveOutcome.gunOutcome?.switchedImmediately, false);
    assert.strictEqual(aliveOutcome.gunOutcome?.queuedForNextSpawn, true);
    assert.strictEqual(aliveOutcome.gunOutcome?.lockMessage, GUN_LOCKED_WHILE_ALIVE_MESSAGE);
    assert.strictEqual(aliveOutcome.gunOutcome?.loadout.equippedGunId, 'smg');
    assert.strictEqual(aliveOutcome.gunOutcome?.loadout.queuedGunId, 'shotgun');

    // Dead in match -> immediate signature switch
    const deadOutcome = applyCharacterSelection(
      aliveOutcome.gunOutcome!.loadout,
      'marksman',
      true,
      'playing',
      false
    );
    assert.strictEqual(deadOutcome.characterId, 'marksman');
    assert.strictEqual(deadOutcome.gunOutcome?.switchedImmediately, true);
    assert.strictEqual(deadOutcome.gunOutcome?.loadout.equippedGunId, 'sniper');
  });

  await t.test('selectedCharacterId persists across save/load/reset and sanitizes corrupted values', () => {
    const previousWindow = (globalThis as any).window;
    const { windowObj, store } = createMemoryWindow();
    (globalThis as any).window = windowObj;

    try {
      const initial = loadPersistedSettings();
      assert.strictEqual(initial.selectedCharacterId, DEFAULT_SETTINGS.selectedCharacterId);

      for (const charId of CHARACTER_IDS) {
        savePersistedSettings({
          ...initial,
          selectedCharacterId: charId,
          selectedGunId: CHARACTERS[charId].signatureGunId,
        });
        const reloaded = loadPersistedSettings();
        assert.strictEqual(reloaded.selectedCharacterId, charId);
      }

      store.set(SETTINGS_STORAGE_KEY, JSON.stringify({ selectedCharacterId: 'invalid_hero' }));
      const sanitized = loadPersistedSettings();
      assert.strictEqual(sanitized.selectedCharacterId, 'assault');

      const reset = resetPersistedSettings();
      assert.strictEqual(reset.selectedCharacterId, DEFAULT_SETTINGS.selectedCharacterId);
    } finally {
      if (previousWindow === undefined) {
        delete (globalThis as any).window;
      } else {
        (globalThis as any).window = previousWindow;
      }
    }
  });
});

test('Batch 12 (d): Colyseus MatchRoom Syncs Character Archetypes & Bot Archetype Variety', () => {
  const room = new MatchRoom();
  room.onCreate({
    mapId: 'urban',
    friendlyFire: false,
    killLimit: 25,
    timeLimit: 300,
    botCount: 4,
  });

  try {
    // Bots spawn with all 4 distinct archetypes matched to their weapons
    const botChars = new Set<string>();
    room.state.players.forEach((p) => {
      if (p.isBot) botChars.add(p.characterId);
    });
    assert.deepStrictEqual(
      botChars,
      new Set(['assault', 'vanguard', 'breacher', 'marksman'])
    );

    const client = createMockClient('player_char_test');
    room.clients.push(client as any);
    room.onJoin(client as any, { playerName: 'Tester', characterId: 'vanguard' });
    const player = room.state.players.get('player_char_test')!;
    assert.strictEqual(player.characterId, 'vanguard');

    // Lobby select_character updates & sanitizes
    (room as any).onMessageEvents.emit('select_character', client, { characterId: 'marksman' });
    assert.strictEqual(player.characterId, 'marksman');

    (room as any).onMessageEvents.emit('select_character', client, { characterId: 'bad_id' });
    assert.strictEqual(player.characterId, 'assault');

    // Playing player_move updates characterId cleanly
    room.state.phase = 'playing';
    (room as any).onMessageEvents.emit('player_move', client, {
      x: 2,
      y: 0,
      z: 3,
      rotY: 0,
      pitch: 0,
      weaponId: 'shotgun',
      characterId: 'breacher',
    });
    assert.strictEqual(player.characterId, 'breacher');
    assert.strictEqual(player.weaponId, 'shotgun');
  } finally {
    clearInterval((room as any)._simulationInterval);
    room.onDispose();
  }
});
