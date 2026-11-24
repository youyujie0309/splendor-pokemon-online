const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

const { COLORS, ALL_BALLS, BALL_META, CARDS, CARD_BY_ID, EVOLVES_FROM } = require('../shared/cards');
const { createGame, performAction, sanitizeGameForPlayer } = require('./gameEngine');
const { chooseBotAction } = require('./botAI');

const PORT = Number(process.env.PORT) || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 15000,
  pingTimeout: 25000
});

// Cache local Pokémon artwork aggressively for instant mobile loading
app.use(
  '/assets',
  express.static(path.join(__dirname, '../public/assets'), {
    maxAge: '7d',
    immutable: true
  })
);
app.use(express.static(path.join(__dirname, '../public')));

app.get('/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size, uptime: Math.floor(process.uptime()) });
});

app.get('/api/meta', (_req, res) => {
  res.json({
    colors: COLORS,
    allBalls: ALL_BALLS,
    ballMeta: BALL_META,
    cards: CARDS,
    cardById: CARD_BY_ID,
    evolvesFrom: EVOLVES_FROM
  });
});

// ==================== ROOM MANAGEMENT ====================
const rooms = new Map(); // roomCode -> Room
const socketToSession = new Map(); // socket.id -> { roomCode, playerId }

const BOT_PROFILES = [
  { name: '小智 AI', avatar: 25 },
  { name: '小霞 AI', avatar: 7 },
  { name: '小刚 AI', avatar: 74 },
  { name: '大木博士 AI', avatar: 1 }
];

function generateRoomCode() {
  let code;
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (rooms.has(code));
  return code;
}

function makeId(prefix = 'p') {
  return `${prefix}_${crypto.randomBytes(5).toString('hex')}`;
}

function getLobbySummary() {
  const list = [];
  for (const room of rooms.values()) {
    if (!room.settings.isPublic) continue;
    if (room.status === 'FINISHED') continue;
    const humanCount = room.members.filter((m) => !m.isBot).length;
    if (humanCount === 0) continue;
    list.push({
      code: room.code,
      hostName: room.members.find((m) => m.id === room.hostId)?.name || '训练家',
      playerCount: room.members.length,
      maxPlayers: room.settings.maxPlayers,
      turnTimer: room.settings.turnTimer,
      targetScore: room.settings.targetScore,
      status: room.status,
      createdAt: room.createdAt
    });
  }
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

function broadcastLobby() {
  io.to('lobby').emit('lobby:update', getLobbySummary());
}

function sanitizeRoomForMember(room, viewerPlayerId) {
  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    settings: { ...room.settings },
    members: room.members.map((m) => ({
      id: m.id,
      name: m.name,
      avatar: m.avatar,
      isBot: m.isBot,
      connected: m.isBot ? true : Boolean(m.socketId),
      isHost: m.id === room.hostId
    })),
    game: room.game ? sanitizeGameForPlayer(room.game, viewerPlayerId) : null
  };
}

function broadcastRoomState(room) {
  for (const m of room.members) {
    if (!m.isBot && m.socketId) {
      io.to(m.socketId).emit('room:state', sanitizeRoomForMember(room, m.id));
    }
  }
}

function clearRoomTimers(room) {
  if (room.botTimeout) {
    clearTimeout(room.botTimeout);
    room.botTimeout = null;
  }
  if (room.turnTimeout) {
    clearTimeout(room.turnTimeout);
    room.turnTimeout = null;
  }
}

function scheduleNextAutomation(room) {
  clearRoomTimers(room);
  if (!room.game || room.game.status !== 'PLAYING') return;

  const currentPlayer = room.game.players[room.game.currentPlayerIndex];
  if (!currentPlayer) return;

  if (currentPlayer.isBot) {
    room.botTimeout = setTimeout(() => {
      if (!rooms.has(room.code) || !room.game || room.game.status !== 'PLAYING') return;
      const cur = room.game.players[room.game.currentPlayerIndex];
      if (!cur || !cur.isBot) return;
      const action = chooseBotAction(room.game, cur.id);
      if (action) {
        const res = performAction(room.game, cur.id, action);
        if (res.ok) {
          if (room.game.status === 'FINISHED') {
            room.status = 'FINISHED';
            broadcastLobby();
          }
          broadcastRoomState(room);
          scheduleNextAutomation(room);
        }
      }
    }, 850);
    return;
  }

  // Human turn timer (if enabled)
  const seconds = room.settings.turnTimer;
  if (seconds > 0) {
    room.turnTimeout = setTimeout(() => {
      if (!rooms.has(room.code) || !room.game || room.game.status !== 'PLAYING') return;
      const cur = room.game.players[room.game.currentPlayerIndex];
      if (!cur || cur.id !== currentPlayer.id) return;
      const fallback = chooseBotAction(room.game, cur.id);
      if (fallback) {
        const res = performAction(room.game, cur.id, fallback);
        if (res.ok) {
          room.game.logs.push({
            id: (room.game.logs[room.game.logs.length - 1]?.id || 0) + 1,
            time: Date.now(),
            text: `⏰ ${cur.name} 回合超时，系统已自动代打`,
            type: 'system'
          });
          if (room.game.status === 'FINISHED') {
            room.status = 'FINISHED';
            broadcastLobby();
          }
          broadcastRoomState(room);
          scheduleNextAutomation(room);
        }
      }
    }, (seconds + 1) * 1000);
  }
}

function cleanupRoomIfEmpty(room) {
  const anyConnectedHuman = room.members.some((m) => !m.isBot && m.socketId);
  const anyHuman = room.members.some((m) => !m.isBot);

  if (!anyHuman) {
    clearRoomTimers(room);
    rooms.delete(room.code);
    broadcastLobby();
    return;
  }

  // If all humans disconnected, schedule GC after 10 minutes so mobile refreshes survive
  if (!anyConnectedHuman && !room.gcTimeout) {
    room.gcTimeout = setTimeout(() => {
      const r = rooms.get(room.code);
      if (!r) return;
      const stillEmpty = !r.members.some((m) => !m.isBot && m.socketId);
      if (stillEmpty) {
        clearRoomTimers(r);
        rooms.delete(r.code);
        broadcastLobby();
      }
    }, 10 * 60 * 1000);
  }
}

function cancelGc(room) {
  if (room.gcTimeout) {
    clearTimeout(room.gcTimeout);
    room.gcTimeout = null;
  }
}

function detachSocketFromCurrentRoom(socket, voluntaryLeave = false) {
  const sess = socketToSession.get(socket.id);
  if (!sess) return;
  socketToSession.delete(socket.id);

  const room = rooms.get(sess.roomCode);
  if (!room) return;
  socket.leave(`room:${room.code}`);

  const memberIdx = room.members.findIndex((m) => m.id === sess.playerId);
  if (memberIdx === -1) return;
  const member = room.members[memberIdx];

  if (voluntaryLeave && room.status === 'WAITING') {
    room.members.splice(memberIdx, 1);
    if (room.hostId === member.id) {
      const nextHuman = room.members.find((m) => !m.isBot);
      room.hostId = nextHuman ? nextHuman.id : null;
    }
    broadcastRoomState(room);
    cleanupRoomIfEmpty(room);
    broadcastLobby();
  } else if (voluntaryLeave && room.status === 'FINISHED') {
    room.members.splice(memberIdx, 1);
    if (room.hostId === member.id) {
      const nextHuman = room.members.find((m) => !m.isBot);
      room.hostId = nextHuman ? nextHuman.id : null;
    }
    broadcastRoomState(room);
    cleanupRoomIfEmpty(room);
  } else {
    // Playing or accidental disconnect: keep seat for reconnection!
    if (member.socketId === socket.id) {
      member.socketId = null;
    }
    broadcastRoomState(room);
    cleanupRoomIfEmpty(room);
  }
}

// ==================== SOCKET EVENTS ====================
io.on('connection', (socket) => {
  socket.join('lobby');
  socket.emit('lobby:update', getLobbySummary());

  socket.on('lobby:refresh', () => {
    socket.emit('lobby:update', getLobbySummary());
  });

  // Create room
  socket.on('room:create', (payload = {}, cb = () => {}) => {
    try {
      detachSocketFromCurrentRoom(socket, true);
      const name = String(payload.name || '').trim().slice(0, 14) || '训练家';
      const avatar = Number(payload.avatar) || 25;
      const clientToken = String(payload.clientToken || makeId('tok'));
      const maxPlayers = Math.min(4, Math.max(2, Number(payload.maxPlayers) || 4));
      const turnTimer = [0, 30, 60].includes(Number(payload.turnTimer)) ? Number(payload.turnTimer) : 0;
      const targetScore = [15, 18, 21].includes(Number(payload.targetScore)) ? Number(payload.targetScore) : 18;
      const isPublic = payload.isPublic !== false;

      const code = generateRoomCode();
      const playerId = makeId('p');
      const room = {
        code,
        status: 'WAITING',
        hostId: playerId,
        createdAt: Date.now(),
        settings: { maxPlayers, turnTimer, targetScore, isPublic },
        members: [
          {
            id: playerId,
            name,
            avatar,
            clientToken,
            isBot: false,
            socketId: socket.id
          }
        ],
        game: null,
        botTimeout: null,
        turnTimeout: null,
        gcTimeout: null
      };

      rooms.set(code, room);
      socket.leave('lobby');
      socket.join(`room:${code}`);
      socketToSession.set(socket.id, { roomCode: code, playerId });

      broadcastLobby();
      broadcastRoomState(room);
      cb({ ok: true, code, playerId, room: sanitizeRoomForMember(room, playerId) });
    } catch (err) {
      cb({ ok: false, error: err.message || '创建房间失败' });
    }
  });

  // Quick solo practice room vs AI
  socket.on('room:practice', (payload = {}, cb = () => {}) => {
    try {
      detachSocketFromCurrentRoom(socket, true);
      const name = String(payload.name || '').trim().slice(0, 14) || '训练家';
      const avatar = Number(payload.avatar) || 25;
      const clientToken = String(payload.clientToken || makeId('tok'));
      const botCount = Math.min(3, Math.max(1, Number(payload.botCount) || 1));

      const code = generateRoomCode();
      const playerId = makeId('p');
      const members = [
        { id: playerId, name, avatar, clientToken, isBot: false, socketId: socket.id }
      ];
      for (let i = 0; i < botCount; i++) {
        const bp = BOT_PROFILES[i % BOT_PROFILES.length];
        members.push({
          id: makeId('bot'),
          name: bp.name,
          avatar: bp.avatar,
          clientToken: null,
          isBot: true,
          socketId: null
        });
      }

      const room = {
        code,
        status: 'PLAYING',
        hostId: playerId,
        createdAt: Date.now(),
        settings: { maxPlayers: members.length, turnTimer: 0, targetScore: 18, isPublic: false },
        members,
        game: createGame(members, { targetScore: 18, turnTimer: 0 }),
        botTimeout: null,
        turnTimeout: null,
        gcTimeout: null
      };

      rooms.set(code, room);
      socket.leave('lobby');
      socket.join(`room:${code}`);
      socketToSession.set(socket.id, { roomCode: code, playerId });

      broadcastRoomState(room);
      scheduleNextAutomation(room);
      cb({ ok: true, code, playerId, room: sanitizeRoomForMember(room, playerId) });
    } catch (err) {
      cb({ ok: false, error: err.message || '开启练习失败' });
    }
  });

  // Join or reconnect to existing room
  socket.on('room:join', (payload = {}, cb = () => {}) => {
    try {
      const code = String(payload.code || '').trim();
      const name = String(payload.name || '').trim().slice(0, 14) || '训练家';
      const avatar = Number(payload.avatar) || 25;
      const clientToken = String(payload.clientToken || '');

      const room = rooms.get(code);
      if (!room) {
        return cb({ ok: false, error: '未找到该房间号，请确认房间号是否正确' });
      }

      // Check reconnection via clientToken
      const existing = clientToken
        ? room.members.find((m) => !m.isBot && m.clientToken === clientToken)
        : null;

      if (existing) {
        detachSocketFromCurrentRoom(socket, false);
        cancelGc(room);
        existing.socketId = socket.id;
        if (room.status === 'WAITING') {
          existing.name = name;
          existing.avatar = avatar;
        }
        socket.leave('lobby');
        socket.join(`room:${code}`);
        socketToSession.set(socket.id, { roomCode: code, playerId: existing.id });
        broadcastRoomState(room);
        return cb({
          ok: true,
          reconnected: true,
          code,
          playerId: existing.id,
          room: sanitizeRoomForMember(room, existing.id)
        });
      }

      if (room.status !== 'WAITING') {
        return cb({ ok: false, error: '该房间对局已开始，无法中途加入' });
      }
      if (room.members.length >= room.settings.maxPlayers) {
        return cb({ ok: false, error: '房间人数已满' });
      }

      detachSocketFromCurrentRoom(socket, true);
      cancelGc(room);
      const playerId = makeId('p');
      room.members.push({
        id: playerId,
        name,
        avatar,
        clientToken: clientToken || makeId('tok'),
        isBot: false,
        socketId: socket.id
      });

      socket.leave('lobby');
      socket.join(`room:${code}`);
      socketToSession.set(socket.id, { roomCode: code, playerId });

      broadcastLobby();
      broadcastRoomState(room);
      cb({ ok: true, code, playerId, room: sanitizeRoomForMember(room, playerId) });
    } catch (err) {
      cb({ ok: false, error: err.message || '加入房间失败' });
    }
  });

  // Update settings (host only, WAITING)
  socket.on('room:settings', (payload = {}, cb = () => {}) => {
    const sess = socketToSession.get(socket.id);
    if (!sess) return cb({ ok: false, error: '不在房间中' });
    const room = rooms.get(sess.roomCode);
    if (!room || room.hostId !== sess.playerId || room.status !== 'WAITING') {
      return cb({ ok: false, error: '仅房主可在准备阶段修改设置' });
    }
    if (payload.maxPlayers !== undefined) {
      const mp = Math.min(4, Math.max(2, Number(payload.maxPlayers)));
      if (mp >= room.members.length) room.settings.maxPlayers = mp;
    }
    if (payload.turnTimer !== undefined && [0, 30, 60].includes(Number(payload.turnTimer))) {
      room.settings.turnTimer = Number(payload.turnTimer);
    }
    if (payload.targetScore !== undefined && [15, 18, 21].includes(Number(payload.targetScore))) {
      room.settings.targetScore = Number(payload.targetScore);
    }
    if (payload.isPublic !== undefined) {
      room.settings.isPublic = Boolean(payload.isPublic);
    }
    broadcastLobby();
    broadcastRoomState(room);
    cb({ ok: true });
  });

  // Add AI bot (host only)
  socket.on('room:add_bot', (_payload, cb = () => {}) => {
    const sess = socketToSession.get(socket.id);
    if (!sess) return cb({ ok: false, error: '不在房间中' });
    const room = rooms.get(sess.roomCode);
    if (!room || room.hostId !== sess.playerId || room.status !== 'WAITING') {
      return cb({ ok: false, error: '仅房主可添加 AI 机器人' });
    }
    if (room.members.length >= room.settings.maxPlayers) {
      return cb({ ok: false, error: '房间人数已满' });
    }
    const usedNames = new Set(room.members.map((m) => m.name));
    const profile = BOT_PROFILES.find((b) => !usedNames.has(b.name)) || {
      name: `训练家AI ${room.members.length}`,
      avatar: 133
    };
    room.members.push({
      id: makeId('bot'),
      name: profile.name,
      avatar: profile.avatar,
      clientToken: null,
      isBot: true,
      socketId: null
    });
    broadcastLobby();
    broadcastRoomState(room);
    cb({ ok: true });
  });

  // Remove bot or kick seat (host only)
  socket.on('room:remove_member', ({ memberId } = {}, cb = () => {}) => {
    const sess = socketToSession.get(socket.id);
    if (!sess) return cb({ ok: false, error: '不在房间中' });
    const room = rooms.get(sess.roomCode);
    if (!room || room.hostId !== sess.playerId || room.status !== 'WAITING') {
      return cb({ ok: false, error: '无权限移除成员' });
    }
    if (memberId === room.hostId) return cb({ ok: false, error: '不能移除房主' });
    const idx = room.members.findIndex((m) => m.id === memberId);
    if (idx === -1) return cb({ ok: false, error: '成员不存在' });
    const [removed] = room.members.splice(idx, 1);
    if (!removed.isBot && removed.socketId) {
      io.to(removed.socketId).emit('room:kicked', { reason: '你已被房主移出房间' });
      const targetSock = io.sockets.sockets.get(removed.socketId);
      if (targetSock) {
        targetSock.leave(`room:${room.code}`);
        targetSock.join('lobby');
        socketToSession.delete(removed.socketId);
      }
    }
    broadcastLobby();
    broadcastRoomState(room);
    cb({ ok: true });
  });

  // Start game (host only)
  socket.on('room:start', (_payload, cb = () => {}) => {
    const sess = socketToSession.get(socket.id);
    if (!sess) return cb({ ok: false, error: '不在房间中' });
    const room = rooms.get(sess.roomCode);
    if (!room || room.hostId !== sess.playerId) {
      return cb({ ok: false, error: '仅房主可以开始游戏' });
    }
    if (room.members.length < 2) {
      return cb({ ok: false, error: '至少需要 2 名玩家才能开局（可添加 AI 补位）' });
    }

    // Randomize starting order for fairness
    const order = [...room.members];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    room.status = 'PLAYING';
    room.game = createGame(order, {
      targetScore: room.settings.targetScore,
      turnTimer: room.settings.turnTimer
    });

    broadcastLobby();
    broadcastRoomState(room);
    scheduleNextAutomation(room);
    cb({ ok: true });
  });

  // Rematch (host only, after FINISHED)
  socket.on('room:rematch', (_payload, cb = () => {}) => {
    const sess = socketToSession.get(socket.id);
    if (!sess) return cb({ ok: false, error: '不在房间中' });
    const room = rooms.get(sess.roomCode);
    if (!room || room.hostId !== sess.playerId) {
      return cb({ ok: false, error: '仅房主可开启下一局' });
    }
    clearRoomTimers(room);
    room.status = 'WAITING';
    room.game = null;
    broadcastLobby();
    broadcastRoomState(room);
    cb({ ok: true });
  });

  // Leave room
  socket.on('room:leave', (_payload, cb = () => {}) => {
    detachSocketFromCurrentRoom(socket, true);
    socket.join('lobby');
    socket.emit('lobby:update', getLobbySummary());
    cb({ ok: true });
  });

  // Game action
  socket.on('game:action', (action = {}, cb = () => {}) => {
    const sess = socketToSession.get(socket.id);
    if (!sess) return cb({ ok: false, error: '不在房间中' });
    const room = rooms.get(sess.roomCode);
    if (!room || !room.game) return cb({ ok: false, error: '对局未开始' });

    const res = performAction(room.game, sess.playerId, action);
    if (!res.ok) {
      return cb(res);
    }

    if (room.game.status === 'FINISHED') {
      room.status = 'FINISHED';
      broadcastLobby();
    }
    broadcastRoomState(room);
    scheduleNextAutomation(room);
    cb({ ok: true });
  });

  // Quick emote/chat reaction in room
  socket.on('room:emote', ({ text } = {}) => {
    const sess = socketToSession.get(socket.id);
    if (!sess) return;
    const room = rooms.get(sess.roomCode);
    if (!room) return;
    const member = room.members.find((m) => m.id === sess.playerId);
    if (!member) return;
    const clean = String(text || '').trim().slice(0, 30);
    if (!clean) return;
    io.to(`room:${room.code}`).emit('room:emote', {
      playerId: member.id,
      playerName: member.name,
      text: clean
    });
  });

  socket.on('disconnect', () => {
    detachSocketFromCurrentRoom(socket, false);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎮 璀璨宝石：宝可梦 联机服务器已启动: http://0.0.0.0:${PORT}`);
});
