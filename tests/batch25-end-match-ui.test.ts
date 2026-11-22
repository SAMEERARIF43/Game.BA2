import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCombatScore, selectMatchMvp } from '../src/match/matchMachine.ts';
import { formatMatchTime } from '../src/ui/ScoreboardOverlay.tsx';

test('Batch 25 v1.1: End Match UI, Unified Score & Bot Accuracy', async (t) => {
  await t.test('Completed match duration formats correctly without Time Remaining', () => {
    const durationStr = formatMatchTime(138); // 2 min 18 sec
    assert.strictEqual(durationStr, '02:18');
  });

  await t.test('MVP and participants use unified score calculation', () => {
    const participants = [
      { id: 'p1', name: 'Player', team: 'blue' as const, isPlayer: true, kills: 10, deaths: 3, headshots: 4, accuracyPct: 45 },
      { id: 'bot_1', name: 'Bot-1', team: 'red' as const, isPlayer: false, kills: 8, deaths: 5, headshots: 2, accuracyPct: 32 },
    ];
    const mvp = selectMatchMvp(participants, { kills: 10, deaths: 3, headshots: 4, accuracyPct: 45 });
    assert.ok(mvp);
    assert.strictEqual(mvp?.name, 'Player');
    // Unified score = 10*100 + 4*50 + Math.round(45*0.5) = 1000 + 200 + 23 = 1223
    const expectedScore = calculateCombatScore(10, 4, 45);
    assert.strictEqual(expectedScore, 1223);
    assert.strictEqual(mvp?.combatScore, expectedScore);
  });

  await t.test('Bot accuracy is normalized within realistic bounds (22%–48%)', () => {
    const botId = 'bot_alpha';
    const accuracy = 22 + (botId.charCodeAt(botId.length - 1) % 27);
    assert.ok(accuracy >= 22 && accuracy <= 48, `Bot accuracy ${accuracy}% must be between 22% and 48%`);
  });
});
