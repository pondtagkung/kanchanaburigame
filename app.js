// Global Variables
let players = [];
let currentPlayerIndex = 0;
let gameTimeSeconds = 0;
let timerInterval = null;
let isAnimating = false;
let isPaused = false;
let currentQuestionData = null;

const playerColors = ['#ff4b1f', '#00c6ff', '#56ab2f', '#f7b733', '#8A2387', '#fc4a1a'];
const playerAvatars = ['🐶', '🐱', '🐼', '🦊', '🐸', '🦁'];

// WebSocket Connection
let ws;

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
  
  ws.onopen = () => {
    console.log("Connected to server as Host");
    ws.send(JSON.stringify({ action: 'register_host' }));
    
    // Keep connection alive (Render drops idle connections after 100s)
    if (window.pingInterval) clearInterval(window.pingInterval);
    window.pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'ping' }));
      }
    }, 30000);
  };
  
  ws.onclose = () => {
    console.log("Disconnected. Reconnecting...");
    setTimeout(connectWebSocket, 3000);
  };
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'host_registered') {
      // Use the exact same host/port the browser is using
      const joinUrl = `${window.location.protocol}//${window.location.host}/client.html`;
      document.getElementById('join-url').innerText = joinUrl;
      const qrContainer = document.getElementById("qrcode-container");
      qrContainer.innerHTML = '';
      new QRCode(qrContainer, {
        text: joinUrl,
        width: 150,
        height: 150
      });
    }
    
    else if (data.type === 'player_joined') {
      const p = {
        id: data.id,
        name: data.name,
        color: playerColors[players.length % playerColors.length],
        avatar: playerAvatars[players.length % playerAvatars.length],
        position: 0,
        score: 300,
        skipNextTurn: false
      };
      players.push(p);
      updateSetupUI();
    }
    
    else if (data.type === 'player_disconnected') {
      players = players.filter(p => p.id !== data.id);
      updateSetupUI();
    }
    
    else if (data.type === 'roll_dice') {
      if (players[currentPlayerIndex].id === data.id) {
         if (isAnimating || isPaused) return;
         isAnimating = true;
         updateClientUI('all', 'wait', { message: `${players[currentPlayerIndex].name} is rolling 🎲` });
         
         const roll = Math.floor(Math.random() * 6) + 1;
         const diceEl = document.getElementById('dice');
         diceEl.className = 'dice roll-anim';
         diceEl.innerText = '🎲';
         
         setTimeout(() => {
           diceEl.classList.remove('roll-anim');
           diceEl.innerText = roll;
           movePlayer(roll);
         }, 1000);
      }
    }
    
    else if (data.type === 'answer') {
       const playerId = data.id;
       const answerIndex = data.answer_index;
       if (players[currentPlayerIndex].id === playerId) {
          if (currentQuestionData) {
            if (currentQuestionData.type === 'QUESTION') {
               processQuestionAnswer(currentQuestionData.qIndex, answerIndex);
            } else if (currentQuestionData.type === 'BONUS') {
               processBonusAnswer(currentQuestionData.reward, answerIndex === currentQuestionData.correctIndex);
            }
          }
       }
    }
  };
}

function updateClientUI(target_id, ui_state, payload = {}) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      action: 'update_client_ui',
      target_id,
      ui_state,
      payload
    }));
  }
}

function updateSetupUI() {
  const list = document.getElementById('connected-players-list');
  const count = document.getElementById('connected-count');
  const startBtn = document.getElementById('start-game-btn');
  
  count.innerText = players.length;
  list.innerHTML = players.map(p => `<div><span style="font-size:1.5em; vertical-align: middle;">${p.avatar}</span> ${p.name}</div>`).join('');
  
  if (players.length >= 2) {
    startBtn.disabled = false;
    startBtn.innerText = 'Start Game';
  } else {
    startBtn.disabled = true;
    startBtn.innerText = 'Start Game (Need at least 2)';
  }
}

// UI Elements
const turnIndicatorEl = document.getElementById('turn-indicator');
const actionTextEl = document.getElementById('action-text');

window.onload = () => {
  connectWebSocket();
};

window.startGame = function() {
  const timeInput = document.getElementById('time-input').value;
  gameTimeSeconds = parseInt(timeInput) * 60;
  
  document.getElementById('setup-screen').classList.remove('active');
  document.getElementById('game-screen').classList.add('active');
  
  renderBoard();
  renderPlayersSidebar();
  updateTokensOnBoard();
  startTimer();
  updateTurnUI();
}

function renderBoard() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  
  boardConfig.forEach((sq, i) => {
    const div = document.createElement('div');
    div.className = `square ${getSquareClass(sq.type)}`;
    
    // Calculate Position on 9x9 grid
    let row, col;
    if (i <= 8) {
      row = 0; col = i;
    } else if (i <= 16) {
      row = i - 8; col = 8;
    } else if (i <= 24) {
      row = 8; col = 8 - (i - 16);
    } else {
      row = 8 - (i - 24); col = 0;
    }
    
    div.style.left = `${(col / 9) * 100}%`;
    div.style.top = `${(row / 9) * 100}%`;
    
    // Inner HTML
    let label = sq.label || sq.type;
    let iconHtml = '';
    
    if (sq.type === 'QUESTION') label = 'Question';
    if (sq.type === 'BONUS_PIC') {
      label = 'Special Cards';
      iconHtml = '<div class="square-icon">🧚‍♀️</div>';
    }
    if (sq.type === 'RANDOM_BONUS') {
      label = 'Lucky Door';
      iconHtml = '<div class="square-icon">🚪</div>';
    }
    
    div.innerHTML = `<div class="square-number">${i}</div>${iconHtml}<div class="square-label">${label}</div><div class="tokens-container" id="tokens-${i}"></div>`;
    boardEl.appendChild(div);
  });
}

function getSquareClass(type) {
  switch(type) {
    case 'START': return 'sq-start';
    case 'QUESTION': return 'sq-question';
    case 'BONUS_PIC': return 'sq-bonus-pic';
    case 'RANDOM_BONUS': return 'sq-random-bonus';
    case 'LOSE_TURN': return 'sq-lose-turn';
    case 'SAFE': return 'sq-safe';
    default: return '';
  }
}

function updateTokensOnBoard() {
  // Clear all
  document.querySelectorAll('.tokens-container').forEach(c => c.innerHTML = '');
  
  // Place tokens
  players.forEach(p => {
    const container = document.getElementById(`tokens-${p.position}`);
    if (container) {
      const token = document.createElement('div');
      token.className = 'token';
      token.innerText = p.avatar;
      token.style.borderColor = p.color;
      container.appendChild(token);
    }
  });
}

function renderPlayersSidebar() {
  const pList = document.getElementById('players-list');
  let html = '';
  players.forEach((p, i) => {
    const activeClass = i === currentPlayerIndex ? 'active-player' : '';
    const statusText = p.skipNextTurn ? '(Skip Next Turn)' : '';
    html += `
      <div class="player-card ${activeClass}" id="p-card-${i}">
        <div class="player-avatar" style="border-color: ${p.color}">${p.avatar}</div>
        <div class="player-info">
          <div class="player-name">${p.name}</div>
          <div class="player-status">${statusText}</div>
        </div>
        <div class="player-score">${p.score} ฿</div>
      </div>
    `;
  });
  pList.innerHTML = html;
}

function updateTurnUI() {
  if (isPaused) return;
  renderPlayersSidebar();
  const cp = players[currentPlayerIndex];
  turnIndicatorEl.style.color = cp.color;
  turnIndicatorEl.innerText = `${cp.name}'s Turn`;
  actionTextEl.innerText = `Waiting for ${cp.name} to roll on their phone...`;
  
  updateClientUI('all', 'wait', { message: `${cp.name}'s Turn` });
  updateClientUI(cp.id, 'roll', { color: cp.color, message: "It's your turn! Tap to Roll" });
  
  if (cp.skipNextTurn) {
    actionTextEl.innerText = `${cp.name} is skipping a turn.`;
    cp.skipNextTurn = false;
    updateClientUI(cp.id, 'wait', { message: `You are skipping this turn!` });
    setTimeout(() => {
      nextTurn();
    }, 2000);
  }
}

function updateScoreUI(playerIndex) {
  renderPlayersSidebar();
}

// Timer Logic
function startTimer() {
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    if (!isPaused) {
      gameTimeSeconds--;
      updateTimerDisplay();
      if (gameTimeSeconds <= 0) {
        endGame();
      }
    }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(gameTimeSeconds / 60).toString().padStart(2, '0');
  const s = (gameTimeSeconds % 60).toString().padStart(2, '0');
  document.getElementById('timer-display').innerText = `${m}:${s}`;
}

function endGame() {
  clearInterval(timerInterval);
  isPaused = true;
  
  // Sort players by score
  const sorted = [...players].sort((a,b) => b.score - a.score);
  
  const finalScoresEl = document.getElementById('final-scores');
  let html = '<ul>';
  sorted.forEach((p, i) => {
    html += `<li style="font-size: ${i===0 ? '1.5rem' : '1rem'}; font-weight: ${i===0 ? 'bold': 'normal'}">
      ${i+1}. ${p.avatar} ${p.name} - ${p.score} ฿
    </li>`;
  });
  html += '</ul>';
  finalScoresEl.innerHTML = html;
  
  showModal('gameover-modal');
  updateClientUI('all', 'wait', { message: `Game Over! Look at the main screen for results.` });
}

window.restartGame = function() {
  updateClientUI('all', 'reset');
  setTimeout(() => {
    window.location.reload();
  }, 500);
};

// Pause Logic
const pauseBtn = document.getElementById('pause-btn');
pauseBtn.addEventListener('click', () => {
  isPaused = !isPaused;
  if (isPaused) {
    pauseBtn.innerText = 'Resume';
    pauseBtn.style.background = 'white';
    pauseBtn.style.color = 'var(--text-dark)';
    turnIndicatorEl.innerText = 'Game Paused';
    turnIndicatorEl.style.color = '#fff';
    updateClientUI('all', 'wait', { message: 'Game Paused by Host' });
  } else {
    pauseBtn.innerText = 'Pause';
    pauseBtn.style.background = 'rgba(255, 255, 255, 0.2)';
    pauseBtn.style.color = 'white';
    updateTurnUI(); 
  }
});


function movePlayer(roll) {
  const cp = players[currentPlayerIndex];
  const oldPos = cp.position;
  let newPos = oldPos + roll;
  
  let passedStart = false;
  // Passed start?
  if (newPos >= 32) {
    newPos = newPos % 32;
    cp.score += 100;
    updateScoreUI(currentPlayerIndex);
    passedStart = true;
  }
  
  cp.position = newPos;
  updateTokensOnBoard();
  
  setTimeout(() => {
    if (passedStart && newPos !== 0) {
      showAnnouncement('Start!', '+100 ฿', 'correct');
      setTimeout(() => handleSquareAction(newPos), 2000);
    } else {
      handleSquareAction(newPos);
    }
  }, 1000);
}

// Actions
function handleSquareAction(pos) {
  const sq = boardConfig[pos];
  const cp = players[currentPlayerIndex];
  
  switch(sq.type) {
    case 'START':
      showAnnouncement('Start!', 'Landed on Start! +100 ฿', 'correct');
      setTimeout(nextTurn, 2000);
      break;
    case 'SAFE':
      actionTextEl.innerText = `Safe zone. Relax!`;
      setTimeout(nextTurn, 1500);
      break;
    case 'LOSE_TURN':
      actionTextEl.innerText = `Oh no! Lose a turn.`;
      cp.skipNextTurn = true;
      setTimeout(nextTurn, 2000);
      break;
    case 'QUESTION':
      showQuestionModal(sq.qIndex);
      break;
    case 'BONUS_PIC':
      showBonusPicModal();
      break;
    case 'RANDOM_BONUS':
      showRandomBonusModal();
      break;
  }
}

function nextTurn() {
  currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
  isAnimating = false;
  updateTurnUI();
}

function showModal(id) {
  document.getElementById(id).style.display = 'flex';
}

function hideModal(id) {
  document.getElementById(id).style.display = 'none';
}

function showQuestionModal(qIndex) {
  const qData = questions[qIndex];
  document.getElementById('q-title').innerText = `Question for ${qData.reward} ฿`;
  document.getElementById('q-text').innerText = qData.q;
  
  // Send options to client phone
  currentQuestionData = { type: 'QUESTION', qIndex: qIndex };
  const cp = players[currentPlayerIndex];
  updateClientUI(cp.id, 'question', { 
     question: qData.q, 
     options: qData.options 
  });
  
  const optionsEl = document.getElementById('q-options');
  optionsEl.innerHTML = '';
  qData.options.forEach((opt, idx) => {
    const btn = document.createElement('div');
    btn.className = 'btn secondary-btn';
    btn.style.opacity = '0.5';
    btn.innerText = opt;
    optionsEl.appendChild(btn);
  });
  
  document.getElementById('q-image').style.display = 'none';
  showModal('question-modal');
}

function showBonusPicModal() {
  const rImageIndex = Math.floor(Math.random() * bonusImages.length);
  const imgData = bonusImages[rImageIndex];
  const reward = Math.floor(Math.random() * 51) + 50; // 50 to 100
  
  const options = [];
  options.push(imgData.name);
  while(options.length < 3) {
    const randomOption = bonusImages[Math.floor(Math.random() * bonusImages.length)].name;
    if (!options.includes(randomOption)) options.push(randomOption);
  }
  if (Math.random() > 0.5) options.reverse();
  const correctAnswerIndex = options.indexOf(imgData.name);
  
  document.getElementById('q-title').innerText = `Special Card! Win ${reward} ฿`;
  document.getElementById('q-text').innerText = "What is the name of this location in Kanchanaburi?";
  
  const imgEl = document.getElementById('q-image');
  imgEl.src = `images/${imgData.file}`;
  imgEl.style.display = 'block';
  
  currentQuestionData = { type: 'BONUS', reward: reward, correctIndex: correctAnswerIndex };
  const cp = players[currentPlayerIndex];
  updateClientUI(cp.id, 'question', { 
     question: "What is the name of this location?", 
     options: options 
  });
  
  const optionsEl = document.getElementById('q-options');
  optionsEl.innerHTML = '';
  options.forEach((opt, idx) => {
    const btn = document.createElement('div');
    btn.className = 'btn secondary-btn';
    btn.style.opacity = '0.5';
    btn.innerText = opt;
    optionsEl.appendChild(btn);
  });
  
  showModal('question-modal');
}

// Announcement Animation
function showAnnouncement(title, subtitle, type) {
  const annEl = document.getElementById('announcement');
  document.getElementById('announce-title').innerText = title;
  document.getElementById('announce-subtitle').innerText = subtitle;
  
  annEl.className = 'announcement'; 
  void annEl.offsetWidth; 
  annEl.classList.add(type === 'correct' ? 'show-correct' : 'show-wrong');
}

function processQuestionAnswer(qIndex, selectedIndex) {
  const qData = questions[qIndex];
  const cp = players[currentPlayerIndex];
  const isCorrect = (qData.answer === selectedIndex);
  
  hideModal('question-modal');
  
  if (isCorrect) {
    cp.score += qData.reward;
    showAnnouncement('Correct!', `+${qData.reward} ฿`, 'correct');
    updateClientUI(cp.id, 'wait', { message: `Correct! +${qData.reward} ฿` });
  } else {
    showAnnouncement('Wrong!', `Answer: ${qData.options[qData.answer]}`, 'wrong');
    updateClientUI(cp.id, 'wait', { message: `Wrong! Answer was ${qData.options[qData.answer]}` });
  }
  
  updateScoreUI(currentPlayerIndex);
  setTimeout(nextTurn, 2000);
}

function processBonusAnswer(reward, isCorrect) {
  const cp = players[currentPlayerIndex];
  hideModal('question-modal');
  
  if (isCorrect) {
    cp.score += reward;
    showAnnouncement('Awesome!', `+${reward} ฿`, 'correct');
    updateClientUI(cp.id, 'wait', { message: `Correct! +${reward} ฿` });
  } else {
    showAnnouncement('Missed!', 'Better luck next time!', 'wrong');
    updateClientUI(cp.id, 'wait', { message: `Wrong!` });
  }
  
  updateScoreUI(currentPlayerIndex);
  setTimeout(nextTurn, 2000);
}

// Random Bonus Logic
function showRandomBonusModal() {
  const r = Math.floor(Math.random() * randomBonuses.length);
  const bonus = randomBonuses[r];
  
  document.getElementById('bonus-text').innerText = bonus.text;
  
  // We can just automatically process it after a short delay since no player input is needed
  showModal('bonus-modal');
  const cp = players[currentPlayerIndex];
  updateClientUI(cp.id, 'wait', { message: bonus.text });
  
  setTimeout(() => {
    hideModal('bonus-modal');
    
    if (bonus.value === 'START') {
      cp.position = 0;
      updateTokensOnBoard();
      showAnnouncement('Oops!', 'Back to start!', 'wrong');
    } else {
      cp.score += bonus.value;
      if (bonus.value > 0) {
        showAnnouncement('Lucky!', `+${bonus.value} ฿`, 'correct');
      } else {
        showAnnouncement('Unlucky!', `${bonus.value} ฿`, 'wrong');
      }
    }
    
    updateScoreUI(currentPlayerIndex);
    setTimeout(nextTurn, 2000);
  }, 3000);
}

// Quit Logic
window.quitGame = function() {
  if (confirm('Are you sure you want to quit the game? All progress will be lost.')) {
    updateClientUI('all', 'reset');
    setTimeout(() => {
      window.location.reload();
    }, 500);
  }
};
