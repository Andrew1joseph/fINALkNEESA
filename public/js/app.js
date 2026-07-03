const socket = io();
let playerName = '';
let playerSession = '';
let currentQuestion = null;
let timerInterval = null;
let timeRemaining = 0;
let timerDuration = 30;
let hasAnswered = false;
let currentAnswer = null;
let cheatWarnings = 0;
const MAX_CHEAT_WARNINGS = 3;
let quizActive = false;
let autoAdvanceTimeout = null;
let playerFinished = false;

/* ========== PARTICLE ANIMATION ========== */
function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let particles = [];
  const PARTICLE_COUNT = 60;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  class Particle {
    constructor() {
      this.reset();
    }
    reset() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.size = Math.random() * 2 + 0.5;
      this.speedX = (Math.random() - 0.5) * 0.4;
      this.speedY = (Math.random() - 0.5) * 0.4;
      this.opacity = Math.random() * 0.5 + 0.1;
      this.color = Math.random() > 0.5 ? '108, 92, 231' : '0, 206, 201';
    }
    update() {
      this.x += this.speedX;
      this.y += this.speedY;
      if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
        this.reset();
      }
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${this.color}, ${this.opacity})`;
      ctx.fill();
    }
  }

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push(new Particle());
  }

  function drawLines() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(108, 92, 231, ${0.08 * (1 - dist / 120)})`;
          ctx.lineWidth = 0.5;
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => { p.update(); p.draw(); });
    drawLines();
    requestAnimationFrame(animate);
  }
  animate();
}

initParticles();

/* ========== ANTI-CHEAT ========== */
function initAntiCheat() {
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('blur', handleWindowBlur);
  window.addEventListener('fullscreenchange', handleFullscreenChange);
}

function handleVisibilityChange() {
  if (document.hidden && quizActive && !hasAnswered) {
    triggerCheatLock();
  }
}

function handleWindowBlur() {
  if (quizActive && !hasAnswered) {
    triggerCheatLock();
  }
}

function handleFullscreenChange() {
  if (!document.fullscreenElement && quizActive && !hasAnswered) {
    triggerCheatLock();
  }
}

function triggerCheatLock() {
  cheatWarnings++;
  const overlay = document.getElementById('cheatOverlay');
  overlay.classList.add('active');

  const countEl = document.getElementById('cheatWarningCount');
  const arabicNums = ['٠','١','٢','٣'];
  countEl.textContent = `تحذير: ${arabicNums[cheatWarnings] || cheatWarnings} من ${arabicNums[MAX_CHEAT_WARNINGS] || MAX_CHEAT_WARNINGS}`;

  socket.emit('player:cheatWarning', { warnings: cheatWarnings });

  if (cheatWarnings >= MAX_CHEAT_WARNINGS) {
    countEl.textContent = '⚠️ تم تسجيل مخالفة — تم إقصاؤك من هذا السؤال';
    hasAnswered = true;
    stopTimer();
    disableAnswerInputs();
    document.getElementById('submitArea').style.display = 'none';
    socket.emit('game:answer', { answer: '__DISQUALIFIED__', timeRemaining: 0 });
  }
}

function dismissCheatOverlay() {
  document.getElementById('cheatOverlay').classList.remove('active');
}

/* ========== NAVIGATION ========== */
function showScreen(screenId) {
  SoundFX.click();
  const screens = document.querySelectorAll('.screen');
  const current = document.querySelector('.screen.active');
  if (current) {
    current.classList.remove('active');
    current.classList.add('slide-out');
    setTimeout(() => current.classList.remove('slide-out'), 300);
  }
  setTimeout(() => {
    screens.forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');
  }, 150);
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

function showScorePopup(points, correct) {
  document.querySelectorAll('.score-popup').forEach(el => el.remove());
  const popup = document.createElement('div');
  popup.className = `score-popup ${correct ? 'correct' : 'incorrect'}`;
  popup.textContent = correct ? `+${points}` : '✗';
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 1500);
}

function launchConfetti() {
  const container = document.getElementById('confettiContainer');
  container.innerHTML = '';
  const colors = ['#6c5ce7','#a29bfe','#00cec9','#55efc4','#fd79a8','#fdcb6e','#ff7675'];
  for (let i = 0; i < 50; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.width = (Math.random() * 8 + 6) + 'px';
    piece.style.height = (Math.random() * 8 + 6) + 'px';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
    piece.style.animationDuration = (Math.random() * 2 + 2) + 's';
    piece.style.animationDelay = (Math.random() * 0.5) + 's';
    container.appendChild(piece);
  }
  setTimeout(() => container.innerHTML = '', 5000);
}

/* ========== JOIN ========== */
function joinGame() {
  const sessionInput = document.getElementById('sessionInput');
  const nameInput = document.getElementById('nameInput');
  const sessionName = sessionInput ? sessionInput.value.trim() : '';
  const name = nameInput.value.trim();
  if (!sessionName) {
    showToast('يرجى إدخال اسم الجلسة', 'error');
    if (sessionInput) sessionInput.focus();
    return;
  }
  if (!name) {
    showToast('يرجى إدخال اسمك', 'error');
    nameInput.focus();
    return;
  }
  SoundFX.resume();
  SoundFX.join();
  playerName = name;
  playerSession = sessionName;
  socket.emit('player:join', { name: name, session: sessionName });
}

document.getElementById('nameInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinGame();
});
document.getElementById('sessionInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('nameInput').focus();
});

socket.on('player:joined', (data) => {
  if (data.session) playerSession = data.session;
  document.getElementById('waitingName').textContent = data.name;
  showScreen('waitingScreen');
});

socket.on('player:joinError', (msg) => {
  showToast(msg, 'error');
});

socket.on('players:update', (players) => {
  const count = players.length;
  const welcomeEl = document.getElementById('welcomePlayerCount');
  const welcomeNum = document.getElementById('welcomePlayerNum');
  const waitingNum = document.getElementById('waitingPlayerNum');
  if (count > 0) {
    welcomeEl.style.display = 'inline-flex';
    welcomeNum.textContent = count;
  }
  waitingNum.textContent = count;
});

/* ========== GAME FLOW ========== */
socket.on('game:started', (data) => {
  SoundFX.start();
  showToast('بدأت اللعبة!', 'success');
  socket.emit('game:getIntro');
});

socket.on('game:intro', (intro) => {
  document.getElementById('storyTitle').textContent = intro.title;
  const container = document.getElementById('storyParagraphs');
  container.innerHTML = '';
  intro.paragraphs.forEach(p => {
    const el = document.createElement('p');
    el.className = 'story-paragraph';
    el.textContent = p;
    container.appendChild(el);
  });
  const readyBtn = document.getElementById('storyReadyBtn');
  readyBtn.style.display = 'none';
  setTimeout(() => { readyBtn.style.display = 'inline-flex'; }, intro.paragraphs.length * 1000 + 1000);
  showScreen('storyScreen');
});

function readyForQuiz() {
  SoundFX.click();
  showToast('في انتظار الأسئلة...', 'info');
}

socket.on('game:question', (data) => {
  // Clear any pending auto-advance from previous question
  clearTimeout(autoAdvanceTimeout);
  
  currentQuestion = data.question;
  timerDuration = data.timerDuration || 30;
  hasAnswered = false;
  currentAnswer = null;
  quizActive = true;
  cheatWarnings = 0;
  playerFinished = false;
  dismissCheatOverlay();

  updateProgress(data.progress);
  renderQuestion(data.question);
  startTimer(timerDuration);
  showScreen('quizScreen');
  SoundFX.click();
});

function updateProgress(progress) {
  document.getElementById('progressLabel').textContent = `السؤال ${progress.current}/${progress.total}`;
  document.getElementById('progressPercent').textContent = `${progress.percentage}%`;
  document.getElementById('progressFill').style.width = `${progress.percentage}%`;
}

function startTimer(duration) {
  clearInterval(timerInterval);
  timeRemaining = duration;
  const circle = document.getElementById('timerCircle');
  const circumference = 2 * Math.PI * 26;
  circle.style.strokeDasharray = circumference;
  circle.style.strokeDashoffset = '0';
  circle.classList.remove('warning', 'danger');
  document.getElementById('timerText').textContent = timeRemaining;

  timerInterval = setInterval(() => {
    timeRemaining--;
    if (timeRemaining < 0) timeRemaining = 0;
    document.getElementById('timerText').textContent = timeRemaining;
    const offset = circumference * (1 - timeRemaining / duration);
    circle.style.strokeDashoffset = offset;

    if (timeRemaining <= 5) {
      circle.classList.remove('warning');
      circle.classList.add('danger');
      SoundFX.timeDanger();
    } else if (timeRemaining <= 10) {
      circle.classList.add('warning');
      circle.classList.remove('danger');
      if (timeRemaining === 10) SoundFX.timeWarning();
    } else {
      SoundFX.tick();
    }

    if (timeRemaining <= 0) {
      clearInterval(timerInterval);
      if (!hasAnswered) {
        socket.emit('game:timerExpired');
      }
    }
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
}

/* ========== RENDER ========== */
function renderQuestion(question) {
  const quizCard = document.getElementById('quizCard');
  quizCard.classList.remove('question-transition');
  void quizCard.offsetWidth;
  quizCard.classList.add('question-transition');

  document.getElementById('questionCategory').textContent = question.category;
  const typeLabels = {
    'multiple-choice': 'اختيار من متعدد',
    'true-false': 'ص أم خطأ',
    'fill-blank': 'أكمل الفراغ',
    'matching': 'طابق',
    'ordering': 'رتِّب'
  };
  document.getElementById('questionTypeBadge').textContent = typeLabels[question.type] || question.type;
  document.getElementById('questionText').textContent = question.question;

  const answerArea = document.getElementById('answerArea');
  const submitArea = document.getElementById('submitArea');
  const explanationArea = document.getElementById('explanationArea');
  answerArea.innerHTML = '';
  submitArea.style.display = 'none';
  explanationArea.innerHTML = '';

  switch (question.type) {
    case 'multiple-choice': renderMultipleChoice(question, answerArea); break;
    case 'true-false': renderTrueFalse(question, answerArea); break;
    case 'fill-blank': renderFillBlank(question, answerArea); submitArea.style.display = 'block'; break;
    case 'matching': renderMatching(question, answerArea); submitArea.style.display = 'block'; break;
    case 'ordering': renderOrdering(question, answerArea); submitArea.style.display = 'block'; break;
  }
}

function renderMultipleChoice(question, container) {
  const list = document.createElement('div');
  list.className = 'option-list';
  const letters = ['أ','ب','ج','د'];
  question.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = `<span class="option-letter">${letters[idx]}</span><span>${opt}</span>`;
    btn.addEventListener('click', () => {
      if (hasAnswered) return;
      SoundFX.click();
      list.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      currentAnswer = idx;
      submitAnswer();
    });
    list.appendChild(btn);
  });
  container.appendChild(list);
}

function renderTrueFalse(question, container) {
  const group = document.createElement('div');
  group.className = 'tf-group';

  const trueBtn = document.createElement('button');
  trueBtn.className = 'tf-btn';
  trueBtn.innerHTML = '✓ صحيح';
  trueBtn.addEventListener('click', () => {
    if (hasAnswered) return;
    SoundFX.click();
    group.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('selected'));
    trueBtn.classList.add('selected');
    currentAnswer = true;
    submitAnswer();
  });

  const falseBtn = document.createElement('button');
  falseBtn.className = 'tf-btn';
  falseBtn.innerHTML = '✗ خطأ';
  falseBtn.addEventListener('click', () => {
    if (hasAnswered) return;
    SoundFX.click();
    group.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('selected'));
    falseBtn.classList.add('selected');
    currentAnswer = false;
    submitAnswer();
  });

  group.appendChild(trueBtn);
  group.appendChild(falseBtn);
  container.appendChild(group);
}

function renderFillBlank(question, container) {
  const group = document.createElement('div');
  group.className = 'fill-blank-group';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'fill-blank-input';
  input.id = 'fillBlankInput';
  input.placeholder = 'اكتب إجابتك...';
  input.autocomplete = 'off';
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAnswer(); });
  group.appendChild(input);
  container.appendChild(group);
  setTimeout(() => input.focus(), 300);
}

function renderMatching(question, container) {
  const matchContainer = document.createElement('div');
  matchContainer.className = 'matching-container';
  const shuffledRight = question.shuffledRight || question.pairs.map((p, i) => ({ text: p.right, originalIndex: i }));
  question.pairs.forEach((pair, idx) => {
    const row = document.createElement('div');
    row.className = 'matching-pair-row';
    const leftEl = document.createElement('div');
    leftEl.className = 'match-left';
    leftEl.textContent = pair.left;
    const arrow = document.createElement('span');
    arrow.className = 'match-arrow';
    arrow.textContent = '←';
    const select = document.createElement('select');
    select.className = 'match-select';
    select.dataset.leftIndex = idx;
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'اختر المطابق...';
    defaultOpt.disabled = true;
    defaultOpt.selected = true;
    select.appendChild(defaultOpt);
    shuffledRight.forEach((right) => {
      const opt = document.createElement('option');
      opt.value = right.originalIndex;
      opt.textContent = right.text;
      select.appendChild(opt);
    });
    row.appendChild(leftEl);
    row.appendChild(arrow);
    row.appendChild(select);
    matchContainer.appendChild(row);
  });
  container.appendChild(matchContainer);
}

function renderOrdering(question, container) {
  const orderContainer = document.createElement('div');
  orderContainer.className = 'ordering-container';
  orderContainer.id = 'orderingContainer';
  const shuffledOrder = question.shuffledOrder || question.items.map((_, i) => i);
  const items = shuffledOrder.map(i => ({ originalIndex: i, text: question.items[i] }));
  items.forEach((item, displayIdx) => {
    const el = document.createElement('div');
    el.className = 'order-item';
    el.draggable = true;
    el.dataset.originalIndex = item.originalIndex;
    el.innerHTML = `<span class="order-number">${displayIdx + 1}</span><span class="order-text">${item.text}</span><span class="order-grip">⿿</span>`;
    el.addEventListener('dragstart', handleDragStart);
    el.addEventListener('dragover', handleDragOver);
    el.addEventListener('dragenter', handleDragEnter);
    el.addEventListener('dragleave', handleDragLeave);
    el.addEventListener('drop', handleDrop);
    el.addEventListener('dragend', handleDragEnd);
    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);
    orderContainer.appendChild(el);
  });
  container.appendChild(orderContainer);
}

/* ========== DRAG & DROP ========== */
let draggedElement = null;
let touchStartY = 0;
let touchCurrentItem = null;

function handleDragStart(e) { draggedElement = this; this.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); }
function handleDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function handleDragEnter() { this.classList.add('drag-over'); }
function handleDragLeave() { this.classList.remove('drag-over'); }
function handleDrop(e) {
  e.preventDefault();
  this.classList.remove('drag-over');
  if (draggedElement !== this) {
    const container = this.parentNode;
    const items = Array.from(container.children);
    const fromIdx = items.indexOf(draggedElement);
    const toIdx = items.indexOf(this);
    if (fromIdx < toIdx) container.insertBefore(draggedElement, this.nextSibling);
    else container.insertBefore(draggedElement, this);
    updateOrderNumbers(container);
  }
}
function handleDragEnd() { this.classList.remove('dragging'); document.querySelectorAll('.order-item').forEach(el => el.classList.remove('drag-over')); draggedElement = null; }

function handleTouchStart(e) { touchCurrentItem = this; touchStartY = e.touches[0].clientY; this.classList.add('dragging'); }
function handleTouchMove(e) {
  e.preventDefault();
  if (!touchCurrentItem) return;
  const touch = e.touches[0];
  const moveY = touch.clientY - touchStartY;
  touchCurrentItem.style.transform = `translateY(${moveY}px)`;
  const container = touchCurrentItem.parentNode;
  const items = Array.from(container.children);
  const currentRect = touchCurrentItem.getBoundingClientRect();
  const currentCenter = currentRect.top + currentRect.height / 2;
  items.forEach(item => {
    if (item === touchCurrentItem) return;
    const rect = item.getBoundingClientRect();
    if (touch.clientY > rect.top && touch.clientY < rect.bottom) {
      const idx = items.indexOf(touchCurrentItem);
      const targetIdx = items.indexOf(item);
      const center = rect.top + rect.height / 2;
      if (currentCenter < center && idx < targetIdx) { container.insertBefore(touchCurrentItem, item.nextSibling); resetItemPositions(container); touchStartY = touch.clientY; touchCurrentItem.style.transform = ''; }
      else if (currentCenter > center && idx > targetIdx) { container.insertBefore(touchCurrentItem, item); resetItemPositions(container); touchStartY = touch.clientY; touchCurrentItem.style.transform = ''; }
    }
  });
}
function handleTouchEnd() {
  if (touchCurrentItem) { touchCurrentItem.classList.remove('dragging'); touchCurrentItem.style.transform = ''; touchCurrentItem = null; const container = document.getElementById('orderingContainer'); if (container) updateOrderNumbers(container); }
}
function resetItemPositions(container) { Array.from(container.children).forEach(item => { if (item !== touchCurrentItem) item.style.transform = ''; }); }
function updateOrderNumbers(container) { Array.from(container.children).forEach((item, idx) => { const numEl = item.querySelector('.order-number'); if (numEl) numEl.textContent = idx + 1; }); }

/* ========== SUBMIT ========== */
function submitAnswer() {
  if (hasAnswered || !currentQuestion) return;
  SoundFX.submit();
  let answer = null;
  switch (currentQuestion.type) {
    case 'multiple-choice': case 'true-false': answer = currentAnswer; break;
    case 'fill-blank': { const input = document.getElementById('fillBlankInput'); answer = input ? input.value.trim() : ''; break; }
    case 'matching': { const selects = document.querySelectorAll('.match-select'); answer = []; selects.forEach(sel => { answer.push({ leftIndex: parseInt(sel.dataset.leftIndex), rightIndex: parseInt(sel.value) }); }); break; }
    case 'ordering': { const items = document.querySelectorAll('#orderingContainer .order-item'); answer = []; items.forEach(item => { answer.push(parseInt(item.dataset.originalIndex)); }); break; }
  }
  if (answer === null || answer === '') { showToast('يرجى تقديم إجابة', 'error'); return; }
  if (currentQuestion.type === 'matching' && answer.some(a => isNaN(a.rightIndex) || a.rightIndex < 0)) { showToast('يرجى مطابقة جميع العناصر', 'error'); return; }
  hasAnswered = true;
  quizActive = false;
  stopTimer();
  document.getElementById('submitArea').style.display = 'none';
  disableAnswerInputs();
  socket.emit('game:answer', { answer, timeRemaining });
}

function disableAnswerInputs() {
  document.querySelectorAll('.option-btn').forEach(b => b.style.pointerEvents = 'none');
  document.querySelectorAll('.tf-btn').forEach(b => b.style.pointerEvents = 'none');
  const fillInput = document.getElementById('fillBlankInput');
  if (fillInput) fillInput.disabled = true;
  document.querySelectorAll('.match-select').forEach(s => s.disabled = true);
  document.querySelectorAll('.order-item').forEach(el => { el.draggable = false; el.style.pointerEvents = 'none'; });
}

/* ========== RESULTS & FEEDBACK ========== */
socket.on('game:answerResult', (result) => {
  if (result.correct) { SoundFX.correct(); showScorePopup(result.points, true); highlightCorrect(); }
  else { SoundFX.incorrect(); showScorePopup(0, false); highlightIncorrect(); }
  if (result.explanation) {
    document.getElementById('explanationArea').innerHTML = `<div class="explanation-box"><strong>💡 رؤية:</strong> ${result.explanation}</div>`;
  }
});

function highlightCorrect() {
  if (!currentQuestion) return;
  switch (currentQuestion.type) {
    case 'multiple-choice': { const btns = document.querySelectorAll('.option-btn'); if (currentAnswer !== null && btns[currentAnswer]) btns[currentAnswer].classList.add('correct'); break; }
    case 'true-false': { const btns = document.querySelectorAll('.tf-btn'); if (currentAnswer === true) btns[0].classList.add('correct'); else btns[1].classList.add('correct'); break; }
    case 'fill-blank': { const input = document.getElementById('fillBlankInput'); if (input) input.classList.add('correct'); break; }
    case 'matching': document.querySelectorAll('.match-select').forEach(s => s.classList.add('correct')); break;
    case 'ordering': document.querySelectorAll('.order-item').forEach(el => el.classList.add('correct')); break;
  }
}

function highlightIncorrect() {
  if (!currentQuestion) return;
  switch (currentQuestion.type) {
    case 'multiple-choice': { const btns = document.querySelectorAll('.option-btn'); if (currentAnswer !== null && btns[currentAnswer]) btns[currentAnswer].classList.add('incorrect'); break; }
    case 'true-false': { const btns = document.querySelectorAll('.tf-btn'); if (currentAnswer === true) btns[0].classList.add('incorrect'); else btns[1].classList.add('incorrect'); break; }
    case 'fill-blank': { const input = document.getElementById('fillBlankInput'); if (input) input.classList.add('incorrect'); break; }
    case 'matching': document.querySelectorAll('.match-select').forEach(s => s.classList.add('incorrect')); break;
    case 'ordering': document.querySelectorAll('.order-item').forEach(el => el.classList.add('incorrect')); break;
  }
}

socket.on('game:questionEnd', (data) => {
  stopTimer();
  SoundFX.reveal();
  if (!hasAnswered) {
    hasAnswered = true;
    quizActive = false;
    disableAnswerInputs();
    document.getElementById('submitArea').style.display = 'none';
  }
  showCorrectAnswer(data);
  if (data.explanation && !document.querySelector('.explanation-box')) {
    document.getElementById('explanationArea').innerHTML = `<div class="explanation-box"><strong>💡 رؤية:</strong> ${data.explanation}</div>`;
  }
  // No need for autoAdvanceTimeout here — the server handles auto-advance
  // after EXPLANATION_DELAY and sends the next game:question event
});

function showCorrectAnswer(data) {
  if (!currentQuestion) return;
  switch (currentQuestion.type) {
    case 'multiple-choice': { const btns = document.querySelectorAll('.option-btn'); if (data.correctAnswer !== undefined && btns[data.correctAnswer]) { btns[data.correctAnswer].classList.remove('incorrect'); btns[data.correctAnswer].classList.add('correct'); } break; }
    case 'true-false': { const btns = document.querySelectorAll('.tf-btn'); const idx = data.correctAnswer === true ? 0 : 1; btns[idx].classList.add('correct'); break; }
    case 'fill-blank': { const input = document.getElementById('fillBlankInput'); if (input && data.correctAnswer) { input.value = data.correctAnswer; input.classList.remove('incorrect'); input.classList.add('correct'); } break; }
    case 'matching': { document.querySelectorAll('.match-select').forEach(s => { s.value = parseInt(s.dataset.leftIndex); s.classList.remove('incorrect'); s.classList.add('correct'); }); break; }
    case 'ordering': { if (data.correctOrder) { const container = document.getElementById('orderingContainer'); if (container) { const itemMap = {}; container.querySelectorAll('.order-item').forEach(item => { itemMap[item.dataset.originalIndex] = item; }); data.correctOrder.forEach(origIdx => { if (itemMap[origIdx]) { container.appendChild(itemMap[origIdx]); itemMap[origIdx].classList.remove('incorrect'); itemMap[origIdx].classList.add('correct'); } }); updateOrderNumbers(container); } } break; }
  }
}

// This player has finished all their questions
socket.on('game:playerFinished', (data) => {
  stopTimer();
  quizActive = false;
  playerFinished = true;
  SoundFX.finish();
  launchConfetti();
  setTimeout(() => socket.emit('game:getResults'), 500);
});

socket.on('game:answerCount', (data) => {
  document.getElementById('answerCountText').textContent = `${data.answered}/${data.total} أجابوا`;
  const pct = data.total > 0 ? Math.round((data.answered / data.total) * 100) : 0;
  document.getElementById('answerCountFill').style.width = `${pct}%`;
});

/* ========== GAME END ========== */
socket.on('game:finished', () => {
  stopTimer();
  quizActive = false;
  // If this player hasn't finished yet, get results
  if (!playerFinished) {
    SoundFX.finish();
    launchConfetti();
    setTimeout(() => socket.emit('game:getResults'), 500);
  }
});

socket.on('game:results', (results) => {
  if (!results) return;
  document.getElementById('resultsScore').textContent = results.score;
  document.getElementById('resultsRank').textContent = `الترتيب #${results.rank} من ${results.totalPlayers} لاعب`;
  const statsContainer = document.getElementById('resultsStats');
  statsContainer.innerHTML = `
    <div class="stat-item"><span class="stat-value">${results.correctCount}</span><span class="stat-label">صحيح</span></div>
    <div class="stat-item"><span class="stat-value">${results.totalQuestions - results.correctCount}</span><span class="stat-label">أخطاء</span></div>
    <div class="stat-item"><span class="stat-value">${results.percentage}%</span><span class="stat-label">الدقة</span></div>
  `;
  let message = '';
  if (results.percentage >= 90) message = '🌟 ممتاز! لديك فهم قوي للحقيقة. أنت تسير حقًا في نور ما يقوله الله عنك!';
  else if (results.percentage >= 70) message = '👏 أحسنت! لديك أساس قوي من الحقيقة. استمر في تجديد ذهنك وستفقد الأكاذيب قبضتها.';
  else if (results.percentage >= 50) message = '💪 جهد طيب! أنت في رحلة اكتشاف الحقيقة. تذكر — الأمر ليس عن الكمال، بل عن الاتجاه.';
  else message = '❤️ استمر في البحث! الحقيقة تنتظرك. اليوم هو مجرد البداية — كلمة الله مليئة بالإجابات لكل كذبة تواجهها.';
  document.getElementById('resultsMessage').textContent = message;
  showScreen('resultsScreen');
});

function showLeaderboard() {
  SoundFX.click();
  socket.emit('leaderboard:get');
  showScreen('leaderboardScreen');
}

socket.on('leaderboard:update', (leaderboard) => { renderLeaderboard(leaderboard); });

function renderLeaderboard(leaderboard) {
  const list = document.getElementById('leaderboardList');
  if (!list) return;
  list.innerHTML = '';
  leaderboard.forEach(entry => {
    const item = document.createElement('div');
    item.className = 'leaderboard-item';
    item.style.animationDelay = `${entry.rank * 0.1}s`;
    const score = entry.totalScore !== undefined ? entry.totalScore : entry.score;
    const statusBadge = entry.isOnline
      ? '<span class="online-badge">اونلاين</span>'
      : '<span class="offline-badge">اوفلاين</span>';
    item.innerHTML = `<div class="lb-rank">${entry.rank}</div><div class="lb-name-wrap"><span class="lb-name">${entry.name}</span>${statusBadge}</div><div class="lb-score">${score}</div>`;
    list.appendChild(item);
  });
}

socket.on('game:reset', () => {
  stopTimer();
  quizActive = false;
  currentQuestion = null;
  hasAnswered = false;
  currentAnswer = null;
  playerFinished = false;
  clearTimeout(autoAdvanceTimeout);
  dismissCheatOverlay();
  showScreen('welcomeScreen');
  showToast('تم إعادة تعيين اللعبة', 'info');
});

socket.on('connect_error', () => showToast('فُقد الاتصال. جارٍ إعادة الاتصال...', 'error'));
socket.on('connect', () => { if (playerName) socket.emit('player:join', { name: playerName, session: playerSession }); });

document.addEventListener('click', () => SoundFX.resume(), { once: true });
document.addEventListener('touchstart', () => SoundFX.resume(), { once: true });

initAntiCheat();
