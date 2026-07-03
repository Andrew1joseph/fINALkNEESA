const fs = require('fs');
const path = require('path');

const questionsPath = path.join(__dirname, '..', 'data', 'questions.json');
const playersDataPath = path.join(__dirname, '..', 'data', 'players.json');

function loadQuestions() {
  try {
    const raw = fs.readFileSync(questionsPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load questions:', err.message);
    return { title: '', subtitle: '', categories: [], storyIntro: { title: '', paragraphs: [] }, questions: [] };
  }
}

function saveQuestions(data) {
  fs.writeFileSync(questionsPath, JSON.stringify(data, null, 2), 'utf8');
}

function loadPlayersData() {
  try {
    if (fs.existsSync(playersDataPath)) {
      const raw = fs.readFileSync(playersDataPath, 'utf8');
      return JSON.parse(raw);
    }
    return {};
  } catch (err) {
    console.error('Failed to load players data:', err.message);
    return {};
  }
}

function savePlayersData(data) {
  try {
    fs.writeFileSync(playersDataPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save players data:', err.message);
  }
}

function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

class GameState {
  constructor() {
    this.persistedPlayersData = loadPlayersData();
    this.currentSession = null;
    this.reset();
  }

  reset() {
    this.players = new Map();
    // Game-level state (for admin tracking, not for driving questions)
    this.gameStarted = false;
    this.gameFinished = false;
    this.timerDuration = 30;
    // Keep question-level tracking for admin reference (which question the game is on globally)
    this.currentQuestionIndex = -1;
    this.shuffledQuestions = null;
    if (this.currentSession && this.persistedPlayersData[this.currentSession]) {
      for (const name of Object.keys(this.persistedPlayersData[this.currentSession])) {
        this.persistedPlayersData[this.currentSession][name].isOnline = false;
      }
      savePlayersData(this.persistedPlayersData);
    }
  }

  loadQuestions() {
    const data = loadQuestions();
    this.title = data.title;
    this.subtitle = data.subtitle;
    this.storyIntro = data.storyIntro;
    this.categories = data.categories || [];
    this.questions = data.questions;
    return data;
  }

  saveQuestions() {
    saveQuestions({
      title: this.title,
      subtitle: this.subtitle,
      categories: this.categories,
      storyIntro: this.storyIntro,
      questions: this.questions
    });
  }

  getOrderedQuestions() {
    if (!this.questions || this.questions.length === 0) return [];
    const categoryOrder = (this.categories || [])
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(c => c.id);
    const grouped = {};
    for (const q of this.questions) {
      const cat = q.category || 'غير مصنف';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(q);
    }
    const ordered = [];
    for (const catId of categoryOrder) {
      if (grouped[catId]) {
        const shuffled = shuffleArray(grouped[catId]);
        ordered.push(...shuffled);
      }
    }
    for (const catId of Object.keys(grouped)) {
      if (!categoryOrder.includes(catId)) {
        const shuffled = shuffleArray(grouped[catId]);
        ordered.push(...shuffled);
      }
    }
    return ordered;
  }

  setSession(sessionName) {
    this.currentSession = sessionName;
    if (!this.persistedPlayersData[sessionName]) {
      this.persistedPlayersData[sessionName] = {};
      savePlayersData(this.persistedPlayersData);
    }
  }

  getSession() {
    return this.currentSession;
  }

  getAllSessions() {
    return Object.keys(this.persistedPlayersData);
  }

  addPlayer(socketId, name) {
    const sessionKey = this.currentSession || 'default';
    if (!this.persistedPlayersData[sessionKey]) {
      this.persistedPlayersData[sessionKey] = {};
    }
    const persistedData = this.persistedPlayersData[sessionKey][name] || {};
    const player = {
      id: socketId,
      name: name,
      score: 0,
      correctAnswers: persistedData.correctAnswers || 0,
      wrongAnswers: persistedData.wrongAnswers || 0,
      totalScore: persistedData.totalScore || 0,
      answers: [],
      joinedAt: Date.now(),
      session: sessionKey,
      // Per-player independent question state
      currentQuestionIndex: -1,
      shuffledQuestions: null,
      questionActive: false,
      timerStart: null,
      finished: false
    };
    // If game is already in progress, initialize this player's shuffled questions
    if (this.gameStarted) {
      player.shuffledQuestions = this.getOrderedQuestions();
      player.currentQuestionIndex = -1;
      player.questionActive = false;
      player.finished = false;
    }
    this.players.set(socketId, player);
    this.persistedPlayersData[sessionKey][name] = {
      ...persistedData,
      name: name,
      correctAnswers: persistedData.correctAnswers || 0,
      wrongAnswers: persistedData.wrongAnswers || 0,
      totalScore: persistedData.totalScore || 0,
      isOnline: true,
      lastSeen: Date.now()
    };
    savePlayersData(this.persistedPlayersData);
    return player;
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (player) {
      const sessionKey = player.session || this.currentSession || 'default';
      const correctCount = player.answers.filter(a => a.correct).length;
      const wrongCount = player.answers.filter(a => !a.correct).length;
      if (!this.persistedPlayersData[sessionKey]) {
        this.persistedPlayersData[sessionKey] = {};
      }
      const existing = this.persistedPlayersData[sessionKey][player.name] || {};
      this.persistedPlayersData[sessionKey][player.name] = {
        name: player.name,
        correctAnswers: (existing.correctAnswers || 0) + correctCount,
        wrongAnswers: (existing.wrongAnswers || 0) + wrongCount,
        totalScore: (existing.totalScore || 0) + player.score,
        isOnline: false,
        lastSeen: Date.now(),
        lastSessionScore: player.score
      };
      savePlayersData(this.persistedPlayersData);
    }
    this.players.delete(socketId);
  }

  getPlayer(socketId) {
    return this.players.get(socketId);
  }

  getPlayerList() {
    return Array.from(this.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      score: p.score,
      correctAnswers: p.correctAnswers,
      wrongAnswers: p.wrongAnswers,
      totalScore: p.totalScore,
      isOnline: true,
      currentQuestionIndex: p.currentQuestionIndex + 1,
      totalQuestions: p.shuffledQuestions ? p.shuffledQuestions.length : (this.shuffledQuestions ? this.shuffledQuestions.length : 0),
      finished: p.finished || false
    }));
  }

  getLeaderboard(sessionName) {
    const sessionKey = sessionName || this.currentSession || 'default';
    const allPlayersMap = new Map();
    const sessionData = this.persistedPlayersData[sessionKey] || {};
    for (const [name, data] of Object.entries(sessionData)) {
      allPlayersMap.set(name, {
        name: data.name,
        totalScore: data.totalScore || 0,
        correctAnswers: data.correctAnswers || 0,
        wrongAnswers: data.wrongAnswers || 0,
        currentSessionScore: 0,
        isOnline: data.isOnline || false,
        lastSeen: data.lastSeen || null
      });
    }
    for (const player of this.players.values()) {
      if (player.session !== sessionKey) continue;
      const existing = allPlayersMap.get(player.name) || {
        name: player.name, totalScore: 0, correctAnswers: 0, wrongAnswers: 0, isOnline: false, lastSeen: null
      };
      existing.currentSessionScore = player.score;
      existing.isOnline = true;
      existing.correctAnswers = (this.persistedPlayersData[sessionKey]?.[player.name]?.correctAnswers || 0);
      existing.wrongAnswers = (this.persistedPlayersData[sessionKey]?.[player.name]?.wrongAnswers || 0);
      allPlayersMap.set(player.name, existing);
    }
    return Array.from(allPlayersMap.values())
      .sort((a, b) => (b.totalScore + b.currentSessionScore) - (a.totalScore + a.currentSessionScore))
      .map((p, index) => ({
        rank: index + 1, name: p.name, currentSessionScore: p.currentSessionScore,
        totalScore: p.totalScore + p.currentSessionScore, correctAnswers: p.correctAnswers,
        wrongAnswers: p.wrongAnswers, isOnline: p.isOnline, lastSeen: p.lastSeen,
        isCurrentSession: this.players.has(Array.from(this.players.values()).find(x => x.name === p.name && x.session === sessionKey)?.id || '')
      }));
  }

  getAllSessionsLeaderboard() {
    const result = {};
    for (const sessionName of Object.keys(this.persistedPlayersData)) {
      result[sessionName] = this.getLeaderboard(sessionName);
    }
    return result;
  }

  startGame() {
    this.loadQuestions();
    this.shuffledQuestions = this.getOrderedQuestions();
    this.gameStarted = true;
    this.gameFinished = false;
    this.currentQuestionIndex = -1;
    // Initialize each player's independent question state
    for (const [, player] of this.players) {
      player.score = 0;
      player.answers = [];
      player.shuffledQuestions = this.getOrderedQuestions(); // Each player gets their own shuffle
      player.currentQuestionIndex = -1;
      player.questionActive = false;
      player.timerStart = null;
      player.finished = false;
    }
  }

  // Advance a specific player to their next question (independent of others)
  nextPlayerQuestion(socketId) {
    const player = this.players.get(socketId);
    if (!player) return null;
    if (!player.shuffledQuestions) return null;

    player.currentQuestionIndex++;
    if (player.currentQuestionIndex >= player.shuffledQuestions.length) {
      player.finished = true;
      player.questionActive = false;
      return null; // Player is done
    }

    player.questionActive = true;
    player.timerStart = Date.now();
    // Also update the game-level tracker for admin reference
    this.currentQuestionIndex = Math.max(this.currentQuestionIndex, player.currentQuestionIndex);
    return player.shuffledQuestions[player.currentQuestionIndex];
  }

  // Get the current question for a specific player
  getPlayerCurrentQuestion(socketId) {
    const player = this.players.get(socketId);
    if (!player || !player.shuffledQuestions) return null;
    if (player.currentQuestionIndex < 0 || player.currentQuestionIndex >= player.shuffledQuestions.length) {
      return null;
    }
    return player.shuffledQuestions[player.currentQuestionIndex];
  }

  // Submit answer for a specific player
  submitAnswer(socketId, answer, timeRemaining) {
    const player = this.players.get(socketId);
    if (!player || !player.questionActive) return { correct: false, points: 0, explanation: '' };

    const question = this.getPlayerCurrentQuestion(socketId);
    if (!question) return { correct: false, points: 0, explanation: '' };

    // Check if player already answered this question
    const alreadyAnswered = player.answers.find(a => a.questionId === question.id);
    if (alreadyAnswered) return { correct: false, points: 0, explanation: 'Already answered' };

    const result = this.checkAnswer(question, answer);
    const timeBonus = Math.floor(timeRemaining * 2);
    const points = result.correct ? 100 + timeBonus : 0;

    player.answers.push({ questionId: question.id, correct: result.correct, points, timeRemaining });
    player.score += points;
    if (result.correct) player.correctAnswers++;
    else player.wrongAnswers++;

    // Mark question as no longer active for this player
    player.questionActive = false;

    return { correct: result.correct, points, explanation: question.explanation, correctAnswer: result.correctAnswer, correctOrder: question.correctOrder };
  }

  // End the current question for a specific player (timer expired)
  endPlayerQuestion(socketId) {
    const player = this.players.get(socketId);
    if (!player || !player.questionActive) return null;
    player.questionActive = false;
    const question = this.getPlayerCurrentQuestion(socketId);
    return question;
  }

  // Check if all players have finished
  allPlayersFinished() {
    for (const [, player] of this.players) {
      if (!player.finished) return false;
    }
    return true;
  }

  // Get progress for a specific player
  getPlayerProgress(socketId) {
    const player = this.players.get(socketId);
    if (!player || !player.shuffledQuestions) {
      const total = this.shuffledQuestions ? this.shuffledQuestions.length : (this.questions ? this.questions.length : 0);
      return { current: 0, total: total, percentage: 0 };
    }
    const total = player.shuffledQuestions.length;
    return {
      current: player.currentQuestionIndex + 1,
      total: total,
      percentage: total > 0 ? Math.round(((player.currentQuestionIndex + 1) / total) * 100) : 0
    };
  }

  checkAnswer(question, answer) {
    switch (question.type) {
      case 'multiple-choice':
        return { correct: answer === question.correctAnswer, correctAnswer: question.correctAnswer };
      case 'true-false':
        return { correct: answer === question.correctAnswer, correctAnswer: question.correctAnswer };
      case 'fill-blank': {
        const normalized = String(answer).trim().toLowerCase();
        const accepted = question.acceptedAnswers || [question.correctAnswer];
        const match = accepted.some(a => String(a).trim().toLowerCase() === normalized);
        return { correct: match, correctAnswer: question.correctAnswer };
      }
      case 'matching': {
        if (!Array.isArray(answer)) return { correct: false, correctAnswer: null };
        const correct = question.pairs.every((pair, i) => {
          const ans = answer.find(a => a.leftIndex === i);
          return ans && ans.rightIndex === i;
        });
        return { correct, correctAnswer: question.pairs.map((p, i) => ({ left: i, right: i })) };
      }
      case 'ordering': {
        if (!Array.isArray(answer)) return { correct: false, correctAnswer: null };
        const correct = answer.every((val, idx) => val === question.correctOrder[idx]);
        return { correct, correctAnswer: question.correctOrder };
      }
      default:
        return { correct: false, correctAnswer: null };
    }
  }

  // Legacy method - end question (now per-player, kept for compatibility)
  endQuestion() {
    // This is no longer used for the global flow, but kept for API compatibility
  }

  getProgress() {
    const total = this.shuffledQuestions ? this.shuffledQuestions.length : (this.questions ? this.questions.length : 0);
    return {
      current: this.currentQuestionIndex + 1,
      total: total,
      percentage: total > 0 ? Math.round(((this.currentQuestionIndex + 1) / total) * 100) : 0
    };
  }

  getResults(socketId) {
    const player = this.players.get(socketId);
    if (!player) return null;
    const leaderboard = this.getLeaderboard(this.currentSession);
    const rank = leaderboard.find(p => p.name === player.name);
    const correctCount = player.answers.filter(a => a.correct).length;
    const totalQuestions = player.answers.length;
    return {
      name: player.name, score: player.score, rank: rank ? rank.rank : 0,
      totalPlayers: leaderboard.length, correctCount, totalQuestions,
      percentage: totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0,
      answers: player.answers, session: player.session || this.currentSession
    };
  }

  addQuestion(questionData) {
    this.loadQuestions();
    const maxId = this.questions.reduce((max, q) => Math.max(max, q.id), 0);
    const newQuestion = { id: maxId + 1, ...questionData };
    this.questions.push(newQuestion);
    this.saveQuestions();
    return newQuestion;
  }

  updateQuestion(id, questionData) {
    this.loadQuestions();
    const index = this.questions.findIndex(q => q.id === id);
    if (index === -1) return null;
    this.questions[index] = { id, ...questionData };
    this.saveQuestions();
    return this.questions[index];
  }

  deleteQuestion(id) {
    this.loadQuestions();
    const index = this.questions.findIndex(q => q.id === id);
    if (index === -1) return false;
    this.questions.splice(index, 1);
    this.saveQuestions();
    return true;
  }

  updateCategory(categoryId, newName) {
    this.loadQuestions();
    const cat = this.categories.find(c => c.id === categoryId);
    if (cat) {
      cat.name = newName;
      this.saveQuestions();
      return cat;
    }
    return null;
  }
}

module.exports = { GameState, loadQuestions, saveQuestions, loadPlayersData, savePlayersData };
