const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const os = require('os');
const path = require('path');
const { GameState } = require('./gameState');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 60000
});

const gameState = new GameState();
const EXPLANATION_DELAY = 5000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

function sanitizeQuestion(question) {
  const sanitized = { ...question };
  delete sanitized.correctAnswer;
  delete sanitized.correctOrder;
  delete sanitized.acceptedAnswers;
  if (sanitized.type === 'matching') {
    sanitized.shuffledRight = question.pairs
      .map((p, i) => ({ text: p.right, originalIndex: i }))
      .sort(() => Math.random() - 0.5);
  }
  if (sanitized.type === 'ordering') {
    const indices = question.items.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    sanitized.shuffledOrder = indices;
  }
  return sanitized;
}

function sendPlayerNextQuestion(socket) {
  const question = gameState.nextPlayerQuestion(socket.id);
  if (!question) {
    // This player is done with all questions
    const player = gameState.getPlayer(socket.id);
    socket.emit('game:playerFinished', {
      score: player ? player.score : 0
    });
    // Check if all players are done
    if (gameState.allPlayersFinished()) {
      io.emit('game:finished');
      console.log('[GAME] Game finished — all players done');
    }
    return;
  }
  const sanitized = sanitizeQuestion(question);
  const progress = gameState.getPlayerProgress(socket.id);
  socket.emit('game:question', {
    question: sanitized,
    progress: progress,
    timerDuration: gameState.timerDuration
  });
  const total = gameState.shuffledQuestions ? gameState.shuffledQuestions.length : 0;
  console.log(`[QUESTION] Player ${socket.id} -> #${progress.current}/${progress.total} (${question.type}) [${question.category}]`);
}

const PORT = process.env.PORT || 3000;
let localIP = '';

server.listen(PORT, () => {
  localIP = getLocalIP();
  console.log('========================================');
  console.log('  TruthLens Server Running');
  console.log('========================================');
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://${localIP}:${PORT}`);
  console.log(`  Admin:   http://${localIP}:${PORT}/admin.html`);
  console.log('========================================');
});

io.on('connection', (socket) => {
  console.log(`[CONNECT] ${socket.id}`);

  socket.on('player:join', (data) => {
    let name, sessionName;
    if (typeof data === 'object') {
      name = data.name;
      sessionName = data.session;
    } else {
      name = data;
      sessionName = null;
    }
    
    if (!name || String(name).trim().length === 0) {
      socket.emit('player:joinError', 'يرجى إدخال اسم صالح');
      return;
    }
    
    // Set session if provided
    if (sessionName && String(sessionName).trim().length > 0) {
      gameState.setSession(String(sessionName).trim());
    }
    
    const player = gameState.addPlayer(socket.id, String(name).trim());
    socket.emit('player:joined', { 
      name: player.name, 
      score: player.score,
      session: gameState.getSession()
    });
    io.emit('leaderboard:update', gameState.getLeaderboard(gameState.getSession()));
    io.emit('players:update', gameState.getPlayerList());
    io.emit('admin:sessionsUpdate', gameState.getAllSessionsLeaderboard());
    console.log(`[JOIN] ${player.name} joined session "${gameState.getSession()}"`);

    // If game is already in progress, send first question to this player
    if (gameState.gameStarted && !player.finished) {
      setTimeout(() => sendPlayerNextQuestion(socket), 500);
    }
  });

  socket.on('game:getIntro', () => {
    gameState.loadQuestions();
    socket.emit('game:intro', gameState.storyIntro);
  });

  socket.on('game:start', () => {
    gameState.startGame();
    io.emit('game:started', { 
      totalQuestions: gameState.shuffledQuestions ? gameState.shuffledQuestions.length : 0,
      session: gameState.getSession()
    });
    io.emit('leaderboard:update', gameState.getLeaderboard(gameState.getSession()));
    console.log(`[GAME] Game started in session "${gameState.getSession()}"`);
    // Send first question to each player individually
    for (const [socketId, player] of gameState.players) {
      const s = io.sockets.sockets.get(socketId);
      if (s && !player.finished) {
        setTimeout(() => sendPlayerNextQuestion(s), 1000);
      }
    }
  });

  socket.on('game:answer', (data) => {
    const { answer, timeRemaining } = data;
    const result = gameState.submitAnswer(socket.id, answer, timeRemaining || 0);
    socket.emit('game:answerResult', result);

    // Update leaderboard after each answer
    io.emit('leaderboard:update', gameState.getLeaderboard(gameState.getSession()));
    io.emit('players:update', gameState.getPlayerList());

    // Show explanation then auto-advance this player
    const question = gameState.getPlayerCurrentQuestion(socket.id);
    if (question) {
      socket.emit('game:questionEnd', {
        correctAnswer: question.correctAnswer,
        correctOrder: question.correctOrder,
        explanation: question.explanation
      });
    }

    // Auto-advance this player after explanation delay
    setTimeout(() => {
      sendPlayerNextQuestion(socket);
    }, EXPLANATION_DELAY);
  });

  socket.on('game:endQuestion', () => {
    // Admin ends the current question for ALL active players
    for (const [socketId, player] of gameState.players) {
      if (player.questionActive) {
        const question = gameState.endPlayerQuestion(socketId);
        if (question) {
          const s = io.sockets.sockets.get(socketId);
          if (s) {
            s.emit('game:questionEnd', {
              correctAnswer: question.correctAnswer,
              correctOrder: question.correctOrder,
              explanation: question.explanation
            });
            // Auto-advance this player
            setTimeout(() => {
              sendPlayerNextQuestion(s);
            }, EXPLANATION_DELAY);
          }
        }
      }
    }
    io.emit('leaderboard:update', gameState.getLeaderboard(gameState.getSession()));
    io.emit('players:update', gameState.getPlayerList());
  });

  socket.on('game:timerExpired', () => {
    // Player's timer expired — end question for this player only
    const question = gameState.endPlayerQuestion(socket.id);
    if (question) {
      socket.emit('game:questionEnd', {
        correctAnswer: question.correctAnswer,
        correctOrder: question.correctOrder,
        explanation: question.explanation
      });

      // Auto-advance this player after explanation delay
      setTimeout(() => {
        sendPlayerNextQuestion(socket);
      }, EXPLANATION_DELAY);

      io.emit('leaderboard:update', gameState.getLeaderboard(gameState.getSession()));
      io.emit('players:update', gameState.getPlayerList());
    }
  });

  socket.on('player:cheatWarning', (data) => {
    const player = gameState.getPlayer(socket.id);
    const playerName = player ? player.name : 'لاعب مجهول';
    const warningMsg = {
      playerName: playerName,
      warnings: data.warnings,
      maxWarnings: 3,
      timestamp: Date.now()
    };
    io.emit('admin:cheatWarning', warningMsg);
    console.log(`[CHEAT] ${playerName} — تحذير ${data.warnings}/3`);
  });

  socket.on('game:getResults', () => {
    const results = gameState.getResults(socket.id);
    socket.emit('game:results', results);
  });

  socket.on('game:reset', () => {
    gameState.reset();
    gameState.loadQuestions();
    io.emit('game:reset');
    io.emit('leaderboard:update', gameState.getLeaderboard(gameState.getSession()));
    io.emit('players:update', gameState.getPlayerList());
    io.emit('admin:sessionsUpdate', gameState.getAllSessionsLeaderboard());
    console.log('[GAME] Game reset');
  });

  socket.on('leaderboard:get', () => {
    socket.emit('leaderboard:update', gameState.getLeaderboard(gameState.getSession()));
  });

  // Admin: Set session
  socket.on('admin:setSession', (sessionName) => {
    if (!sessionName || String(sessionName).trim().length === 0) {
      socket.emit('admin:error', 'يرجى إدخال اسم الجلسة');
      return;
    }
    gameState.setSession(String(sessionName).trim());
    io.emit('admin:sessionChanged', gameState.getSession());
    io.emit('leaderboard:update', gameState.getLeaderboard(gameState.getSession()));
    io.emit('players:update', gameState.getPlayerList());
    io.emit('admin:sessionsUpdate', gameState.getAllSessionsLeaderboard());
    console.log(`[ADMIN] Session set to "${gameState.getSession()}"`);
  });

  // Admin: Get all sessions data
  socket.on('admin:getSessions', () => {
    socket.emit('admin:sessionsUpdate', gameState.getAllSessionsLeaderboard());
  });

  // Admin: Get current session
  socket.on('admin:getCurrentSession', () => {
    socket.emit('admin:currentSession', gameState.getSession());
  });

  socket.on('admin:getQuestions', () => {
    gameState.loadQuestions();
    socket.emit('admin:questions', gameState.questions);
    socket.emit('admin:categories', gameState.categories);
  });

  socket.on('admin:addQuestion', (questionData) => {
    const newQ = gameState.addQuestion(questionData);
    io.emit('admin:questions', gameState.questions);
    console.log(`[ADMIN] Question added: #${newQ.id}`);
  });

  socket.on('admin:updateQuestion', ({ id, data }) => {
    const updated = gameState.updateQuestion(id, data);
    if (updated) {
      io.emit('admin:questions', gameState.questions);
      console.log(`[ADMIN] Question updated: #${id}`);
    }
  });

  socket.on('admin:deleteQuestion', (id) => {
    const deleted = gameState.deleteQuestion(id);
    if (deleted) {
      io.emit('admin:questions', gameState.questions);
      console.log(`[ADMIN] Question deleted: #${id}`);
    }
  });

  // Admin: Update category name
  socket.on('admin:updateCategory', ({ id, name }) => {
    const updated = gameState.updateCategory(id, name);
    if (updated) {
      io.emit('admin:categories', gameState.categories);
      console.log(`[ADMIN] Category updated: ${id} -> ${name}`);
    }
  });

  socket.on('admin:getPlayers', () => {
    socket.emit('players:update', gameState.getPlayerList());
  });

  socket.on('admin:getQR', async () => {
    try {
      const url = `http://${localIP}:${PORT}`;
      const qrDataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2 });
      socket.emit('admin:qr', { url, qr: qrDataUrl });
    } catch (err) {
      socket.emit('admin:qr', { url: `http://${localIP}:${PORT}`, qr: null });
    }
  });

  socket.on('disconnect', () => {
    const player = gameState.getPlayer(socket.id);
    if (player) {
      console.log(`[DISCONNECT] ${player.name}`);
    }
    gameState.removePlayer(socket.id);
    io.emit('leaderboard:update', gameState.getLeaderboard(gameState.getSession()));
    io.emit('players:update', gameState.getPlayerList());
    io.emit('admin:sessionsUpdate', gameState.getAllSessionsLeaderboard());
  });
});

app.get('/api/qr', async (req, res) => {
  try {
    const url = `http://${localIP}:${PORT}`;
    const qrDataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2 });
    res.json({ url, qr: qrDataUrl });
  } catch (err) {
    res.json({ url: `http://${localIP}:${PORT}`, qr: null });
  }
});

app.get('/api/questions', (req, res) => {
  gameState.loadQuestions();
  res.json(gameState.questions);
});

app.get('/api/categories', (req, res) => {
  gameState.loadQuestions();
  res.json(gameState.categories);
});

app.post('/api/questions', (req, res) => {
  const newQ = gameState.addQuestion(req.body);
  res.json(newQ);
});

app.put('/api/questions/:id', (req, res) => {
  const updated = gameState.updateQuestion(parseInt(req.params.id), req.body);
  if (updated) res.json(updated);
  else res.status(404).json({ error: 'Question not found' });
});

app.delete('/api/questions/:id', (req, res) => {
  const deleted = gameState.deleteQuestion(parseInt(req.params.id));
  if (deleted) res.json({ success: true });
  else res.status(404).json({ error: 'Question not found' });
});
