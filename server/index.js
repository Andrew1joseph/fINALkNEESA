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
let autoAdvanceTimer = null;

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

function clearAutoAdvance() {
  if (autoAdvanceTimer) {
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }
}

function sendNextQuestion() {
  const question = gameState.nextQuestion();
  if (!question) {
    io.emit('game:finished');
    console.log('[GAME] Game finished — all questions done');
    return;
  }
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
  io.emit('game:question', {
    question: sanitized,
    progress: gameState.getProgress(),
    timerDuration: gameState.timerDuration
  });
  console.log(`[QUESTION] #${gameState.currentQuestionIndex + 1}/${gameState.questions.length} (${question.type})`);
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

  socket.on('player:join', (name) => {
    if (!name || String(name).trim().length === 0) {
      socket.emit('player:joinError', 'يرجى إدخال اسم صالح');
      return;
    }
    const player = gameState.addPlayer(socket.id, String(name).trim());
    socket.emit('player:joined', { name: player.name, score: player.score });
    io.emit('leaderboard:update', gameState.getLeaderboard());
    io.emit('players:update', gameState.getPlayerList());
    console.log(`[JOIN] ${player.name} joined the game`);
  });

  socket.on('game:getIntro', () => {
    gameState.loadQuestions();
    socket.emit('game:intro', gameState.storyIntro);
  });

  socket.on('game:start', () => {
    clearAutoAdvance();
    gameState.startGame();
    io.emit('game:started', { totalQuestions: gameState.questions.length });
    io.emit('leaderboard:update', gameState.getLeaderboard());
    console.log('[GAME] Game started');
    autoAdvanceTimer = setTimeout(() => {
      sendNextQuestion();
    }, 1000);
  });

  socket.on('game:answer', (data) => {
    const { answer, timeRemaining } = data;
    const result = gameState.submitAnswer(socket.id, answer, timeRemaining || 0);
    socket.emit('game:answerResult', result);

    const question = gameState.getCurrentQuestion();
    const answerCount = gameState.answers.size;
    const playerCount = gameState.players.size;

    io.emit('game:answerCount', { answered: answerCount, total: playerCount });

    if (answerCount >= playerCount && playerCount > 0) {
      endCurrentQuestion(question);
    }
  });

  socket.on('game:endQuestion', () => {
    const question = gameState.getCurrentQuestion();
    if (question && gameState.questionActive) {
      endCurrentQuestion(question);
    }
  });

  socket.on('game:timerExpired', () => {
    const question = gameState.getCurrentQuestion();
    if (question && gameState.questionActive) {
      endCurrentQuestion(question);
    }
  });

  function endCurrentQuestion(question) {
    if (!gameState.questionActive) return;
    gameState.endQuestion();
    clearAutoAdvance();

    io.emit('game:questionEnd', {
      correctAnswer: question.correctAnswer,
      correctOrder: question.correctOrder,
      explanation: question.explanation
    });
    io.emit('leaderboard:update', gameState.getLeaderboard());
    console.log('[QUESTION] Question ended — auto-advancing in 5s');

    autoAdvanceTimer = setTimeout(() => {
      sendNextQuestion();
    }, EXPLANATION_DELAY);
  }

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
    clearAutoAdvance();
    gameState.reset();
    gameState.loadQuestions();
    io.emit('game:reset');
    io.emit('leaderboard:update', gameState.getLeaderboard());
    io.emit('players:update', gameState.getPlayerList());
    console.log('[GAME] Game reset');
  });

  socket.on('leaderboard:get', () => {
    socket.emit('leaderboard:update', gameState.getLeaderboard());
  });

  socket.on('admin:getQuestions', () => {
    gameState.loadQuestions();
    socket.emit('admin:questions', gameState.questions);
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
    io.emit('leaderboard:update', gameState.getLeaderboard());
    io.emit('players:update', gameState.getPlayerList());
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
