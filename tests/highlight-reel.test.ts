import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  HIGHLIGHT_DURATION_SEC,
  HIGHLIGHT_TIME_SCALE,
  computeHighlightPoseVectors,
  createEmptyHighlightReelState,
  evaluateHighlightTimeline,
  resolveMvpHighlightClip,
} from '../src/game/highlightReel.ts';
import { HighlightReelState, KillHighlightClip, MatchSnapshot } from '../src/game/types.ts';
import { EndMatchScreen } from '../src/ui/EndMatchScreen.tsx';

function makeClip(overrides?: Partial<KillHighlightClip>): KillHighlightClip {
  return {
    id: 'hl_1',
    killerId: 'player',
    killerName: 'Operator-101',
    killerTeam: 'blue',
    killerCharacterId: 'assault',
    victimId: 'bot_red_1',
    victimName: 'Viper-1',
    victimTeam: 'red',
    victimCharacterId: 'vanguard',
    weaponId: 'ak47',
    weaponName: 'AK-47',
    headshot: true,
    distanceMeters: 24.5,
    killerPos: { x: -5, y: 0, z: -10 },
    killerYaw: 0.4,
    victimPos: { x: 8, y: 0, z: 10 },
    victimYaw: -2.5,
    ...overrides,
  };
}

function makeMatchSnapshot(): MatchSnapshot {
  return {
    phase: 'ended',
    mode: 'tdm',
    mapId: 'urban',
    mapName: 'Urban Sector',
    blueScore: 30,
    redScore: 22,
    killLimit: 30,
    roundNumber: 1,
    roundsToWin: 1,
    timeRemainingSec: 120,
    winner: 'blue',
    winnerParticipantId: 'player',
    winnerName: 'Operator-101',
    bombState: null,
    participants: [
      {
        id: 'player',
        name: 'Operator-101',
        team: 'blue',
        isPlayer: true,
        kills: 14,
        deaths: 3,
        isAlive: true,
        respawnTimer: 0,
      },
      {
        id: 'bot_red_1',
        name: 'Viper-1',
        team: 'red',
        isPlayer: false,
        kills: 9,
        deaths: 10,
        isAlive: true,
        respawnTimer: 0,
      },
    ],
    killFeed: [],
  };
}

test('Highlight Reel: timeline math, MVP clip resolution, and camera pose interpolation', async (t) => {
  await t.test('evaluateHighlightTimeline tracks 5-second slow-motion phases cleanly', () => {
    assert.strictEqual(HIGHLIGHT_DURATION_SEC, 5.0);
    assert.strictEqual(HIGHLIGHT_TIME_SCALE, 0.28);

    const empty = createEmptyHighlightReelState();
    assert.strictEqual(empty.available, false);
    assert.strictEqual(empty.isPlaying, false);
    assert.strictEqual(empty.durationSec, 5.0);
    assert.strictEqual(empty.timeScale, 0.28);

    const start = evaluateHighlightTimeline(0);
    assert.strictEqual(start.progress, 0);
    assert.strictEqual(start.hasFired, false);
    assert.strictEqual(start.hasImpacted, false);
    assert.strictEqual(start.projectileProgress, 0);

    const midFlight = evaluateHighlightTimeline(1.45); // progress = 0.29 (between 0.10 and 0.48)
    assert.strictEqual(midFlight.hasFired, true);
    assert.strictEqual(midFlight.hasImpacted, false);
    assert.ok(midFlight.projectileProgress > 0 && midFlight.projectileProgress < 1);
    assert.strictEqual(midFlight.impactProgress, 0);

    const end = evaluateHighlightTimeline(5.0);
    assert.strictEqual(end.progress, 1);
    assert.strictEqual(end.hasFired, true);
    assert.strictEqual(end.hasImpacted, true);
    assert.strictEqual(end.projectileProgress, 1);
    assert.strictEqual(end.impactProgress, 1);
  });

  await t.test('resolveMvpHighlightClip prioritizes the MVP final kill and falls back cleanly', () => {
    const playerClip = makeClip({ id: 'hl_mvp', killerId: 'player', killerName: 'Operator-101' });
    const botClip = makeClip({ id: 'hl_other', killerId: 'bot_red_1', killerName: 'Viper-1' });
    const map = new Map<string, KillHighlightClip>([
      ['player', playerClip],
      ['bot_red_1', botClip],
    ]);

    assert.strictEqual(resolveMvpHighlightClip('player', map, botClip)?.id, 'hl_mvp');
    assert.strictEqual(resolveMvpHighlightClip('missing_id', map, botClip)?.id, 'hl_other');
    assert.strictEqual(resolveMvpHighlightClip(null, new Map(), null), null);
  });

  await t.test('computeHighlightPoseVectors produces valid 3D camera and projectile positions across both phases', () => {
    const clip = makeClip();
    const preImpact = computeHighlightPoseVectors(clip, evaluateHighlightTimeline(1.4));
    const postImpact = computeHighlightPoseVectors(clip, evaluateHighlightTimeline(3.8));

    assert.ok(Number.isFinite(preImpact.cameraPos.x));
    assert.ok(Number.isFinite(preImpact.cameraPos.y));
    assert.ok(Number.isFinite(preImpact.cameraPos.z));
    assert.ok(preImpact.projectilePos.z > clip.killerPos.z);
    assert.ok(preImpact.projectilePos.z < clip.victimPos.z);
    assert.ok(Math.abs(postImpact.cameraPos.x - clip.victimPos.x) < 5);
    assert.ok(Math.abs(postImpact.cameraPos.z - clip.victimPos.z) < 5);
  });
});

test('Highlight Reel UI: EndMatchScreen launch card and transparent slow-mo cinema overlay', async (t) => {
  await t.test('EndMatchScreen renders Highlight Reel trigger button on MVP card when clip is available', () => {
    const clip = makeClip();
    const highlightReel: HighlightReelState = {
      available: true,
      isPlaying: false,
      finished: false,
      progress: 0,
      elapsedSec: 0,
      durationSec: 5.0,
      timeScale: 0.28,
      clip,
    };

    const html = renderToStaticMarkup(
      React.createElement(EndMatchScreen, {
        match: makeMatchSnapshot(),
        playerStats: { kills: 14, deaths: 3, accuracyPct: 48, headshots: 6 },
        xp: 1200,
        sessionXpEarned: 350,
        highlightReel,
        onStartHighlightReplay: () => {},
        onStopHighlightReplay: () => {},
        onPlayAgain: () => {},
        onReturnToMenu: () => {},
      })
    );

    assert.ok(html.includes('HIGHLIGHT REEL (5S SLOW-MO)'));
    assert.ok(html.includes('FINAL KILL'));
    assert.ok(html.includes('Operator-101'));
    assert.ok(html.includes('Viper-1'));
    assert.ok(html.includes('AK-47'));
    assert.ok(html.includes('24.5m'));
    assert.ok(html.includes('HEADSHOT'));
  });

  await t.test('EndMatchScreen switches to transparent slow-motion cinema overlay when replay is playing', () => {
    const clip = makeClip();
    const activeReel: HighlightReelState = {
      available: true,
      isPlaying: true,
      finished: false,
      progress: 0.44,
      elapsedSec: 2.2,
      durationSec: 5.0,
      timeScale: 0.28,
      clip,
    };

    const html = renderToStaticMarkup(
      React.createElement(EndMatchScreen, {
        match: makeMatchSnapshot(),
        playerStats: { kills: 14, deaths: 3, accuracyPct: 48, headshots: 6 },
        xp: 1200,
        sessionXpEarned: 350,
        highlightReel: activeReel,
        onStartHighlightReplay: () => {},
        onStopHighlightReplay: () => {},
        onPlayAgain: () => {},
        onReturnToMenu: () => {},
      })
    );

    assert.ok(html.includes('data-highlight-replay-active="true"'));
    assert.ok(html.includes('HIGHLIGHT REEL · MVP FINAL KILL'));
    assert.ok(html.includes('0.28x SLOW-MOTION'));
    assert.ok(html.includes('2.2s / 5.0s'));
    assert.ok(html.includes('EXIT REPLAY'));
    assert.ok(html.includes('width:44%'));
    assert.ok(!html.includes('backdrop-blur-md'));
  });
});
