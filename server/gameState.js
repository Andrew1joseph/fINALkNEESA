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
    return { title: '', subtitle: '', storyIntro: { title: '', paragraphs: [] }, questions: [] };
  }
}

function saveQuestions(data) {
  fs.writeFileSync(questionsPath, JSON.stringify(data, null, 2), 'utf8');
}

// Functions for persistent player data
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

class GameState {
  constructor() {
    this.persistedPlayersData = loadPlayersData();
    this.reset();
  }

  reset() {
    this.players = new Map();
    this.currentQuestionIndex = -1;
    this.gameStarted = false;
    this.gameFinished = false;
    this.timerStart = null;
    this.timerDuration = 30;
    this.questionActive = false;
    this.answers = new Map();
    // Initialize isOnline status for all persisted players
    for (const name of Object.keys(this.persistedPlayersData)) {
      this.persistedPlayersData[name].isOnline = false;
    }
    savePlayersData(this.persistedPlayersData);
  }

  loadQuestions() {
    const data = loadQuestions();
    this.title = data.title;
    this.subtitle = data.subtitle;
    this.storyIntro = data.storyIntro;
    this.questions = data.questions;
    return data;
  }

  saveQuestions() {
    saveQuestions({
      title: this.title,
      subtitle: this.subtitle,
      storyIntro: this.storyIntro,
      questions: this.questions
    });
  }

  addPlayer(socketId, name) {
    const persistedData = this.persistedPlayersData[name] || {};
    
    const player = {
      id: socketId,
      name: name,
      score: 0,
      correctAnswers: persistedData.correctAnswers || 0,
      wrongAnswers: persistedData.wrongAnswers || 0,
      totalScore: persistedData.totalScore || 0,
      answers: [],
      joinedAt: Date.now()
    };
    this.players.set(socketId, player);

    // Update online status
    this.persistedPlayersData[name] = {
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
      const correctCount = player.answers.filter(a => a.correct).length;
      const wrongCount = player.answers.filter(a => !a.correct).length;
      
      const existing = this.persistedPlayersData[player.name] || {};
      this.persistedPlayersData[player.name] = {
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
    this.answers.delete(socketId);
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
      currentQuestionIndex: this.currentQuestionIndex + 1,
      totalQuestions: this.questions.length
    }));
  }

  getLeaderboard() {
    const allPlayersMap = new Map();
    
    // Add persisted players (may be offline)
    for (const [name, data] of Object.entries(this.persistedPlayersData)) {
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
    
    // Add/update with current online players
    for (const player of this.players.values()) {
      const existing = allPlayersMap.get(player.name) || {
        name: player.name,
        totalScore: 0,
        correctAnswers: 0,
        wrongAnswers: 0,
        isOnline: false,
        lastSeen: null
      };
      existing.currentSessionScore = player.score;
      existing.isOnline = true;
      // Merge correct/wrong from persisted + current session
      existing.correctAnswers = (this.persistedPlayersData[player.name]?.correctAnswers || 0);
      existing.wrongAnswers = (this.persistedPlayersData[player.name]?.wrongAnswers || 0);
      allPlayersMap.set(player.name, existing);
    }
    
    const sortedPlayers = Array.from(allPlayersMap.values())
      .sort((a, b) => {
        const scoreA = a.totalScore + a.currentSessionScore;
        const scoreB = b.totalScore + b.currentSessionScore;
        return scoreB - scoreA;
      })
      .map((p, index) => ({
        rank: index + 1,
        name: p.name,
        currentSessionScore: p.currentSessionScore,
        totalScore: p.totalScore + p.currentSessionScore,
        correctAnswers: p.correctAnswers,
        wrongAnswers: p.wrongAnswers,
        isOnline: p.isOnline,
        lastSeen: p.lastSeen,
        isCurrentSession: this.players.has(Array.from(this.players.values()).find(x => x.name === p.name)?.id || '')
      }));
    
    return sortedPlayers;
  }

  startGame() {
    this.loadQuestions();
    this.gameStarted = true;
    this.gameFinished = false;
    this.currentQuestionIndex = -1;
    this.answers = new Map();
    for (const [, player] of this.players) {
      player.score = 0;
      player.answers = [];
    }
  }

  nextQuestion() {
    this.currentQuestionIndex++;
    if (this.currentQuestionIndex >= this.questions.length) {
      this.gameFinished = true;
      this.questionActive = false;
      return null;
    }
    this.questionActive = true;
    this.timerStart = Date.now();
    this.answers = new Map();
    return this.questions[this.currentQuestionIndex];
  }

  getCurrentQuestion() {
    if (this.currentQuestionIndex < 0 || this.currentQuestionIndex >= this.questions.length) {
      return null;
    }
    return this.questions[this.currentQuestionIndex];
  }

  submitAnswer(socketId, answer, timeRemaining) {
    if (!this.questionActive) return { correct: false, points: 0, explanation: '' };
    if (this.answers.has(socketId)) return { correct: false, points: 0, explanation: 'Already answered' };

    const question = this.getCurrentQuestion();
    if (!question) return { correct: false, points: 0, explanation: '' };

    const result = this.checkAnswer(question, answer);
    const timeBonus = Math.floor(timeRemaining * 2);
    const points = result.correct ? 100 + timeBonus : 0;

    this.answers.set(socketId, { answer, correct: result.correct, points, timeRemaining });

    const player = this.players.get(socketId);
    if (player) {
      player.score += points;
      player.answers.push({
        questionId: question.id,
        correct: result.correct,
        points: points,
        timeRemaining: timeRemaining
      });
      
      if (result.correct) {
        player.correctAnswers++;
      } else {
        player.wrongAnswers++;
      }
    }

    return {
      correct: result.correct,
      points: points,
      explanation: question.explanation,
      correctAnswer: result.correctAnswer
    };
  }

  checkAnswer(question, answer) {
    switch (question.type) {
      case 'multiple-choice':
        return {
          correct: answer === question.correctAnswer,
          correctAnswer: question.correctAnswer
        };
      case 'true-false':
        return {
          correct: answer === question.correctAnswer,
          correctAnswer: question.correctAnswer
        };
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

  endQuestion() {
    this.questionActive = false;
  }

  getProgress() {
    return {
      current: this.currentQuestionIndex + 1,
      total: this.questions.length,
      percentage: Math.round(((this.currentQuestionIndex + 1) / this.questions.length) * 100)
    };
  }

  getResults(socketId) {
    const player = this.players.get(socketId);
    if (!player) return null;
    const leaderboard = this.getLeaderboard();
    const rank = leaderboard.find(p => p.name === player.name);
    const correctCount = player.answers.filter(a => a.correct).length;
    const totalQuestions = player.answers.length;
    return {
      name: player.name,
      score: player.score,
      rank: rank ? rank.rank : 0,
      totalPlayers: leaderboard.length,
      correctCount,
      totalQuestions,
      percentage: totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0,
      answers: player.answers
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
}

module.exports = { GameState, loadQuestions, saveQuestions, loadPlayersData, savePlayersData };
