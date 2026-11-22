import { Client, Room } from '@colyseus/sdk';
import { normalizeGameMode } from '../game/gameModeRules';
import { normalizeCharacterId, normalizeWeaponId } from '../game/loadoutRules';
import { BombPhase, BombSiteId, BombStateSnapshot, CharacterId, GunId, Stance, WeaponId } from '../game/types';
import { MapId, TeamId } from '../maps/types';
import {
  CHAT_HISTORY_LIMIT,
  ChatChannel,
  ChatMessage,
  validateChatPayload,
} from './chat';
import {
  CreatePrivateMatchOptions,
  LobbyPlayerInfo,
  LobbyRoomSnapshot,
  NetworkDamagedEvent,
  NetworkHitConfirmEvent,
  NetworkKillFeedEvent,
  NetworkPingEvent,
  PublicRoomSummary,
  RemoteFireEvent,
  RoomLookupSummary,
} from './types';

export interface NetworkManagerCallbacks {
  onStateUpdate: (snapshot: LobbyRoomSnapshot) => void;
  onRemoteFire: (event: RemoteFireEvent) => void;
  onHitConfirm: (event: NetworkHitConfirmEvent) => void;
  onPlayerDamaged: (event: NetworkDamagedEvent) => void;
  onPlayerRespawn: (pos: { x: number; y: number; z: number; rotY: number }) => void;
  onKillFeed: (event: NetworkKillFeedEvent) => void;
  onTeamPing?: (event: NetworkPingEvent) => void;
  onChatMessage?: (message: ChatMessage) => void;
  onChatUpdate?: (messages: ChatMessage[]) => void;
  onSystemNotice: (message: string) => void;
  onDisconnected: (reason: string) => void;
  onPingUpdate?: (pingMs: number) => void;
}

function getColyseusEndpoint(): string {
  const metaEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
  const custom = metaEnv?.VITE_COLYSEUS_URL;
  if (custom && custom.trim().length > 0) {
    return custom.trim();
  }
  if (typeof window === 'undefined') {
    return 'ws://localhost:3000';
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}`;
}

export class NetworkManager {
  private client: Client;
  private room: Room | null = null;
  private callbacks: NetworkManagerCallbacks;
  private intentionalLeave = false;
  private chatHistory: ChatMessage[] = [];
  private localChatSeq = 0;
  private reconnectionToken: string | null = null;
  private currentPingMs = 24;
  private pingIntervalId: any = null;
  private lastPingSentTime = 0;

  constructor(callbacks: NetworkManagerCallbacks) {
    this.callbacks = callbacks;
    this.client = new Client(getColyseusEndpoint());
  }

  public isConnected(): boolean {
    return this.room !== null;
  }

  public getLocalSessionId(): string {
    return this.room?.sessionId ?? '';
  }

  public getPing(): number {
    return this.currentPingMs;
  }

  public getConnectionQuality(): 'green' | 'amber' | 'red' {
    if (this.currentPingMs < 60) return 'green';
    if (this.currentPingMs <= 120) return 'amber';
    return 'red';
  }

  public getChatMessages(): ChatMessage[] {
    return [...this.chatHistory];
  }

  public clearChatMessages(): void {
    if (this.chatHistory.length === 0) return;
    this.chatHistory = [];
    this.callbacks.onChatUpdate?.([]);
  }

  public pushSystemNoticeToChat(text: string): ChatMessage | null {
    const clean = text.trim();
    if (!clean) return null;
    const msg: ChatMessage = {
      id: `local_sys_${++this.localChatSeq}`,
      senderId: 'system',
      senderName: 'SYSTEM',
      senderTeam: 'system',
      channel: 'all',
      text: clean,
      timestamp: Date.now(),
      isSystem: true,
    };
    this.appendChatMessage(msg);
    return msg;
  }

  private appendChatMessage(msg: ChatMessage): void {
    this.chatHistory = [...this.chatHistory.slice(-(CHAT_HISTORY_LIMIT - 1)), msg];
    this.callbacks.onChatMessage?.(msg);
    this.callbacks.onChatUpdate?.([...this.chatHistory]);
  }

  public async fetchPublicRooms(modeFilter?: string): Promise<PublicRoomSummary[]> {
    const res = await fetch('/api/rooms/public');
    const body = (await res.json().catch(() => ({}))) as { rooms?: PublicRoomSummary[] };
    const rooms = body.rooms || [];
    if (!modeFilter || modeFilter === 'any') return rooms;
    return rooms.filter((r) => r.mode === modeFilter);
  }

  public async quickMatch(
    modeFilter: string = 'any',
    playerName: string = 'Operator-101',
    characterId: CharacterId = 'assault',
    weaponId: GunId = 'ak47'
  ): Promise<LobbyRoomSnapshot> {
    await this.leaveRoom();
    this.intentionalLeave = false;
    this.clearChatMessages();

    const rooms = await this.fetchPublicRooms(modeFilter);
    const bestRoom = rooms.find(
      (r) => r.phase === 'lobby' && !r.hasPassword && r.playerCount < r.maxPlayers
    );
    if (bestRoom) {
      return this.joinPrivateMatch(bestRoom.roomCode, playerName, undefined, characterId, weaponId);
    }

    return this.createPrivateMatch({
      playerName,
      roomName: `Strike Force Public (${modeFilter.toUpperCase()})`,
      mapId: 'urban',
      mode: (modeFilter === 'any' ? 'tdm' : modeFilter) as any,
      killLimit: modeFilter === 'bomb' ? 5 : 30,
      timeLimit: 300,
      respawnDelay: 3,
      friendlyFire: false,
      botCount: 4,
      characterId,
      weaponId,
    });
  }

  public async lookupRoom(code: string): Promise<RoomLookupSummary> {
    const normalized = code.trim().toUpperCase();
    const res = await fetch(`/api/rooms/${encodeURIComponent(normalized)}`);
    const body = (await res.json().catch(() => ({}))) as {
      found?: boolean;
      error?: string;
      room?: RoomLookupSummary;
    };

    if (!res.ok || !body.found || !body.room) {
      throw new Error(body.error || 'Room not found or has closed.');
    }
    return body.room;
  }

  public async createPrivateMatch(options: CreatePrivateMatchOptions): Promise<LobbyRoomSnapshot> {
    await this.leaveRoom();
    this.intentionalLeave = false;
    this.clearChatMessages();

    const room = await this.client.create('match', options);
    this.attachRoomListeners(room);
    return this.extractSnapshot(room);
  }

  public async joinPrivateMatch(
    roomCode: string,
    playerName: string,
    password?: string,
    characterId?: CharacterId,
    weaponId?: GunId
  ): Promise<LobbyRoomSnapshot> {
    await this.leaveRoom();
    this.intentionalLeave = false;
    this.clearChatMessages();

    const normalized = roomCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(normalized)) {
      throw new Error('Room code must be 6 letters or numbers.');
    }

    try {
      const room = await this.client.joinById(normalized, {
        playerName,
        password: password ?? '',
        characterId,
        weaponId,
      });
      this.attachRoomListeners(room);
      return this.extractSnapshot(room);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to join room.';
      if (message.toLowerCase().includes('not found')) {
        throw new Error(`Room "${normalized}" was not found.`);
      }
      throw new Error(message);
    }
  }

  public switchTeam(): void {
    this.room?.send('switch_team');
  }

  public toggleReady(): void {
    this.room?.send('toggle_ready');
  }

  public updateConfig(patch: Partial<CreatePrivateMatchOptions>): void {
    this.room?.send('update_config', patch);
  }

  public balanceTeams(): void {
    this.room?.send('balance_teams');
  }

  public kickPlayer(targetId: string): void {
    this.room?.send('kick_player', { targetId });
  }

  public startMatch(): void {
    this.room?.send('start_match');
  }

  public returnToLobby(): void {
    this.room?.send('return_to_lobby');
  }

  public selectCharacter(characterId: CharacterId): void {
    this.room?.send('select_character', { characterId });
  }

  public selectLoadout(weaponId?: GunId, characterId?: CharacterId): void {
    this.room?.send('select_loadout', { weaponId, characterId });
  }

  public sendChatMessage(
    text: string,
    channel: ChatChannel = 'all',
    localSender?: { id?: string; name?: string; team?: TeamId }
  ): ChatMessage | null {
    const validated = validateChatPayload({ text, channel });
    if (!validated) {
      return null;
    }

    if (this.room) {
      this.room.send('chat', validated);
      return null;
    }

    const msg: ChatMessage = {
      id: `local_chat_${++this.localChatSeq}`,
      senderId: localSender?.id ?? 'local_player',
      senderName: localSender?.name?.trim() || 'Operator',
      senderTeam: localSender?.team ?? 'blue',
      channel: validated.channel,
      text: validated.text,
      timestamp: Date.now(),
    };
    this.appendChatMessage(msg);
    return msg;
  }

  public sendMove(
    x: number,
    y: number,
    z: number,
    rotY: number,
    pitch: number,
    weaponId: WeaponId,
    characterId?: CharacterId,
    stance?: Stance
  ): void {
    this.room?.send('player_move', { x, y, z, rotY, pitch, weaponId, characterId, stance });
  }

  public sendFire(payload: {
    muzzleX: number;
    muzzleY: number;
    muzzleZ: number;
    endX: number;
    endY: number;
    endZ: number;
    weaponId: WeaponId;
    targetId?: string;
    zone?: 'head' | 'body';
    pellets?: Array<{
      endX: number;
      endY: number;
      endZ: number;
      targetId?: string;
      zone?: 'head' | 'body';
    }>;
  }): void {
    this.room?.send('player_fire', payload);
  }

  public sendPing(payload: {
    id: string;
    kind: 'location' | 'enemy';
    x: number;
    y: number;
    z: number;
    targetId?: string;
  }): void {
    this.room?.send('place_ping', payload);
  }

  public sendBombInteract(holding: boolean): void {
    this.room?.send('bomb_interact', { holding });
  }

  public requestRespawn(weaponId?: GunId): void {
    this.room?.send('request_respawn', weaponId ? { weaponId } : {});
  }

  public async leaveRoom(): Promise<void> {
    const active = this.room;
    this.clearChatMessages();
    this.stopPingLoop();
    if (!active) return;
    this.intentionalLeave = true;
    this.room = null;
    this.reconnectionToken = null;
    try {
      await active.leave(true);
    } catch {
      // Ignore socket close error during explicit leave
    }
  }

  private startPingLoop(room: Room): void {
    this.stopPingLoop();
    this.pingIntervalId = setInterval(() => {
      if (this.room !== room) {
        this.stopPingLoop();
        return;
      }
      this.lastPingSentTime = Date.now();
      try {
        room.send('ping');
      } catch {
        // ignore
      }
    }, 3000);
  }

  private stopPingLoop(): void {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }

  private attachRoomListeners(room: Room): void {
    this.room = room;
    this.reconnectionToken = room.reconnectionToken ?? null;
    this.startPingLoop(room);

    room.onStateChange(() => {
      if (this.room !== room) return;
      this.callbacks.onStateUpdate(this.extractSnapshot(room));
    });

    room.onMessage('pong', () => {
      if (this.lastPingSentTime > 0) {
        const rtt = Date.now() - this.lastPingSentTime;
        this.currentPingMs = Math.round(rtt);
        this.callbacks.onPingUpdate?.(this.currentPingMs);
      }
    });

    room.onMessage('remote_fire', (msg: RemoteFireEvent) => {
      this.callbacks.onRemoteFire(msg);
    });

    room.onMessage('hit_confirm', (msg: NetworkHitConfirmEvent) => {
      this.callbacks.onHitConfirm(msg);
    });

    room.onMessage('player_damaged', (msg: NetworkDamagedEvent) => {
      this.callbacks.onPlayerDamaged(msg);
    });

    room.onMessage('player_respawn', (msg: { x: number; y: number; z: number; rotY: number }) => {
      this.callbacks.onPlayerRespawn(msg);
    });

    room.onMessage('kill_feed', (msg: NetworkKillFeedEvent) => {
      this.callbacks.onKillFeed(msg);
    });

    room.onMessage('team_ping', (msg: NetworkPingEvent) => {
      this.callbacks.onTeamPing?.(msg);
    });

    room.onMessage('chat', (msg: ChatMessage) => {
      if (!msg || typeof msg.text !== 'string') return;
      this.appendChatMessage(msg);
    });

    room.onMessage('system_notice', (msg: { message?: string }) => {
      if (msg?.message) {
        this.callbacks.onSystemNotice(msg.message);
      }
    });

    room.onMessage('kicked', (msg: { reason?: string }) => {
      this.intentionalLeave = true;
      this.room = null;
      this.reconnectionToken = null;
      this.stopPingLoop();
      this.callbacks.onDisconnected(msg?.reason || 'Removed from room by host.');
    });

    room.onLeave(async (code) => {
      if (this.room === room) {
        this.room = null;
      }
      this.stopPingLoop();

      if (!this.intentionalLeave && this.reconnectionToken) {
        this.callbacks.onSystemNotice('Connection lost. Reconnecting to match...');
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await new Promise((r) => setTimeout(r, attempt * 1200));
            if (this.intentionalLeave) return;
            const reconnectedRoom = await this.client.reconnect(this.reconnectionToken);
            this.attachRoomListeners(reconnectedRoom);
            this.callbacks.onSystemNotice('Successfully reconnected to match!');
            return;
          } catch {
            // Retry reconnect
          }
        }
        this.callbacks.onDisconnected('Disconnected from multiplayer server (reconnection failed).');
      } else if (!this.intentionalLeave) {
        const reason =
          code === 4001 ? 'Removed from room by host.' : 'Disconnected from multiplayer server.';
        this.callbacks.onDisconnected(reason);
      }
    });
  }

  private extractSnapshot(room: Room): LobbyRoomSnapshot {
    const raw = room.state as unknown as {
      roomCode?: string;
      roomName?: string;
      mapId?: string;
      mode?: string;
      phase?: string;
      killLimit?: number;
      timeLimit?: number;
      timeRemaining?: number;
      respawnDelay?: number;
      friendlyFire?: boolean;
      botCount?: number;
      hasPassword?: boolean;
      hostId?: string;
      blueScore?: number;
      redScore?: number;
      roundNumber?: number;
      roundsToWin?: number;
      winner?: string;
      winnerId?: string;
      winnerName?: string;
      bombPhase?: string;
      bombSite?: string;
      bombCarrierId?: string;
      bombX?: number;
      bombY?: number;
      bombZ?: number;
      bombDetonateTimer?: number;
      bombActionPlayerId?: string;
      bombActionType?: string;
      bombActionProgress?: number;
      roundWinner?: string;
      roundEndReason?: string;
      roundTransitionTimer?: number;
      players?: Map<string, LobbyPlayerInfo> & { forEach?: (cb: (v: LobbyPlayerInfo) => void) => void };
    };

    const players: LobbyPlayerInfo[] = [];
    raw?.players?.forEach?.((p) => {
      players.push({
        id: String(p.id),
        name: String(p.name),
        team: (p.team === 'red' ? 'red' : 'blue') as TeamId,
        isBot: Boolean(p.isBot),
        isHost: Boolean(p.isHost),
        ready: Boolean(p.ready),
        isAlive: Boolean(p.isAlive),
        respawnTimer: Number(p.respawnTimer) || 0,
        x: Number(p.x) || 0,
        y: Number(p.y) || 0,
        z: Number(p.z) || 0,
        rotY: Number(p.rotY) || 0,
        pitch: Number(p.pitch) || 0,
        characterId: normalizeCharacterId(p.characterId, 'assault'),
        weaponId: normalizeWeaponId(p.weaponId, 'ak47'),
        stance:
          p.stance === 'crouch' || p.stance === 'slide' || p.stance === 'sprint'
            ? p.stance
            : 'stand',
        health: Number(p.health) ?? 100,
        kills: Number(p.kills) || 0,
        deaths: Number(p.deaths) || 0,
      });
    });

    const mode = normalizeGameMode(raw?.mode, 'tdm');
    const carrierId = raw?.bombCarrierId ? String(raw.bombCarrierId) : null;
    const carrierPlayer = carrierId ? players.find((pl) => pl.id === carrierId) : undefined;
    const rawPhase = String(raw?.bombPhase || 'unplanted');
    const bombPhase: BombPhase =
      rawPhase === 'planted' ||
      rawPhase === 'defused' ||
      rawPhase === 'detonated' ||
      rawPhase === 'round_end'
        ? rawPhase
        : 'unplanted';
    const rawSite = String(raw?.bombSite || '');
    const siteId: BombSiteId | null = rawSite === 'A' || rawSite === 'B' ? rawSite : null;
    const bombState: BombStateSnapshot | null =
      mode === 'bomb'
        ? {
            phase: bombPhase,
            siteId,
            carrierId,
            carrierName: carrierPlayer?.name ?? null,
            plantedBy: null,
            plantX: Number(raw?.bombX) || 0,
            plantY: Number(raw?.bombY) || 0,
            plantZ: Number(raw?.bombZ) || 0,
            detonateRemainingSec: Number(raw?.bombDetonateTimer) || 0,
            actionPlayerId: raw?.bombActionPlayerId ? String(raw.bombActionPlayerId) : null,
            actionType:
              raw?.bombActionType === 'plant' || raw?.bombActionType === 'defuse'
                ? raw.bombActionType
                : null,
            actionProgress: Number(raw?.bombActionProgress) || 0,
            roundWinner:
              raw?.roundWinner === 'blue' || raw?.roundWinner === 'red'
                ? raw.roundWinner
                : null,
            roundEndReason: raw?.roundEndReason ? String(raw.roundEndReason) : null,
            roundTransitionTimerSec: Number(raw?.roundTransitionTimer) || 0,
          }
        : null;

    return {
      roomCode: String(raw?.roomCode || room.roomId),
      roomName: String(raw?.roomName || 'Custom Match'),
      mapId: (raw?.mapId || 'urban') as MapId,
      mode,
      phase: (raw?.phase === 'playing' || raw?.phase === 'ended' ? raw.phase : 'lobby'),
      killLimit: Number(raw?.killLimit) || 30,
      timeLimit: Number(raw?.timeLimit) || 300,
      timeRemaining: Number(raw?.timeRemaining) || 0,
      respawnDelay: Number(raw?.respawnDelay) || 3,
      friendlyFire: Boolean(raw?.friendlyFire),
      botCount: Number(raw?.botCount) || 0,
      hasPassword: Boolean(raw?.hasPassword),
      hostId: String(raw?.hostId || ''),
      blueScore: Number(raw?.blueScore) || 0,
      redScore: Number(raw?.redScore) || 0,
      roundNumber: Number(raw?.roundNumber) || 1,
      roundsToWin: Number(raw?.roundsToWin) || 5,
      winner: (raw?.winner || '') as TeamId | 'draw' | '',
      winnerId: raw?.winnerId ? String(raw.winnerId) : undefined,
      winnerName: raw?.winnerName ? String(raw.winnerName) : undefined,
      bombState,
      players,
      localPlayerId: room.sessionId,
    };
  }
}
