const socket = io();
let questions = [];
let players = [];
let gameActive = false;
let cheatWarningsLog = [];

function switchTab(tabName) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`panel-${tabName}`).classList.add('active');
}

function showToast(message, type) {
  type = type || 'info';
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease-in forwards';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

/* ========== GAME CONTROLS ========== */
function startGame() {
  socket.emit('game:start');
  showToast('بدأت اللعبة! الأسئلة ستم تلقائياً', 'success');
}

function endQuestion() {
  socket.emit('game:endQuestion');
  showToast('تم إنهاء السؤال مبكراً', 'info');
}

function resetGame() {
  if (confirm('هل أنت متأكد من إعادة تعيين اللعبة؟ سيتم مسح جميع النتائج.')) {
    socket.emit('game:reset');
    showToast('تم إعادة تعيين اللعبة', 'info');
  }
}

/* ========== GAME STATE UPDATES ========== */
socket.on('game:started', () => {
  gameActive = true;
  updateGameState('running', 'اللعبة جارية');
  document.getElementById('startGameBtn').disabled = true;
  document.getElementById('endQuestionBtn').disabled = false;
});

socket.on('game:question', (data) => {
  document.getElementById('currentQuestionNum').textContent = data.progress.current;
  document.getElementById('endQuestionBtn').disabled = false;
});

socket.on('game:questionEnd', () => {
  document.getElementById('endQuestionBtn').disabled = true;
});

socket.on('game:finished', () => {
  gameActive = false;
  updateGameState('finished', 'انتهت اللعبة');
  document.getElementById('startGameBtn').disabled = false;
  document.getElementById('endQuestionBtn').disabled = true;
});

socket.on('game:reset', () => {
  gameActive = false;
  updateGameState('idle', 'لم تبدأ بعد');
  document.getElementById('startGameBtn').disabled = false;
  document.getElementById('endQuestionBtn').disabled = true;
  document.getElementById('currentQuestionNum').textContent = '-';
});

function updateGameState(state, text) {
  const indicator = document.getElementById('gameStateIndicator');
  const dot = indicator.querySelector('.state-dot');
  dot.className = `state-dot ${state}`;
  document.getElementById('gameStateText').textContent = text;
}

/* ========== CHEAT WARNINGS ========== */
socket.on('admin:cheatWarning', (data) => {
  cheatWarningsLog.unshift(data);
  if (cheatWarningsLog.length > 20) cheatWarningsLog.pop();
  renderCheatWarnings();
  showToast(`⚠️ تنبيه غش: ${data.playerName} — تحذير ${data.warnings}/3`, 'error');
});

function renderCheatWarnings() {
  const container = document.getElementById('cheatWarningsList');
  if (cheatWarningsLog.length === 0) {
    container.innerHTML = '<p class="text-muted text-center">لا توجد تنبيهات حتى الآن</p>';
    return;
  }
  container.innerHTML = cheatWarningsLog.map(w => {
    const time = new Date(w.timestamp).toLocaleTimeString('ar-EG');
    let statusText = '';
    let statusClass = '';
    if (w.warnings >= w.maxWarnings) {
      statusText = '🚫 مُقصى';
      statusClass = 'cheat-disqualified';
    } else {
      statusText = `تحذير ${w.warnings}/${w.maxWarnings}`;
      statusClass = 'cheat-warning';
    }
    return `
      <div class="cheat-item ${statusClass}">
        <div class="cheat-name">${w.playerName}</div>
        <div class="cheat-status">${statusText}</div>
        <div class="cheat-time">${time}</div>
      </div>
    `;
  }).join('');
}

/* ========== LEADERBOARD ========== */
socket.on('leaderboard:update', (leaderboard) => {
  renderAdminLeaderboard(leaderboard);
});

function renderAdminLeaderboard(leaderboard) {
  const container = document.getElementById('adminLeaderboard');
  if (!leaderboard || leaderboard.length === 0) {
    container.innerHTML = '<p class="text-muted text-center">لا يوجد لاعبون حتى الآن</p>';
    return;
  }
  
  const topThree = leaderboard.slice(0, 3);
  const restPlayers = leaderboard.slice(3);
  
  function statusBadge(isOnline) {
    return isOnline
      ? '<span class="online-badge">اونلاين</span>'
      : '<span class="offline-badge">اوفلاين</span>';
  }
  
  let html = '<div class="leaderboard-section">';
  html += '<div class="leaderboard-title">🏆 أفضل 3 لاعبين</div>';
  html += topThree.map((entry, idx) => `
    <div class="leaderboard-item top-three rank-${idx + 1}">
      <div class="lb-medal">
        <span class="medal">
          ${idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
        </span>
      </div>
      <div class="lb-info">
        <div class="lb-name-wrap">
          <span class="lb-name">${entry.rank}. ${entry.name}</span>
          ${statusBadge(entry.isOnline)}
        </div>
        <div class="lb-details">
          <span class="lb-detail">النقاط: <strong>${entry.totalScore}</strong></span>
          <span class="lb-detail">✓ ${entry.correctAnswers}</span>
          <span class="lb-detail">✗ ${entry.wrongAnswers}</span>
        </div>
      </div>
      <div class="lb-score">${entry.totalScore}</div>
    </div>
  `).join('');
  html += '</div>';
  
  if (restPlayers.length > 0) {
    html += '<div class="leaderboard-section">';
    html += '<div class="leaderboard-title">📊 باقي اللاعبين</div>';
    html += restPlayers.map(entry => `
      <div class="leaderboard-item">
        <div class="lb-rank">${entry.rank}</div>
        <div class="lb-info">
          <div class="lb-name-wrap">
            <span class="lb-name">${entry.name}</span>
            ${statusBadge(entry.isOnline)}
          </div>
          <div class="lb-details">
            <span class="lb-detail">✓ ${entry.correctAnswers}</span>
            <span class="lb-detail">✗ ${entry.wrongAnswers}</span>
          </div>
        </div>
        <div class="lb-score">${entry.totalScore}</div>
      </div>
    `).join('');
    html += '</div>';
  }
  
  container.innerHTML = html;
}

/* ========== PLAYERS ========== */
socket.on('players:update', (playerList) => {
  players = playerList;
  document.getElementById('connectedPlayersCount').textContent = playerList.length;
  document.getElementById('playerCountLabel').textContent = playerList.length;
  renderPlayersList(playerList);
});

function renderPlayersList(playerList) {
  const container = document.getElementById('playersList');
  if (!playerList || playerList.length === 0) {
    container.innerHTML = '<p class="text-muted text-center">لا يوجد لاعبون متصلون</p>';
    return;
  }
  container.innerHTML = playerList.map(p => `
    <div class="player-item">
      <div class="player-avatar">${p.name.charAt(0).toUpperCase()}</div>
      <div class="player-info">
        <div class="player-name-wrap">
          <span class="player-name">${p.name}</span>
          <span class="online-badge">اونلاين</span>
        </div>
        <div class="player-stats">
          <span class="stat-badge">السؤال: ${p.currentQuestionIndex}/${p.totalQuestions}</span>
          <span class="stat-badge correct">✓ ${p.correctAnswers}</span>
          <span class="stat-badge wrong">✗ ${p.wrongAnswers}</span>
        </div>
      </div>
      <div class="player-score">${p.score} نقطة</div>
    </div>
  `).join('');
}

/* ========== QUESTIONS CRUD ========== */
socket.on('admin:questions', (qs) => {
  questions = qs;
  document.getElementById('totalQuestionsCount').textContent = qs.length;
  document.getElementById('questionCountLabel').textContent = qs.length;
  renderQuestionsList(qs);
});

function renderQuestionsList(qs) {
  const container = document.getElementById('questionsList');
  if (!qs || qs.length === 0) {
    container.innerHTML = '<p class="text-muted text-center">لا توجد أسئلة حتى الآن. أضف بعض الأسئلة!</p>';
    return;
  }
  const typeLabels = {
    'multiple-choice': 'اختيار',
    'true-false': 'ص/خطأ',
    'fill-blank': 'فراغ',
    'matching': 'تطابق',
    'ordering': 'ترتيب'
  };
  container.innerHTML = qs.map(q => `
    <div class="question-item">
      <div class="qi-number">${q.id}</div>
      <div class="qi-content">
        <span class="qi-type">${typeLabels[q.type] || q.type}</span>
        <span class="qi-category">${q.category}</span>
        <div class="qi-text">${q.question}</div>
      </div>
      <div class="qi-actions">
        <button class="qi-btn" onclick="editQuestion(${q.id})" title="تعديل">✏️</button>
        <button class="qi-btn delete" onclick="deleteQuestion(${q.id})" title="حذف">🗑️</button>
      </div>
    </div>
  `).join('');
}

/* ========== QUESTION FORM ========== */
function showAddForm() {
  document.getElementById('questionForm').style.display = 'block';
  document.getElementById('formTitle').textContent = 'إضافة سؤال جديد';
  document.getElementById('editQuestionId').value = '';
  clearForm();
  updateFormFields();
  document.getElementById('questionForm').scrollIntoView({ behavior: 'smooth' });
}

function cancelForm() {
  document.getElementById('questionForm').style.display = 'none';
  clearForm();
}

function clearForm() {
  document.getElementById('qType').value = 'multiple-choice';
  document.getElementById('qCategory').value = '';
  document.getElementById('qText').value = '';
  document.getElementById('qExplanation').value = '';
  document.querySelectorAll('.mc-option').forEach(el => el.value = '');
  document.getElementById('mcCorrect').value = '0';
  document.getElementById('tfCorrect').value = 'true';
  document.getElementById('fbCorrect').value = '';
  document.getElementById('fbAlternatives').value = '';
  document.getElementById('matchPairs').value = '';
  document.getElementById('orderItems').value = '';
}

function updateFormFields() {
  const type = document.getElementById('qType').value;
  document.getElementById('mcFields').style.display = type === 'multiple-choice' ? 'block' : 'none';
  document.getElementById('tfFields').style.display = type === 'true-false' ? 'block' : 'none';
  document.getElementById('fbFields').style.display = type === 'fill-blank' ? 'block' : 'none';
  document.getElementById('matchFields').style.display = type === 'matching' ? 'block' : 'none';
  document.getElementById('orderFields').style.display = type === 'ordering' ? 'block' : 'none';
}

function saveQuestion() {
  const type = document.getElementById('qType').value;
  const category = document.getElementById('qCategory').value.trim();
  const questionText = document.getElementById('qText').value.trim();
  const explanation = document.getElementById('qExplanation').value.trim();

  if (!questionText) { showToast('نص السؤال مطلوب', 'error'); return; }
  if (!category) { showToast('التصنيف مطلوب', 'error'); return; }

  let questionData = { type, category, question: questionText, explanation };

  switch (type) {
    case 'multiple-choice': {
      const options = [];
      document.querySelectorAll('.mc-option').forEach(el => options.push(el.value.trim()));
      if (options.some(o => !o)) { showToast('جميع الخيارات مطلوبة', 'error'); return; }
      questionData.options = options;
      questionData.correctAnswer = parseInt(document.getElementById('mcCorrect').value);
      break;
    }
    case 'true-false': {
      questionData.correctAnswer = document.getElementById('tfCorrect').value === 'true';
      break;
    }
    case 'fill-blank': {
      const mainAnswer = document.getElementById('fbCorrect').value.trim();
      if (!mainAnswer) { showToast('الإجابة الصحيحة مطلوبة', 'error'); return; }
      questionData.correctAnswer = mainAnswer;
      const altText = document.getElementById('fbAlternatives').value.trim();
      questionData.acceptedAnswers = [mainAnswer];
      if (altText) {
        altText.split(',').map(a => a.trim()).filter(a => a).forEach(a => {
          questionData.acceptedAnswers.push(a);
        });
      }
      break;
    }
    case 'matching': {
      const pairsText = document.getElementById('matchPairs').value.trim();
      if (!pairsText) { showToast('زوج واحد على الأقل مطلوب', 'error'); return; }
      const pairs = pairsText.split('\n').filter(l => l.trim()).map(line => {
        const parts = line.split('|').map(s => s.trim());
        return { left: parts[0] || '', right: parts[1] || '' };
      });
      if (pairs.some(p => !p.left || !p.right)) { showToast('كل سطر يحتاج: يسار | يمين', 'error'); return; }
      questionData.pairs = pairs;
      break;
    }
    case 'ordering': {
      const itemsText = document.getElementById('orderItems').value.trim();
      if (!itemsText) { showToast('عنصر واحد على الأقل مطلوب', 'error'); return; }
      const items = itemsText.split('\n').filter(l => l.trim()).map(l => l.trim());
      if (items.length < 2) { showToast('يُحتاج عنصرين على الأقل للترتيب', 'error'); return; }
      questionData.items = items;
      questionData.correctOrder = items.map((_, i) => i);
      break;
    }
  }

  const editId = document.getElementById('editQuestionId').value;
  if (editId) {
    socket.emit('admin:updateQuestion', { id: parseInt(editId), data: questionData });
    showToast('تم تحديث السؤال!', 'success');
  } else {
    socket.emit('admin:addQuestion', questionData);
    showToast('تم إضافة السؤال!', 'success');
  }

  cancelForm();
}

function editQuestion(id) {
  const q = questions.find(q => q.id === id);
  if (!q) return;

  showAddForm();
  document.getElementById('formTitle').textContent = `تعديل السؤال #${id}`;
  document.getElementById('editQuestionId').value = id;
  document.getElementById('qType').value = q.type;
  document.getElementById('qCategory').value = q.category || '';
  document.getElementById('qText').value = q.question;
  document.getElementById('qExplanation').value = q.explanation || '';
  updateFormFields();

  switch (q.type) {
    case 'multiple-choice':
      if (q.options) {
        document.querySelectorAll('.mc-option').forEach((el, idx) => {
          el.value = q.options[idx] || '';
        });
      }
      document.getElementById('mcCorrect').value = String(q.correctAnswer);
      break;
    case 'true-false':
      document.getElementById('tfCorrect').value = String(q.correctAnswer);
      break;
    case 'fill-blank':
      document.getElementById('fbCorrect').value = q.correctAnswer || '';
      if (q.acceptedAnswers && q.acceptedAnswers.length > 1) {
        document.getElementById('fbAlternatives').value = q.acceptedAnswers.slice(1).join('، ');
      }
      break;
    case 'matching':
      if (q.pairs) {
        document.getElementById('matchPairs').value = q.pairs.map(p => `${p.left} | ${p.right}`).join('\n');
      }
      break;
    case 'ordering':
      if (q.items) {
        document.getElementById('orderItems').value = q.items.join('\n');
      }
      break;
  }
}

function deleteQuestion(id) {
  if (confirm(`حذف السؤال #${id}؟ لا يمكن التراجع عن هذا.`)) {
    socket.emit('admin:deleteQuestion', id);
    showToast('تم حذف السؤال', 'info');
  }
}

/* ========== QR CODE ========== */
async function refreshQR() {
  try {
    const resp = await fetch('/api/qr');
    const data = await resp.json();
    if (data.qr) {
      document.getElementById('qrImage').src = data.qr;
      document.getElementById('qrImage').style.display = 'block';
      document.getElementById('qrLoading').style.display = 'none';
    }
    document.getElementById('qrUrl').textContent = data.url;
  } catch (err) {
    showToast('فشل إنشاء رمز QR', 'error');
  }
}

socket.on('admin:qr', (data) => {
  if (data.qr) {
    document.getElementById('qrImage').src = data.qr;
    document.getElementById('qrImage').style.display = 'block';
    document.getElementById('qrLoading').style.display = 'none';
  }
  document.getElementById('qrUrl').textContent = data.url;
});

/* ========== CONNECTION ========== */
socket.on('connect', () => {
  document.querySelector('.status-dot').classList.remove('disconnected');
  document.getElementById('connectionStatus').textContent = 'متصل';
  socket.emit('admin:getQuestions');
  socket.emit('admin:getPlayers');
  socket.emit('leaderboard:get');
  socket.emit('admin:getQR');
  refreshQR();
});

socket.on('disconnect', () => {
  document.querySelector('.status-dot').classList.add('disconnected');
  document.getElementById('connectionStatus').textContent = 'غير متصل';
});

socket.on('connect_error', () => {
  document.querySelector('.status-dot').classList.add('disconnected');
  document.getElementById('connectionStatus').textContent = 'جارٍ إعادة الاتصال...';
});
