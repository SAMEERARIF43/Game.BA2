import {
  BOMB_DEFUSE_DURATION_SEC,
  BOMB_DETONATE_DURATION_SEC,
  BOMB_PLANT_DURATION_SEC,
  BOMB_ROUND_DURATION_SEC,
  BOMB_ROUND_END_DELAY_SEC,
  BOMB_ROUNDS_TO_WIN,
  BOMB_SITE_RADIUS,
  BombSiteId,
  DEFAULT_MATCH_TIME_LIMIT_SEC,
  FFA_DEFAULT_KILL_LIMIT,
  FFA_RESPAWN_DELAY_SEC,
  GameMode,
  isHostile as checkActorsHostile,
  normalizeGameMode,
  sortFfaParticipants,
  TDM_DEFAULT_KILL_LIMIT,
  TDM_RESPAWN_DELAY_SEC,
} from '../game/gameModeRules';
import {
  BombStateSnapshot,
  KillFeedEntry,
  MatchParticipant,
  MatchPhase,
  MatchSnapshot,
} from '../game/types';
import { MapId, TeamId } from '../maps/types';
import {
  CHAT_HISTORY_LIMIT,
  ChatChannel,
  ChatMessage,
  validateChatPayload,
} from '../multiplayer/chat';

export const DEFAULT_KILL_LIMIT = TDM_DEFAULT_KILL_LIMIT;
export const MATCH_DURATION_SEC = DEFAULT_MATCH_TIME_LIMIT_SEC;
export const RESPAWN_DELAY_SEC = TDM_RESPAWN_DELAY_SEC;

export interface MatchBombSite {
  id: BombSiteId;
  x: number;
  y: number;
  z: number;
  radius: number;
}

const DEFAULT_BOMB_SITES: MatchBombSite[] = [
  { id: 'A', x: -8, y: 0, z: 8, radius: BOMB_SITE_RADIUS },
  { id: 'B', x: 20.5, y: 0, z: 6, radius: BOMB_SITE_RADIUS },
];

export class MatchManager {
  private phase: MatchPhase = 'menu';
  private mode: GameMode = 'tdm';
  private mapId: MapId = 'urban';
  private mapName = 'Urban Strike';
  private blueScore = 0;
  private redScore = 0;
  private killLimit = DEFAULT_KILL_LIMIT;
  private roundNumber = 1;
  private roundsToWin = BOMB_ROUNDS_TO_WIN;
  private timeRemainingSec = MATCH_DURATION_SEC;
  private winner: TeamId | 'draw' | null = null;
  private winnerParticipantId: string | null = null;
  private winnerName: string | null = null;
  private participants = new Map<string, MatchParticipant>();
  private killFeed: KillFeedEntry[] = [];
  private killFeedSeq = 0;
  private isCustomMatch = false;
  private localChatHistory: ChatMessage[] = [];
  private localChatSeq = 0;
  private bombSites: MatchBombSite[] = [...DEFAULT_BOMB_SITES];
  private bombState: BombStateSnapshot = this.createEmptyBombState(null, null);
  private pendingRoundReset = false;

  private createEmptyBombState(
    carrierId: string | null,
    carrierName: string | null
  ): BombStateSnapshot {
    return {
      phase: 'unplanted',
      siteId: null,
      carrierId,
      carrierName,
      plantedBy: null,
      plantX: 0,
      plantY: 0,
      plantZ: 0,
      detonateRemainingSec: BOMB_DETONATE_DURATION_SEC,
      actionPlayerId: null,
      actionType: null,
      actionProgress: 0,
      roundWinner: null,
      roundEndReason: null,
      roundTransitionTimerSec: 0,
    };
  }

  public setPhase(phase: MatchPhase): void {
    this.phase = phase;
  }

  public setCustomMatch(custom: boolean): void {
    this.isCustomMatch = custom;
  }

  public getIsCustomMatch(): boolean {
    return this.isCustomMatch;
  }

  public getMode(): GameMode {
    return this.mode;
  }

  public getRoundNumber(): number {
    return this.roundNumber;
  }

  public getBombSites(): MatchBombSite[] {
    return this.bombSites.map((s) => ({ ...s }));
  }

  public getBombState(): BombStateSnapshot | null {
    return this.mode === 'bomb' ? { ...this.bombState } : null;
  }

  public consumePendingRoundReset(): boolean {
    if (!this.pendingRoundReset) return false;
    this.pendingRoundReset = false;
    return true;
  }

  public isHostile(actorAId: string, actorBId: string, friendlyFire = false): boolean {
    const a = this.participants.get(actorAId);
    const b = this.participants.get(actorBId);
    if (!a || !b) return actorAId !== actorBId;
    return checkActorsHostile(this.mode, a, b, friendlyFire);
  }

  public clearKillFeed(): void {
    this.killFeed = [];
  }

  public clearLocalChatMessages(): void {
    this.localChatHistory = [];
  }

  public getLocalChatMessages(): ChatMessage[] {
    return [...this.localChatHistory];
  }

  public addLocalChatMessage(
    text: string,
    channel: ChatChannel = 'all',
    sender?: { id?: string; name?: string; team?: TeamId | 'system'; isSystem?: boolean }
  ): ChatMessage | null {
    if (sender?.isSystem) {
      const clean = text.trim();
      if (!clean) return null;
      const sysMsg: ChatMessage = {
        id: `offline_sys_${++this.localChatSeq}`,
        senderId: 'system',
        senderName: 'SYSTEM',
        senderTeam: 'system',
        channel: 'all',
        text: clean,
        timestamp: Date.now(),
        isSystem: true,
      };
      this.localChatHistory = [
        ...this.localChatHistory.slice(-(CHAT_HISTORY_LIMIT - 1)),
        sysMsg,
      ];
      return sysMsg;
    }

    const validated = validateChatPayload({ text, channel });
    if (!validated) return null;

    const resolvedChannel: ChatChannel =
      this.mode === 'ffa' && validated.channel === 'team' ? 'all' : validated.channel;

    const msg: ChatMessage = {
      id: `offline_chat_${++this.localChatSeq}`,
      senderId: sender?.id ?? 'player',
      senderName: sender?.name?.trim() || 'You',
      senderTeam: sender?.team ?? 'blue',
      channel: resolvedChannel,
      text: validated.text,
      timestamp: Date.now(),
    };
    this.localChatHistory = [
      ...this.localChatHistory.slice(-(CHAT_HISTORY_LIMIT - 1)),
      msg,
    ];
    return msg;
  }

  public getPhase(): MatchPhase {
    return this.phase;
  }

  public configureMatch(
    mapId: MapId,
    mapName: string,
    killLimit: number,
    botsPerTeam: number,
    options?: {
      mode?: GameMode;
      timeLimitSec?: number;
      roundsToWin?: number;
      isCustomMatch?: boolean;
      playerName?: string;
      bombSites?: MatchBombSite[];
    }
  ): void {
    const mode = normalizeGameMode(options?.mode, 'tdm');
    this.mode = mode;
    this.mapId = mapId;
    this.mapName = mapName;
    this.blueScore = 0;
    this.redScore = 0;
    this.roundNumber = 1;
    this.pendingRoundReset = false;
    this.isCustomMatch = Boolean(options?.isCustomMatch);
    this.winner = null;
    this.winnerParticipantId = null;
    this.winnerName = null;
    this.killFeed = [];
    this.participants.clear();

    this.bombSites =
      options?.bombSites && options.bombSites.length > 0
        ? options.bombSites.map((s) => ({ ...s }))
        : [...DEFAULT_BOMB_SITES];

    if (mode === 'bomb') {
      const requestedRounds = options?.roundsToWin ?? (killLimit <= 13 ? killLimit : BOMB_ROUNDS_TO_WIN);
      this.roundsToWin = Math.max(1, Math.min(13, Math.round(requestedRounds)));
      this.killLimit = this.roundsToWin;
      this.timeRemainingSec = Math.max(
        30,
        Math.min(300, options?.timeLimitSec ?? BOMB_ROUND_DURATION_SEC)
      );
    } else if (mode === 'ffa') {
      const resolvedLimit = killLimit > 0 ? killLimit : FFA_DEFAULT_KILL_LIMIT;
      this.killLimit = Math.max(5, Math.min(100, resolvedLimit));
      this.roundsToWin = 1;
      this.timeRemainingSec = Math.max(60, Math.min(1200, options?.timeLimitSec ?? MATCH_DURATION_SEC));
    } else {
      this.killLimit = Math.max(5, Math.min(100, killLimit));
      this.roundsToWin = 1;
      this.timeRemainingSec = Math.max(60, Math.min(1200, options?.timeLimitSec ?? MATCH_DURATION_SEC));
    }

    const playerName = options?.playerName?.trim() || 'You';
    // Register local human player on Blue team (Attackers in bomb mode)
    this.participants.set('player', {
      id: 'player',
      name: playerName,
      team: 'blue',
      isPlayer: true,
      kills: 0,
      deaths: 0,
      isAlive: true,
      respawnTimer: 0,
    });

    if (mode === 'ffa') {
      const totalFfaBots = Math.max(1, Math.min(11, botsPerTeam * 2 - 1));
      const ffaCallsigns = [
        'Viper-1',
        'Reaper-2',
        'Kodiak-3',
        'Shadow-4',
        'Talon-5',
        'Vanguard-6',
        'Ghost-7',
        'Echo-8',
        'Specter-9',
        'Nomad-10',
        'Apex-11',
      ];
      for (let i = 0; i < totalFfaBots; i++) {
        const id = `bot_ffa_${i + 1}`;
        this.participants.set(id, {
          id,
          name: ffaCallsigns[i] ?? `Rogue-${i + 1}`,
          team: 'red',
          isPlayer: false,
          kills: 0,
          deaths: 0,
          isAlive: true,
          respawnTimer: 0,
        });
      }
      this.bombState = this.createEmptyBombState(null, null);
      return;
    }

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

    if (mode === 'bomb') {
      this.bombState = this.createEmptyBombState('player', playerName);
    } else {
      this.bombState = this.createEmptyBombState(null, null);
    }
  }

  public update(dt: number): void {
    if (this.phase !== 'playing') return;

    const now = performance.now();
    if (this.killFeed.length > 0) {
      this.killFeed = this.killFeed.filter((k) => now - k.timestamp < 4000);
    }

    if (this.mode === 'bomb') {
      this.advanceBombTimers(dt);
      return;
    }

    this.timeRemainingSec = Math.max(0, this.timeRemainingSec - dt);
    if (this.timeRemainingSec <= 0) {
      this.finishByTime();
    }
  }

  private advanceBombTimers(dt: number): void {
    if (this.bombState.phase === 'round_end') {
      this.bombState.roundTransitionTimerSec = Math.max(
        0,
        this.bombState.roundTransitionTimerSec - dt
      );
      if (this.bombState.roundTransitionTimerSec <= 0) {
        this.startNextBombRound();
      }
      return;
    }

    if (this.bombState.phase === 'planted') {
      this.bombState.detonateRemainingSec = Math.max(
        0,
        this.bombState.detonateRemainingSec - dt
      );
      if (this.bombState.detonateRemainingSec <= 0) {
        this.bombState.phase = 'detonated';
        this.endBombRound('blue', 'Bomb Detonated');
      }
      return;
    }

    // Unplanted: round countdown timer runs
    this.timeRemainingSec = Math.max(0, this.timeRemainingSec - dt);
    if (this.timeRemainingSec <= 0) {
      this.endBombRound('red', 'Round Time Expired');
    }
  }

  public getBombPlantSiteForPos(x: number, z: number): MatchBombSite | null {
    for (const site of this.bombSites) {
      const dist = Math.hypot(x - site.x, z - site.z);
      if (dist <= site.radius) {
        return site;
      }
    }
    return null;
  }

  public isWithinPlantedBomb(x: number, z: number): boolean {
    if (this.bombState.phase !== 'planted') return false;
    return Math.hypot(x - this.bombState.plantX, z - this.bombState.plantZ) <= BOMB_SITE_RADIUS;
  }

  public updateBombInteraction(
    actor: { id: string; team: TeamId; x: number; y: number; z: number; isAlive: boolean },
    holdingE: boolean,
    dt: number
  ): { event?: 'planted' | 'defused' } {
    if (this.phase !== 'playing' || this.mode !== 'bomb') {
      return {};
    }

    if (!actor.isAlive || !holdingE) {
      if (this.bombState.actionPlayerId === actor.id) {
        this.bombState.actionPlayerId = null;
        this.bombState.actionType = null;
        this.bombState.actionProgress = 0;
      }
      return {};
    }

    // Plant logic: attacker (blue) inside Site A or B when bomb is unplanted
    if (this.bombState.phase === 'unplanted' && actor.team === 'blue') {
      const carrier = this.bombState.carrierId
        ? this.participants.get(this.bombState.carrierId)
        : undefined;
      const canCarry =
        this.bombState.carrierId === actor.id || !carrier || !carrier.isAlive;
      const site = this.getBombPlantSiteForPos(actor.x, actor.z);

      if (!canCarry || !site) {
        if (this.bombState.actionPlayerId === actor.id) {
          this.bombState.actionPlayerId = null;
          this.bombState.actionType = null;
          this.bombState.actionProgress = 0;
        }
        return {};
      }

      if (this.bombState.carrierId !== actor.id) {
        this.bombState.carrierId = actor.id;
        this.bombState.carrierName = this.participants.get(actor.id)?.name ?? actor.id;
      }

      if (
        this.bombState.actionPlayerId &&
        this.bombState.actionPlayerId !== actor.id
      ) {
        return {};
      }

      const prevProgress =
        this.bombState.actionPlayerId === actor.id &&
        this.bombState.actionType === 'plant'
          ? this.bombState.actionProgress
          : 0;
      const nextProgress = Math.min(1, prevProgress + dt / BOMB_PLANT_DURATION_SEC);

      this.bombState.actionPlayerId = actor.id;
      this.bombState.actionType = 'plant';
      this.bombState.actionProgress = nextProgress;

      if (nextProgress >= 1) {
        this.bombState.phase = 'planted';
        this.bombState.siteId = site.id;
        this.bombState.plantedBy = actor.id;
        this.bombState.carrierId = null;
        this.bombState.carrierName = null;
        this.bombState.plantX = actor.x;
        this.bombState.plantY = site.y;
        this.bombState.plantZ = actor.z;
        this.bombState.detonateRemainingSec = BOMB_DETONATE_DURATION_SEC;
        this.bombState.actionPlayerId = null;
        this.bombState.actionType = null;
        this.bombState.actionProgress = 0;
        return { event: 'planted' };
      }

      return {};
    }

    // Defuse logic: defender (red) within range of planted bomb
    if (this.bombState.phase === 'planted' && actor.team === 'red') {
      if (!this.isWithinPlantedBomb(actor.x, actor.z)) {
        if (this.bombState.actionPlayerId === actor.id) {
          this.bombState.actionPlayerId = null;
          this.bombState.actionType = null;
          this.bombState.actionProgress = 0;
        }
        return {};
      }

      if (
        this.bombState.actionPlayerId &&
        this.bombState.actionPlayerId !== actor.id
      ) {
        return {};
      }

      const prevProgress =
        this.bombState.actionPlayerId === actor.id &&
        this.bombState.actionType === 'defuse'
          ? this.bombState.actionProgress
          : 0;
      const nextProgress = Math.min(1, prevProgress + dt / BOMB_DEFUSE_DURATION_SEC);

      this.bombState.actionPlayerId = actor.id;
      this.bombState.actionType = 'defuse';
      this.bombState.actionProgress = nextProgress;

      if (nextProgress >= 1) {
        this.bombState.phase = 'defused';
        this.bombState.actionPlayerId = null;
        this.bombState.actionType = null;
        this.bombState.actionProgress = 0;
        this.endBombRound('red', 'Bomb Defused');
        return { event: 'defused' };
      }

      return {};
    }

    return {};
  }

  private endBombRound(winnerTeam: TeamId, reason: string): void {
    if (this.phase !== 'playing' || this.bombState.phase === 'round_end') {
      return;
    }

    if (winnerTeam === 'blue') {
      this.blueScore += 1;
    } else {
      this.redScore += 1;
    }

    this.bombState.roundWinner = winnerTeam;
    this.bombState.roundEndReason = reason;
    this.bombState.actionPlayerId = null;
    this.bombState.actionType = null;
    this.bombState.actionProgress = 0;

    if (this.blueScore >= this.roundsToWin || this.redScore >= this.roundsToWin) {
      this.winner = this.blueScore >= this.roundsToWin ? 'blue' : 'red';
      this.phase = 'ended';
      this.bombState.phase = 'round_end';
      this.bombState.roundTransitionTimerSec = 0;
      return;
    }

    this.bombState.phase = 'round_end';
    this.bombState.roundTransitionTimerSec = BOMB_ROUND_END_DELAY_SEC;
  }

  private startNextBombRound(): void {
    this.roundNumber += 1;
    this.timeRemainingSec = BOMB_ROUND_DURATION_SEC;

    let nextCarrier: MatchParticipant | undefined = this.participants.get('player');
    this.participants.forEach((p) => {
      p.isAlive = true;
      p.respawnTimer = 0;
      if (!nextCarrier && p.team === 'blue') {
        nextCarrier = p;
      }
    });

    this.bombState = this.createEmptyBombState(
      nextCarrier?.id ?? null,
      nextCarrier?.name ?? null
    );
    this.pendingRoundReset = true;
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

    const hostileKill = checkActorsHostile(this.mode, killer, victim, true);
    if (killer.id !== victim.id && hostileKill) {
      killer.kills += 1;
      if (this.mode === 'tdm') {
        if (killer.team === 'blue') {
          this.blueScore += 1;
        } else {
          this.redScore += 1;
        }
      } else if (this.mode === 'ffa') {
        this.syncFfaScoreSummary();
      }
    }

    victim.deaths += 1;
    victim.isAlive = false;
    victim.respawnTimer =
      this.mode === 'bomb'
        ? 0
        : this.mode === 'ffa'
          ? FFA_RESPAWN_DELAY_SEC
          : TDM_RESPAWN_DELAY_SEC;

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

    if (this.mode === 'ffa') {
      if (killer.id !== victim.id && killer.kills >= this.killLimit) {
        this.winnerParticipantId = killer.id;
        this.winnerName = killer.name;
        this.winner = killer.id === 'player' ? 'blue' : 'red';
        this.phase = 'ended';
      }
      return;
    }

    if (this.mode === 'bomb') {
      if (this.bombState.actionPlayerId === victim.id) {
        this.bombState.actionPlayerId = null;
        this.bombState.actionType = null;
        this.bombState.actionProgress = 0;
      }

      if (
        this.bombState.phase === 'unplanted' &&
        this.bombState.carrierId === victim.id
      ) {
        let replacement: MatchParticipant | null = null;
        this.participants.forEach((p) => {
          if (!replacement && p.team === 'blue' && p.isAlive) {
            replacement = p;
          }
        });
        this.bombState.carrierId = replacement ? (replacement as MatchParticipant).id : null;
        this.bombState.carrierName = replacement ? (replacement as MatchParticipant).name : null;
      }

      if (
        this.bombState.phase !== 'round_end' &&
        this.bombState.phase !== 'defused' &&
        this.bombState.phase !== 'detonated'
      ) {
        let aliveBlue = 0;
        let aliveRed = 0;
        this.participants.forEach((p) => {
          if (!p.isAlive) return;
          if (p.team === 'blue') aliveBlue += 1;
          else aliveRed += 1;
        });

        if (aliveRed === 0) {
          this.endBombRound('blue', 'Defenders Eliminated');
        } else if (aliveBlue === 0 && this.bombState.phase === 'unplanted') {
          this.endBombRound('red', 'Attackers Eliminated');
        }
      }
      return;
    }

    if (this.blueScore >= this.killLimit) {
      this.winner = 'blue';
      this.phase = 'ended';
    } else if (this.redScore >= this.killLimit) {
      this.winner = 'red';
      this.phase = 'ended';
    }
  }

  private syncFfaScoreSummary(): void {
    const playerKills = this.participants.get('player')?.kills ?? 0;
    let topBotKills = 0;
    this.participants.forEach((p) => {
      if (!p.isPlayer && p.kills > topBotKills) {
        topBotKills = p.kills;
      }
    });
    this.blueScore = playerKills;
    this.redScore = topBotKills;
  }

  private finishByTime(): void {
    if (this.mode === 'ffa') {
      const sorted = sortFfaParticipants(Array.from(this.participants.values()));
      const first = sorted[0];
      const second = sorted[1];
      if (!first || (second && first.kills === second.kills)) {
        this.winner = 'draw';
        this.winnerParticipantId = null;
        this.winnerName = null;
      } else {
        this.winnerParticipantId = first.id;
        this.winnerName = first.name;
        this.winner = first.id === 'player' ? 'blue' : 'red';
      }
      this.phase = 'ended';
      return;
    }

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
    const sorted = sortFfaParticipants(Array.from(this.participants.values()));

    return {
      phase: this.phase,
      mode: this.mode,
      mapId: this.mapId,
      mapName: this.mapName,
      blueScore: this.blueScore,
      redScore: this.redScore,
      killLimit: this.killLimit,
      roundNumber: this.roundNumber,
      roundsToWin: this.roundsToWin,
      timeRemainingSec: this.timeRemainingSec,
      winner: this.winner,
      winnerParticipantId: this.winnerParticipantId,
      winnerName: this.winnerName,
      bombState: this.mode === 'bomb' ? { ...this.bombState } : null,
      participants: sorted.map((p) => ({ ...p })),
      killFeed: [...this.killFeed],
    };
  }
}
