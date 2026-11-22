/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMatchMachine } from './hooks/useMatchMachine';
import { isOfflineMatchStatus } from './match/matchMachine';
import { CustomMatchMenu } from './ui/CustomMatchMenu';
import { EndMatchScreen } from './ui/EndMatchScreen';
import { GameHUD } from './ui/GameHUD';
import { LoadingOverlay } from './ui/LoadingOverlay';
import { LobbyScreen } from './ui/LobbyScreen';
import { MainMenu } from './ui/MainMenu';
import { MapSelector } from './ui/MapSelector';
import { PauseMenu } from './ui/PauseMenu';

export default function App() {
  const { canvasRef, state, derived, actions } = useMatchMachine();
  const { status, selectedMapId, joinCode, settings, hud, contextLost, lobbySnapshot, disconnectError, systemNotice } =
    state;

  const isCustomMenuView = status === 'custom_menu' || status === 'mp_connecting';
  const isOfflineMatchView = isOfflineMatchStatus(status);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#0b0e13]">
      <canvas
        ref={canvasRef}
        className="block h-full w-full outline-none"
        tabIndex={0}
      />

      {contextLost && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0b0e13] p-6">
          <div className="max-w-md border border-white/15 bg-black/75 p-6 text-center">
            <h2 className="font-display text-xl font-semibold text-white">
              Graphics Context Interrupted
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              WebGL rendering was temporarily suspended by the browser. Reload the page if the viewport does not restore automatically.
            </p>
          </div>
        </div>
      )}

      {!contextLost && status === 'menu' && (
        <MainMenu
          selectedMapId={selectedMapId}
          selectedCharacterId={hud.selectedCharacterId}
          selectedGunId={hud.equippedGunId}
          knifeCharmId={hud.knifeCharmId}
          settings={settings}
          xp={hud.xp}
          onSelectCharacter={actions.selectCharacter}
          onSelectGun={actions.selectGun}
          onSelectKnifeCharm={actions.selectKnifeCharm}
          onPreviewMap={actions.previewMap}
          onPreviewShowcase={actions.previewShowcase}
          onPlayOfflineTdm={actions.playOfflineTdm}
          onOpenCustomMatch={actions.openCustomMatch}
          onOpenMapSelect={actions.openMapSelect}
          onQuickMatch={actions.quickMatch}
          onUpdateSettings={actions.updateSettings}
          onResetSettings={actions.resetSettings}
        />
      )}

      {!contextLost && status === 'maps' && (
        <MapSelector
          selectedMapId={selectedMapId}
          onPreviewMap={actions.previewMap}
          onDeployMap={actions.deployMap}
          onBack={actions.backToMenu}
        />
      )}

      {!contextLost && isCustomMenuView && (
        <CustomMatchMenu
          initialJoinCode={joinCode}
          initialMapId={selectedMapId}
          initialMode={settings.selectedGameMode}
          initialCallsign={settings.callsign}
          errorBanner={disconnectError}
          onCallsignChange={actions.updateCallsign}
          onCreateMatch={actions.createPrivateMatch}
          onCreateSoloCustom={actions.createSoloCustomLobby}
          onJoinMatch={actions.joinPrivateMatch}
          onLookupRoom={actions.lookupRoom}
          onBack={actions.backToMenu}
        />
      )}

      {!contextLost && (status === 'mp_lobby' || status === 'local_custom_lobby') && lobbySnapshot && (
        <LobbyScreen
          lobby={lobbySnapshot}
          systemNotice={systemNotice}
          chatMessages={derived.chatMessages}
          onSendChat={actions.sendChatMessage}
          onUpdateConfig={actions.updateRoomConfig}
          onBalanceTeams={actions.balanceRoomTeams}
          onKickPlayer={actions.kickRoomPlayer}
          onStartMatch={actions.startRoomMatch}
          onSwitchTeam={actions.switchRoomTeam}
          onToggleReady={actions.toggleRoomReady}
          onLeaveLobby={() => {
            if (lobbySnapshot.isLocalSolo) {
              actions.backToMenu();
            } else {
              void actions.leaveMultiplayer();
            }
          }}
        />
      )}

      {!contextLost && derived.isMultiplayerInMatch && lobbySnapshot && (
        <>
          <GameHUD
            hud={hud}
            showFps={settings.showFps}
            keybindings={settings.keybindings}
            crosshairSettings={settings.crosshair}
            teamColors={settings.teamColors}
            onSelectGun={actions.selectGun}
            onSelectKnifeCharm={actions.selectKnifeCharm}
            onRespawn={actions.respawnPlayer}
            isCustomMatch
            chatMessages={derived.chatMessages}
            chatOpen={derived.chatOpen}
            chatChannel={derived.chatChannel}
            onChangeChatChannel={actions.setChatChannel}
            onSendChat={actions.sendChatMessage}
            onCloseChat={actions.closeInMatchChat}
          />

          {status === 'mp_playing' && hud.match.phase === 'paused' && (
            <PauseMenu
              hud={hud}
              settings={settings}
              isMultiplayer
              onResume={actions.resumeMatch}
              onRestartMatch={actions.restartMatch}
              onLeaveToMenu={() => {
                void actions.leaveMultiplayer();
              }}
              onSelectCharacter={actions.selectCharacter}
              onSelectGun={actions.selectGun}
              onSelectKnifeCharm={actions.selectKnifeCharm}
              onUpdateSettings={actions.updateSettings}
              onResetSettings={actions.resetSettings}
            />
          )}

          {(status === 'mp_ended' || hud.match.phase === 'ended') && (
            <EndMatchScreen
              match={hud.match}
              playerStats={derived.postMatchStats}
              xp={hud.xp}
              sessionXpEarned={hud.sessionXpEarned}
              teamColors={settings.teamColors}
              localTeam={hud.localTeam}
              isMultiplayer
              isHost={derived.isMultiplayerHost}
              onPlayAgain={actions.restartMatch}
              onReturnToLobby={actions.returnToLobby}
              onReturnToMenu={() => {
                void actions.leaveMultiplayer();
              }}
            />
          )}
        </>
      )}

      {!contextLost && isOfflineMatchView && (
        <>
          <GameHUD
            hud={hud}
            showFps={settings.showFps}
            keybindings={settings.keybindings}
            crosshairSettings={settings.crosshair}
            teamColors={settings.teamColors}
            onSelectGun={actions.selectGun}
            onSelectKnifeCharm={actions.selectKnifeCharm}
            onRespawn={actions.respawnPlayer}
            isCustomMatch={derived.isCustomMatch}
            chatMessages={derived.chatMessages}
            chatOpen={derived.chatOpen}
            chatChannel={derived.chatChannel}
            onChangeChatChannel={actions.setChatChannel}
            onSendChat={actions.sendChatMessage}
            onCloseChat={actions.closeInMatchChat}
          />

          {status === 'offline_paused' && (
            <PauseMenu
              hud={hud}
              settings={settings}
              onResume={actions.resumeMatch}
              onRestartMatch={actions.restartMatch}
              onLeaveToMenu={actions.backToMenu}
              onSelectCharacter={actions.selectCharacter}
              onSelectGun={actions.selectGun}
              onSelectKnifeCharm={actions.selectKnifeCharm}
              onUpdateSettings={actions.updateSettings}
              onResetSettings={actions.resetSettings}
            />
          )}

          {status === 'offline_ended' && (
            <EndMatchScreen
              match={hud.match}
              playerStats={derived.postMatchStats}
              xp={hud.xp}
              sessionXpEarned={hud.sessionXpEarned}
              teamColors={settings.teamColors}
              localTeam={hud.localTeam}
              onPlayAgain={actions.restartMatch}
              onReturnToLobby={lobbySnapshot?.isLocalSolo ? actions.returnToLobby : undefined}
              onReturnToMenu={actions.backToMenu}
            />
          )}
        </>
      )}

      {!contextLost && derived.initProgress.active && (
        <LoadingOverlay
          title="STRIKE FORCE"
          detail="Preparing tactical 3D environment"
          stage={derived.initProgress.stage}
          progress={derived.initProgress.progress}
        />
      )}

      {!contextLost && !derived.initProgress.active && status === 'mp_connecting' && (
        <LoadingOverlay
          title="CONNECTING TO MATCH"
          detail="Establishing authoritative Colyseus session"
          stage={derived.connectStage ?? 'Connecting to server...'}
          onCancel={actions.cancelMpConnect}
        />
      )}
    </main>
  );
}
