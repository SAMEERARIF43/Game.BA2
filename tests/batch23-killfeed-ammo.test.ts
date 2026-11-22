import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  getAmmoDisplayState,
  getLowAmmoThreshold,
  isOrdnanceKillName,
  resolveWeaponIdFromName,
} from '../src/game/ammoDisplay.ts';
import { WEAPONS } from '../src/game/types.ts';
import { INITIAL_HUD } from '../src/match/matchMachine.ts';
import { GameHUD } from '../src/ui/GameHUD.tsx';

test('Batch 23: resolveWeaponIdFromName and isOrdnanceKillName resolve all weapons and killstreak ordnance', () => {
  assert.strictEqual(resolveWeaponIdFromName(WEAPONS.shotgun.name), 'shotgun');
  assert.strictEqual(resolveWeaponIdFromName(WEAPONS.ak47.name), 'ak47');
  assert.strictEqual(resolveWeaponIdFromName(WEAPONS.smg.name), 'smg');
  assert.strictEqual(resolveWeaponIdFromName(WEAPONS.sniper.name), 'sniper');
  assert.strictEqual(resolveWeaponIdFromName(WEAPONS.pistol.name), 'pistol');
  assert.strictEqual(resolveWeaponIdFromName(WEAPONS.knife.name), 'knife');
  assert.strictEqual(resolveWeaponIdFromName('AK-47'), 'ak47');
  assert.strictEqual(resolveWeaponIdFromName('AWP Sniper'), 'sniper');
  assert.strictEqual(resolveWeaponIdFromName('Precision Barrage'), null);
  assert.strictEqual(isOrdnanceKillName('Precision Barrage'), true);
  assert.strictEqual(isOrdnanceKillName('Airstrike'), true);
  assert.strictEqual(isOrdnanceKillName(WEAPONS.ak47.name), false);
});

test('Batch 23: getAmmoDisplayState transitions cleanly across normal, low, empty, out, reloading, and melee', () => {
  assert.strictEqual(getLowAmmoThreshold(WEAPONS.sniper.magSize), 2);
  assert.strictEqual(getLowAmmoThreshold(WEAPONS.shotgun.magSize), 2);
  assert.strictEqual(getLowAmmoThreshold(WEAPONS.pistol.magSize), 3);
  assert.strictEqual(getLowAmmoThreshold(WEAPONS.ak47.magSize), 8);
  assert.strictEqual(getLowAmmoThreshold(WEAPONS.smg.magSize), 9);

  const normal = getAmmoDisplayState({
    ammoInMag: 24,
    reserveAmmo: 90,
    magSize: WEAPONS.ak47.magSize,
  });
  assert.strictEqual(normal.level, 'normal');
  assert.strictEqual(normal.magTextColorClass, 'text-white');
  assert.strictEqual(normal.statusLabel, null);

  const low = getAmmoDisplayState({
    ammoInMag: 6,
    reserveAmmo: 60,
    magSize: WEAPONS.ak47.magSize,
  });
  assert.strictEqual(low.level, 'low');
  assert.strictEqual(low.isLow, true);
  assert.strictEqual(low.magTextColorClass, 'text-amber-400');
  assert.strictEqual(low.barColorClass, 'bg-amber-400');
  assert.strictEqual(low.statusLabel, 'LOW AMMO');

  const empty = getAmmoDisplayState({
    ammoInMag: 0,
    reserveAmmo: 30,
    magSize: WEAPONS.ak47.magSize,
    reloadKeyLabel: 'F',
  });
  assert.strictEqual(empty.level, 'empty');
  assert.strictEqual(empty.isEmpty, true);
  assert.strictEqual(empty.isOutOfAmmo, false);
  assert.strictEqual(empty.magTextColorClass, 'text-red-500');
  assert.strictEqual(empty.barColorClass, 'bg-red-500');
  assert.strictEqual(empty.statusLabel, 'EMPTY · [F] RELOAD');

  const out = getAmmoDisplayState({
    ammoInMag: 0,
    reserveAmmo: 0,
    magSize: WEAPONS.ak47.magSize,
  });
  assert.strictEqual(out.level, 'out');
  assert.strictEqual(out.isEmpty, true);
  assert.strictEqual(out.isOutOfAmmo, true);
  assert.strictEqual(out.magTextColorClass, 'text-red-500');
  assert.strictEqual(out.reserveTextColorClass, 'text-red-400/80');
  assert.strictEqual(out.statusLabel, 'NO AMMO');

  const reloading = getAmmoDisplayState({
    ammoInMag: 0,
    reserveAmmo: 30,
    magSize: WEAPONS.ak47.magSize,
    isReloading: true,
  });
  assert.strictEqual(reloading.level, 'reloading');
  assert.strictEqual(reloading.magTextColorClass, 'text-sky-300');
  assert.strictEqual(reloading.statusLabel, 'RELOADING');

  const melee = getAmmoDisplayState({
    ammoInMag: 0,
    reserveAmmo: 0,
    magSize: 0,
    isMelee: true,
  });
  assert.strictEqual(melee.level, 'melee');
  assert.strictEqual(melee.magTextColorClass, 'text-emerald-300');
});

test('Batch 23: GameHUD renders top-right kill feed overlay with weapon icons, killer/victim names, and headshot badge', () => {
  const now = performance.now();
  const html = renderToStaticMarkup(
    React.createElement(GameHUD, {
      hud: {
        ...INITIAL_HUD,
        isPointerLocked: true,
        isAlive: true,
        localTeam: 'blue',
        match: {
          ...INITIAL_HUD.match,
          phase: 'playing',
          mode: 'tdm',
          participants: [
            {
              id: 'player',
              name: 'Striker',
              team: 'blue',
              isPlayer: true,
              kills: 2,
              deaths: 0,
              isAlive: true,
              respawnTimer: 0,
            },
          ],
          killFeed: [
            {
              id: 1,
              killerName: 'Striker',
              killerTeam: 'blue',
              victimName: 'Viper-1',
              victimTeam: 'red',
              weaponName: WEAPONS.sniper.name,
              headshot: true,
              distanceMeters: 41.2,
              timestamp: now - 400,
            },
            {
              id: 2,
              killerName: 'Reaper-2',
              killerTeam: 'red',
              victimName: 'Ghost-2',
              victimTeam: 'blue',
              weaponName: WEAPONS.knife.name,
              headshot: false,
              distanceMeters: 1.8,
              timestamp: now - 900,
            },
            {
              id: 3,
              killerName: 'Striker',
              killerTeam: 'blue',
              victimName: 'Kodiak-3',
              victimTeam: 'red',
              weaponName: 'Precision Barrage',
              headshot: false,
              distanceMeters: 18.0,
              timestamp: now - 1200,
            },
          ],
        },
      },
    })
  );

  assert.ok(html.includes('data-killfeed-overlay="true"'), 'Top-right kill feed overlay should render');
  assert.ok(html.includes('right-4 top-28') && html.includes('md:top-4'), 'Kill feed must anchor in top-right corner');
  assert.ok(html.includes('data-killfeed-killer="Striker"'));
  assert.ok(html.includes('data-killfeed-victim="Viper-1"'));
  assert.ok(html.includes('data-killfeed-killer="Reaper-2"'));
  assert.ok(html.includes('data-killfeed-victim="Ghost-2"'));
  assert.ok(html.includes('data-killfeed-weapon="sniper"'));
  assert.ok(html.includes('data-weapon-art="sniper"'), 'Kill feed must render SVG weapon icon for Sniper');
  assert.ok(html.includes('data-killfeed-weapon="knife"'));
  assert.ok(html.includes('data-weapon-art="knife"'), 'Kill feed must render SVG weapon icon for Knife');
  assert.ok(html.includes('data-killfeed-icon="ordnance"'), 'Ordnance/Airstrike kills must render ordnance SVG icon');
  assert.ok(html.includes('HS'), 'Headshot eliminations must render HS badge');
});

test('Batch 23: GameHUD weapon display updates dynamic ammo counter colors and meter for normal, low, and empty magazines', () => {
  const renderForAmmo = (ammoInMag: number, reserveAmmo: number, weapon = WEAPONS.ak47, isReloading = false) =>
    renderToStaticMarkup(
      React.createElement(GameHUD, {
        hud: {
          ...INITIAL_HUD,
          isAlive: true,
          isReloading,
          reloadProgress: isReloading ? 0.5 : 0,
          activeWeapon: weapon,
          equippedGunId: weapon.id === 'knife' ? 'ak47' : weapon.id,
          weaponSlots: [
            { id: weapon.id, ammoInMag, reserveAmmo },
            { id: 'knife', ammoInMag: 0, reserveAmmo: 0 },
          ],
          match: { ...INITIAL_HUD.match, phase: 'playing' },
        },
      })
    );

  const normalHtml = renderForAmmo(25, 90);
  assert.ok(normalHtml.includes('data-ammo-state="normal"'));
  assert.ok(normalHtml.includes('text-white'));
  assert.ok(!normalHtml.includes('LOW AMMO'));
  assert.ok(!normalHtml.includes('EMPTY'));

  const lowHtml = renderForAmmo(6, 60);
  assert.ok(lowHtml.includes('data-ammo-state="low"'));
  assert.ok(lowHtml.includes('text-amber-400'), 'Low magazine must turn counter amber');
  assert.ok(lowHtml.includes('LOW AMMO'), 'Low magazine must display LOW AMMO status label');
  assert.ok(lowHtml.includes('bg-amber-400'), 'Low magazine bar must turn amber');

  const emptyHtml = renderForAmmo(0, 30);
  assert.ok(emptyHtml.includes('data-ammo-state="empty"'));
  assert.ok(emptyHtml.includes('text-red-500'), 'Empty magazine must turn counter red');
  assert.ok(emptyHtml.includes('EMPTY · [R] RELOAD'), 'Empty magazine with reserve must prompt reload');
  assert.ok(emptyHtml.includes('bg-red-500'), 'Empty magazine meter must turn red');

  const outHtml = renderForAmmo(0, 0);
  assert.ok(outHtml.includes('data-ammo-state="out"'));
  assert.ok(outHtml.includes('NO AMMO'), 'Zero mag and zero reserve must show NO AMMO');

  // Verify segmented shell/round pips render for smaller magazines (e.g., 6-round sniper)
  const sniperLowHtml = renderForAmmo(2, 18, WEAPONS.sniper);
  assert.ok(sniperLowHtml.includes('data-ammo-state="low"'));
  assert.ok(sniperLowHtml.includes('grid-template-columns:repeat(6, minmax(0, 1fr))'));
});
