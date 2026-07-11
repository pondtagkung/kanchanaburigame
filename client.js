let ws;
const playerId = Math.random().toString(36).substring(2, 10);
let playerName = "";

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
  
  ws.onopen = () => {
    document.getElementById('status-bar').innerText = 'Connected!';
    if (playerName) {
       ws.send(JSON.stringify({
         action: 'join_game',
         id: playerId,
         name: playerName
       }));
    }
    
    if (window.pingInterval) clearInterval(window.pingInterval);
    window.pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'ping' }));
      }
    }, 30000);
  };
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'ui_update') {
      const state = data.state;
      const payload = data.payload || {};
      
      // Hide all views
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      
      if (state === 'wait') {
        document.getElementById('wait-view').classList.add('active');
        document.getElementById('wait-message').innerText = payload.message || 'Waiting...';
      }
      else if (state === 'roll') {
        document.getElementById('roll-view').classList.add('active');
        if (payload.color) {
          document.body.style.background = payload.color;
        }
      }
      else if (state === 'question') {
        document.getElementById('question-view').classList.add('active');
        document.getElementById('question-text').innerText = payload.question;
        
        const container = document.getElementById('options-container');
        container.innerHTML = '';
        payload.options.forEach((opt, idx) => {
          const btn = document.createElement('button');
          btn.className = 'opt-btn';
          btn.innerText = opt;
          btn.onclick = () => window.answerQuestion(idx);
          container.appendChild(btn);
        });
      }
    }
  };
  
  ws.onclose = () => {
    document.getElementById('status-bar').innerText = 'Disconnected. Reconnecting...';
    setTimeout(connectWebSocket, 2000);
  };
}

window.joinGame = function() {
  const nameInput = document.getElementById('player-name').value.trim();
  if (!nameInput) return alert('Enter a name');
  
  playerName = nameInput;
  document.getElementById('join-screen').classList.remove('active');
  document.getElementById('controller-screen').classList.add('active');
  
  connectWebSocket();
};

window.rollDice = function() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      action: 'roll_dice',
      id: playerId
    }));
    // Optimistic UI update
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('wait-view').classList.add('active');
    document.getElementById('wait-message').innerText = 'Rolling... 🎲';
    document.body.style.background = 'var(--bg)';
  }
};

window.answerQuestion = function(idx) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      action: 'answer',
      id: playerId,
      answer_index: idx
    }));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('wait-view').classList.add('active');
    document.getElementById('wait-message').innerText = 'Answer sent! Waiting...';
  }
};
