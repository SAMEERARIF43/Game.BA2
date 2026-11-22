import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MAP_LIST } from '../src/maps/MapManager.ts';
import { CustomMatchMenu } from '../src/ui/CustomMatchMenu.tsx';
import { LobbyScreen } from '../src/ui/LobbyScreen.tsx';
import {
  MapPreview,
  MapTacticalBlueprint,
  MapViewModeToggle,
} from '../src/ui/MapPreview.tsx';
import { MapSelector } from '../src/ui/MapSelector.tsx';

function withWindowOriginStub<T>(fn: () => T): T {
  const g = globalThis as Record<string, unknown>;
  const prevWindow = g.window;
  const noop = () => {};
  g.window = {
    location: { origin: 'https://strikeforce.local' },
    addEventListener: noop,
    removeEventListener: noop,
    clearTimeout: noop,
    setTimeout: () => 1,
  };
  try {
    return fn();
  } finally {
    if (prevWindow === undefined) delete g.window;
    else g.window = prevWindow;
  }
}

test('Batch 21: MapPreview renders unique scenic SVG art and corner tactical blueprint for all registered maps', () => {
  const renderedArtSignatures = new Set<string>();

  for (const mapDef of MAP_LIST) {
    const cardHtml = renderToStaticMarkup(
      React.createElement(MapPreview, {
        mapId: mapDef.id,
        variant: 'card',
        viewMode: 'scenic',
        selected: mapDef.id === 'urban',
      })
    );

    assert.ok(cardHtml.includes(`data-map-preview="${mapDef.id}"`));
    assert.ok(cardHtml.includes(`data-map-art="${mapDef.id}"`));
    assert.ok(cardHtml.includes(`data-map-blueprint="${mapDef.id}"`), 'Scenic card should include corner blueprint');
    const strippedSvgXmlns = cardHtml.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '');
    assert.ok(!cardHtml.includes('<img'), 'Must use zero external <img> tags');
    assert.ok(
      !strippedSvgXmlns.includes('http://') && !strippedSvgXmlns.includes('https://'),
      'Must use zero external URLs'
    );
    renderedArtSignatures.add(cardHtml);

    const bannerHtml = renderToStaticMarkup(
      React.createElement(MapPreview, {
        mapId: mapDef.id,
        variant: 'banner',
        viewMode: 'scenic',
        showCornerBlueprint: false,
      })
    );
    assert.ok(bannerHtml.includes(`data-map-art="${mapDef.id}"`));
    assert.ok(!bannerHtml.includes(`data-map-blueprint="${mapDef.id}"`));
  }

  assert.strictEqual(
    renderedArtSignatures.size,
    MAP_LIST.length,
    'Every map must produce distinct scenic SVG artwork'
  );
});

test('Batch 21: Tactical Blueprint view displays team spawn zones and Bomb Sites A & B for every map', () => {
  for (const mapDef of MAP_LIST) {
    const tacticalHtml = renderToStaticMarkup(
      React.createElement(MapPreview, {
        mapId: mapDef.id,
        variant: 'card',
        viewMode: 'tactical',
      })
    );

    assert.ok(tacticalHtml.includes(`data-map-view-mode="tactical"`));
    assert.ok(tacticalHtml.includes(`data-map-blueprint="${mapDef.id}"`));
    assert.ok(tacticalHtml.includes('data-spawn-zone="blue"'));
    assert.ok(tacticalHtml.includes('data-spawn-zone="red"'));
    assert.ok(tacticalHtml.includes('BLUE SPAWN'));
    assert.ok(tacticalHtml.includes('RED SPAWN'));
    assert.ok(tacticalHtml.includes('data-bomb-site="A"'));
    assert.ok(tacticalHtml.includes('data-bomb-site="B"'));
    assert.ok(tacticalHtml.includes('BOMB SITE A'));
    assert.ok(tacticalHtml.includes('BOMB SITE B'));

    const standaloneBp = renderToStaticMarkup(
      React.createElement(MapTacticalBlueprint, { mapId: mapDef.id })
    );
    assert.ok(standaloneBp.includes('data-bomb-site="A"'));
    assert.ok(standaloneBp.includes('data-bomb-site="B"'));
  }
});

test('Batch 21: MapViewModeToggle and MapSelector render visual map cards with Scenic/Tactical switching', () => {
  const toggleHtml = renderToStaticMarkup(
    React.createElement(MapViewModeToggle, {
      value: 'tactical',
      onChange: () => {},
    })
  );
  assert.ok(toggleHtml.includes('Scenic View'));
  assert.ok(toggleHtml.includes('Tactical Blueprint (Sites A/B)'));

  const selectorHtml = renderToStaticMarkup(
    React.createElement(MapSelector, {
      selectedMapId: 'desert',
      onPreviewMap: () => {},
      onDeployMap: () => {},
      onBack: () => {},
    })
  );

  for (const [index, mapDef] of MAP_LIST.entries()) {
    assert.ok(selectorHtml.includes(`data-map-card="${mapDef.id}"`));
    assert.ok(selectorHtml.includes(`data-stagger-index="${index}"`));
    assert.ok(selectorHtml.includes(`animation-delay:${index * 75}ms`));
    assert.ok(selectorHtml.includes(`data-blueprint-inset="${mapDef.id}"`));
    assert.ok(selectorHtml.includes(`data-blueprint-details="${mapDef.id}"`));
    assert.ok(selectorHtml.includes(mapDef.name));
    assert.ok(selectorHtml.includes(mapDef.engagementRange));
  }
  assert.ok(selectorHtml.includes('map-card-enter'));
  assert.ok(selectorHtml.includes('blueprint-fade-in'));
  assert.ok(selectorHtml.includes('blueprint-inset-reveal'));
  assert.ok(selectorHtml.includes('SELECTED'));
  assert.ok(selectorHtml.includes('Scenic View'));
  assert.ok(selectorHtml.includes('Tactical Blueprint (Sites A/B)'));
});

test('Batch 21: CustomMatchMenu and LobbyScreen render interactive visual map card grids instead of plain selects', () => {
  withWindowOriginStub(() => {
    const customMenuHtml = renderToStaticMarkup(
      React.createElement(CustomMatchMenu, {
        initialMapId: 'industrial',
        initialCallsign: 'Vanguard-1',
        errorBanner: null,
        onCreateMatch: async () => {},
        onJoinMatch: async () => {},
        onLookupRoom: async () => ({
          roomCode: 'WAR482',
          roomName: 'Test',
          mapId: 'urban',
          phase: 'lobby',
          playerCount: 1,
          maxPlayers: 10,
          hasPassword: false,
        }),
        onBack: () => {},
      })
    );

    assert.ok(!customMenuHtml.includes('<select'), 'CustomMatchMenu should replace plain map dropdown with visual cards');
    for (const mapDef of MAP_LIST) {
      assert.ok(customMenuHtml.includes(`data-map-card="${mapDef.id}"`));
      assert.ok(customMenuHtml.includes(`data-map-preview="${mapDef.id}"`));
      assert.ok(customMenuHtml.includes(mapDef.name));
    }

    const hostLobbyHtml = renderToStaticMarkup(
      React.createElement(LobbyScreen, {
        lobby: {
          roomCode: 'STRK01',
          roomName: 'Tactical Scrim',
          hostId: 'p1',
          localPlayerId: 'p1',
          mapId: 'forest',
          mode: 'bomb',
          killLimit: 5,
          roundsToWin: 5,
          timeLimit: 90,
          friendlyFire: false,
          botCount: 4,
          phase: 'lobby',
          hasPassword: false,
          players: [
            {
              id: 'p1',
              name: 'HostOp',
              team: 'blue',
              isHost: true,
              isBot: false,
              ready: true,
            },
          ],
        },
        systemNotice: null,
        chatMessages: [],
        onSendChat: () => {},
        onUpdateConfig: () => {},
        onBalanceTeams: () => {},
        onKickPlayer: () => {},
        onStartMatch: () => {},
        onSwitchTeam: () => {},
        onToggleReady: () => {},
        onLeaveLobby: () => {},
      })
    );

    for (const mapDef of MAP_LIST) {
      assert.ok(hostLobbyHtml.includes(`data-map-card="${mapDef.id}"`));
      assert.ok(hostLobbyHtml.includes(`data-map-preview="${mapDef.id}"`));
    }
    assert.ok(hostLobbyHtml.includes('ACTIVE'));
    assert.ok(hostLobbyHtml.includes('Tactical Blueprint (Sites A/B)'));

    const guestLobbyHtml = renderToStaticMarkup(
      React.createElement(LobbyScreen, {
        lobby: {
          roomCode: 'STRK01',
          roomName: 'Tactical Scrim',
          hostId: 'p1',
          localPlayerId: 'p2',
          mapId: 'forest',
          mode: 'tdm',
          killLimit: 30,
          timeLimit: 300,
          friendlyFire: false,
          botCount: 4,
          phase: 'lobby',
          hasPassword: false,
          players: [
            {
              id: 'p1',
              name: 'HostOp',
              team: 'blue',
              isHost: true,
              isBot: false,
              ready: true,
            },
            {
              id: 'p2',
              name: 'GuestOp',
              team: 'red',
              isHost: false,
              isBot: false,
              ready: false,
            },
          ],
        },
        systemNotice: null,
        chatMessages: [],
        onSendChat: () => {},
        onUpdateConfig: () => {},
        onBalanceTeams: () => {},
        onKickPlayer: () => {},
        onStartMatch: () => {},
        onSwitchTeam: () => {},
        onToggleReady: () => {},
        onLeaveLobby: () => {},
      })
    );
    assert.ok(guestLobbyHtml.includes('Host Selected'));
    assert.ok(guestLobbyHtml.includes('disabled'));
  });
});
