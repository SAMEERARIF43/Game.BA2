import { Client, Room } from '@colyseus/sdk';
import { WeaponId } from '../game/types';
import { MapId, TeamId } from '../maps/types';
import {
  CreatePrivateMatchOptions,
  LobbyPlayerInfo,
  LobbyRoomSnapshot,
  NetworkDamagedEvent,
  NetworkHitConfirmEvent,
  NetworkKillFeedEvent,
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
  onSystemNotice: (message: string) => void;
  onDisconnected: (reason: string) => void;
}

function getColyseusEndpoint(): string {
  const custom = import.meta.env.VITE_COLYSEUS_URL as string | undefined;
  if (custom && custom.trim().length > 0) {
    return custom.trim();
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}`;
}

export class NetworkManager {
  private client: Client;
  private room: Room | null = null;
  private callbacks: NetworkManagerCallbacks;
  private intentionalLeave = false;

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

  public async lookupRoom(code: string): Promise<RoomLookupSummary> {
    const normalized = code.trim().toUpperCase();
    const res = await fetch(`/api/rooms/${encodeURIComponent(normalized)}`);
    const body = (await res.json()) as {
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

    const room = await this.client.create('match', options);
    this.attachRoomListeners(room);
    return this.extractSnapshot(room);
  }

  public async joinPrivateMatch(
    roomCode: string,
    playerName: string,
    password?: string
  ): Promise<LobbyRoomSnapshot> {
    await this.leaveRoom();
    this.intentionalLeave = false;

    const normalized = roomCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(normalized)) {
      throw new Error('Room code must be 6 letters or numbers.');
    }

    try {
      const room = await this.client.joinById(normalized, {
        playerName,
        password: password ?? '',
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

  public sendMove(
    x: number,
    y: number,
    z: number,
    rotY: number,
    pitch: number,
    weaponId: WeaponId
  ): void {
    this.room?.send('player_move', { x, y, z, rotY, pitch, weaponId });
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
  }): void {
    this.room?.send('player_fire', payload);
  }

  public async leaveRoom(): Promise<void> {
    const active = this.room;
    if (!active) return;
    this.intentionalLeave = true;
    this.room = null;
    try {
      await active.leave(true);
    } catch {
      // Ignore socket close error during explicit leave
    }
  }

  private attachRoomListeners(room: Room): void {
    this.room = room;

    room.onStateChange(() => {
      if (this.room !== room) return;
      this.callbacks.onStateUpdate(this.extractSnapshot(room));
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

    room.onMessage('system_notice', (msg: { message?: string }) => {
      if (msg?.message) {
        this.callbacks.onSystemNotice(msg.message);
      }
    });

    room.onMessage('kicked', (msg: { reason?: string }) => {
      this.intentionalLeave = true;
      this.room = null;
      this.callbacks.onDisconnected(msg?.reason || 'Removed from room by host.');
    });

    room.onLeave((code) => {
      if (this.room === room) {
        this.room = null;
      }
      if (!this.intentionalLeave) {
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
      winner?: string;
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
        weaponId: (p.weaponId === 'mp5' || p.weaponId === 'm1911' ? p.weaponId : 'm4a1') as WeaponId,
        health: Number(p.health) ?? 100,
        kills: Number(p.kills) || 0,
        deaths: Number(p.deaths) || 0,
      });
    });

    return {
      roomCode: String(raw?.roomCode || room.roomId),
      roomName: String(raw?.roomName || 'Custom Match'),
      mapId: (raw?.mapId || 'urban') as MapId,
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
      winner: (raw?.winner || '') as TeamId | 'draw' | '',
      players,
      localPlayerId: room.sessionId,
    };
  }
}
