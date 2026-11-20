import {
  KillFeedEntry,
  MatchParticipant,
  MatchPhase,
  MatchSnapshot,
} from '../game/types';
import { MapId, TeamId } from '../maps/types';

export const DEFAULT_KILL_LIMIT = 30;
export const MATCH_DURATION_SEC = 300; // 5 minutes
export const RESPAWN_DELAY_SEC = 3.0;

export class MatchManager {
  private phase: MatchPhase = 'menu';
  private mapId: MapId = 'urban';
  private mapName = 'Urban Strike';
  private blueScore = 0;
  private redScore = 0;
  private killLimit = DEFAULT_KILL_LIMIT;
  private timeRemainingSec = MATCH_DURATION_SEC;
  private winner: TeamId | 'draw' | null = null;
  private participants = new Map<string, MatchParticipant>();
  private killFeed: KillFeedEntry[] = [];
  private killFeedSeq = 0;

  public setPhase(phase: MatchPhase): void {
    this.phase = phase;
  }

  public clearKillFeed(): void {
    this.killFeed = [];
  }

  public getPhase(): MatchPhase {
    return this.phase;
  }

  public configureMatch(
    mapId: MapId,
    mapName: string,
    killLimit: number,
    botsPerTeam: number
  ): void {
    this.mapId = mapId;
    this.mapName = mapName;
    this.killLimit = Math.max(5, Math.min(100, killLimit));
    this.blueScore = 0;
    this.redScore = 0;
    this.timeRemainingSec = MATCH_DURATION_SEC;
    this.winner = null;
    this.killFeed = [];
    this.participants.clear();

    // Register local human player on Blue team
    this.participants.set('player', {
      id: 'player',
      name: 'You',
      team: 'blue',
      isPlayer: true,
      kills: 0,
      deaths: 0,
      isAlive: true,
      respawnTimer: 0,
    });

    // botsPerTeam is per-team size; the local human fills one Blue slot.
    const blueBotCount = Math.max(0, botsPerTeam - 1);
    const blueCallsigns = ['Vanguard-1', 'Ghost-2', 'Echo-3', 'Specter-4', 'Nomad-5'];
    for (let i = 0; i < blueBotCount; i++) {
      const id = `bot_blue_${i + 1}`;
      this.participants.set(id, {
        id,
        name: blueCallsigns[i] ?? `Blue-${i + 1}`,
        team: 'blue',
        isPlayer: false,
        kills: 0,
        deaths: 0,
        isAlive: true,
        respawnTimer: 0,
      });
    }

    // Register Red enemy bots
    const redCallsigns = ['Viper-1', 'Reaper-2', 'Kodiak-3', 'Shadow-4', 'Talon-5'];
    for (let i = 0; i < botsPerTeam; i++) {
      const id = `bot_red_${i + 1}`;
      this.participants.set(id, {
        id,
        name: redCallsigns[i] ?? `Red-${i + 1}`,
        team: 'red',
        isPlayer: false,
        kills: 0,
        deaths: 0,
        isAlive: true,
        respawnTimer: 0,
      });
    }
  }

  public update(dt: number): void {
    if (this.phase !== 'playing') return;

    this.timeRemainingSec = Math.max(0, this.timeRemainingSec - dt);

    // Keep kill feed entries for the same interval used by the HUD.
    const now = performance.now();
    if (this.killFeed.length > 0) {
      this.killFeed = this.killFeed.filter((k) => now - k.timestamp < 4500);
    }

    if (this.timeRemainingSec <= 0) {
      this.finishByTime();
    }
  }

  public setParticipantAlive(id: string, isAlive: boolean, respawnTimer = 0): void {
    const p = this.participants.get(id);
    if (!p) return;
    p.isAlive = isAlive;
    p.respawnTimer = respawnTimer;
  }

  public recordKill(
    killerId: string,
    victimId: string,
    weaponName: string,
    headshot: boolean,
    distanceMeters: number
  ): void {
    if (this.phase !== 'playing') return;

    const killer = this.participants.get(killerId);
    const victim = this.participants.get(victimId);
    if (!killer || !victim) return;

    if (killer.id !== victim.id) {
      killer.kills += 1;
      if (killer.team === 'blue') {
        this.blueScore += 1;
      } else {
        this.redScore += 1;
      }
    }

    victim.deaths += 1;
    victim.isAlive = false;
    victim.respawnTimer = RESPAWN_DELAY_SEC;

    this.killFeed = [
      {
        id: ++this.killFeedSeq,
        killerName: killer.name,
        killerTeam: killer.team,
        victimName: victim.name,
        victimTeam: victim.team,
        weaponName,
        headshot,
        distanceMeters,
        timestamp: performance.now(),
      },
      ...this.killFeed.slice(0, 4),
    ];

    if (this.blueScore >= this.killLimit) {
      this.winner = 'blue';
      this.phase = 'ended';
    } else if (this.redScore >= this.killLimit) {
      this.winner = 'red';
      this.phase = 'ended';
    }
  }

  private finishByTime(): void {
    if (this.blueScore > this.redScore) {
      this.winner = 'blue';
    } else if (this.redScore > this.blueScore) {
      this.winner = 'red';
    } else {
      this.winner = 'draw';
    }
    this.phase = 'ended';
  }

  public getBlueBotParticipants(): MatchParticipant[] {
    return Array.from(this.participants.values()).filter(
      (p) => !p.isPlayer && p.team === 'blue'
    );
  }

  public getRedBotParticipants(): MatchParticipant[] {
    return Array.from(this.participants.values()).filter(
      (p) => !p.isPlayer && p.team === 'red'
    );
  }

  public getParticipantName(id: string): string {
    return this.participants.get(id)?.name ?? id;
  }

  public getSnapshot(): MatchSnapshot {
    const sorted = Array.from(this.participants.values()).sort((a, b) => {
      if (b.kills !== a.kills) return b.kills - a.kills;
      return a.deaths - b.deaths;
    });

    return {
      phase: this.phase,
      mapId: this.mapId,
      mapName: this.mapName,
      blueScore: this.blueScore,
      redScore: this.redScore,
      killLimit: this.killLimit,
      timeRemainingSec: this.timeRemainingSec,
      winner: this.winner,
      participants: sorted.map((p) => ({ ...p })),
      killFeed: [...this.killFeed],
    };
  }
}
