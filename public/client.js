// client.js

// DOM 요소들
const profileScreen = document.getElementById('profile-screen');
const gameScreen = document.getElementById('game-screen');

const nicknameInput = document.getElementById('nickname-input');
const colorSelect = document.getElementById('color-select');
const avatarDrop = document.getElementById('avatar-drop');
const avatarInput = document.getElementById('avatar-input');
const avatarDropText = document.getElementById('avatar-drop-text');
const enterGameBtn = document.getElementById('enter-game-btn');

const roundNumberSpan = document.getElementById('round-number');
const topPlayerArea = document.getElementById('top-player-area');

const myNameSpan = document.getElementById('my-name');
const myMoneySpan = document.getElementById('my-money');
const myAvatarImg = document.getElementById('my-avatar');
const myDiceRow = document.getElementById('my-dice-row');

const gameOverPanel = document.getElementById('game-over-panel');
const gameOverTitle = document.getElementById('game-over-title');
const gameOverList = document.getElementById('game-over-list');
const restartBtn = document.getElementById('restart-btn');

const turnIndicator = document.getElementById('turn-indicator');
const rolledDiceRow = document.getElementById('rolled-dice-row');
const rollBtn = document.getElementById('roll-btn');
const startGameBtn = document.getElementById('start-game-btn');
const choiceRow = document.getElementById('choice-row');
const casinoRow = document.getElementById('casino-row');
const logArea = document.getElementById('log-area');
const roundCountSelect = document.getElementById('round-count-select');
const logContainer = document.getElementById('log-container');   // ✅ 추가
const logToggleBtn = document.getElementById('log-toggle-btn');  // ✅ 추가

// 🎵 오디오 & 슬라이더
const bgm = document.getElementById('bgm');
const sfxStart = document.getElementById('sfx-start');
const sfxDice = document.getElementById('sfx-dice');
const sfxMoney = document.getElementById('sfx-money');
const sfxWin = document.getElementById('sfx-win');

const bgmVolumeSlider = document.getElementById('bgm-volume');

// 기본 볼륨 세팅 (너가 듣기 좋은 값으로 조정 가능)
if (bgm) bgm.volume = 0.25;
if (sfxStart) sfxStart.volume = 0.4;
if (sfxDice) sfxDice.volume = 0.45;
if (sfxMoney) sfxMoney.volume = 0.35;
if (sfxWin) sfxWin.volume = 0.5;

// 🔊 슬라이더로 BGM 볼륨 조절
if (bgm && bgmVolumeSlider) {
  bgmVolumeSlider.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    bgm.volume = v;
  });
}

const avatarColorMap = {
  red: '#ff7675',
  blue: '#74b9ff',
  green: '#55efc4',
  yellow: '#ffeaa7',
  purple: '#a29bfe',
  pink: '#fd79a8',
  black: '#636e72',
};


let socket = null;
let myId = null;
let myProfile = {
  name: '',
  avatar: null,
  color: 'red',
};
let players = [];
let currentTurnId = null;
let isHost = false;
let gameStarted = false;
let currentMaxRounds = 4;
let payoutQueue = [];
let isProcessingPayouts = false;
let latestCasinosState = [];

// 로그 출력
function addLog(text) {
  const p = document.createElement('div');
  p.textContent = text;
  logArea.appendChild(p);
  logArea.scrollTop = logArea.scrollHeight;
}

if (logToggleBtn && logContainer) {
  logToggleBtn.addEventListener('click', () => {
    const isCollapsed = logContainer.classList.toggle('collapsed');
    logToggleBtn.textContent = isCollapsed ? '로그 켜기' : '로그 끄기';
  });
}

function renderOpponentPanels() {
  if (!topPlayerArea) return;
  topPlayerArea.innerHTML = '';

  // 아직 내 id를 모르면 렌더 안 함
  if (!myId) return;

  const me = players.find((p) => p.id === myId);
  const others = players.filter((p) => p.id !== myId);

  // 상대가 0명인 경우
  if (others.length === 0) {
    return;
  }

  // 컨테이너 스타일: 여러 명 가로로 배치
  topPlayerArea.style.display = 'flex';
  topPlayerArea.style.justifyContent = 'center';
  topPlayerArea.style.gap = '24px';

  others.forEach((p) => {
    const panel = document.createElement('div');
    panel.className = 'player-panel opponent-panel';
    panel.dataset.playerId = p.id;

    // 아바타 src, 이름, 돈, 주사위 표시 자리
    const avatarSrc = p.avatar || '';
    const displayName = p.name || '플레이어';

    panel.innerHTML = `
      <div class="avatar-circle">
        <img class="avatar-img" src="${avatarSrc}" alt="" />
      </div>
      <div>
        <div class="player-name">${displayName}</div>
        <div class="player-money" data-player-id="${p.id}">
          ${(p.money ?? 0).toLocaleString()} $
        </div>
      </div>
      <div class="opponent-dice-row" data-player-id="${p.id}"></div>
    `;

    topPlayerArea.appendChild(panel);
  });
}

// 주사위 DOM
function createDie(value, cssClass) {
  const div = document.createElement('div');
  div.className = 'die' + (cssClass ? ' ' + cssClass : '');

  const v = Number(value);

  // 1~6이면 숫자 대신 눈(●)으로 표현할 준비
  if (v >= 1 && v <= 6) {
    div.classList.add('value-' + v);
    // 숫자는 보여줄 필요 없으니까 텍스트는 넣지 않음
  } else {
    // 그 외(예: 그냥 색 표시용 작은 주사위, 혹은 다른 용도)는 그대로 텍스트
    div.textContent = value;
  }

  return div;
}

function play(sound) {
  if (!sound) return;
  sound.currentTime = 0;
  sound.play().catch(() => {});
}

// 굴린 주사위 표시 (숫자별로 모으는 애니메이션 느낌)
function renderGroupedDiceRoll(dice, playerColor) {
  rolledDiceRow.innerHTML = '';

  const groups = {};
  for (let v = 1; v <= 6; v++) groups[v] = [];
  dice.forEach((d) => {
    groups[d.value].push(d);
  });

  for (let v = 1; v <= 6; v++) {
    const bucket = document.createElement('div');
    bucket.style.display = 'flex';
    bucket.style.flexDirection = 'column';
    bucket.style.alignItems = 'center';
    bucket.style.margin = '0 4px';

    const stack = document.createElement('div');
    stack.style.display = 'flex';
    stack.style.flexWrap = 'wrap';
    stack.style.justifyContent = 'center';
    stack.style.minHeight = '20px';
    bucket.appendChild(stack);

    rolledDiceRow.appendChild(bucket);

    const diceOfValue = groups[v];
    diceOfValue.forEach((d, idx) => {
      setTimeout(() => {
        let cls = '';
        if (d.type === 'color' && playerColor) {
          cls = 'color-' + playerColor;
        } else if (d.type === 'neutral') {
          cls = 'neutral';
        }
        const dieEl = createDie(d.value, cls);
        stack.appendChild(dieEl);
      }, idx * 70);
    });
  }
}

// 슬롯 6개 기본 뼈대 생성
function setupCasinosEmpty() {
  casinoRow.innerHTML = '';

  for (let i = 1; i <= 6; i++) {
    const casino = document.createElement('div');
    casino.className = 'casino';

    const header = document.createElement('div');
    header.className = 'casino-header';

    // 슬롯 번호 박스
    const label = document.createElement('div');
    label.className = 'casino-die';
    label.textContent = String(i);
    header.appendChild(label);
   
    // 주사위 요약
    const summary = document.createElement('div');
    summary.className = 'casino-dice-summary';
    summary.id = `casino-dice-${i}`;

    // 주사위 아이콘 영역
    const diceArea = document.createElement('div');
    diceArea.className = 'casino-dice-area';
    diceArea.id = `casino-dice-area-${i}`;

    // 돈(지폐) 표시 영역
    const moneyList = document.createElement('div');
    moneyList.className = 'casino-money-list';
    moneyList.id = `casino-money-${i}`;

    // 🔽 구성 요소 추가 순서
    casino.appendChild(header);
    casino.appendChild(summary);
    casino.appendChild(diceArea);
    casino.appendChild(moneyList);

    casinoRow.appendChild(casino);
  }
}

// 굴린 주사위 아래에 1~6 슬롯용 베팅 버튼 6개 깔기
function setupBetButtonsRow() {
  if (!choiceRow) return;
  choiceRow.innerHTML = '';

  for (let i = 1; i <= 6; i++) {
    const cell = document.createElement('div');
    cell.className = 'choice-cell';

    const betBtn = document.createElement('button');
    betBtn.className = 'bet-btn hidden';
    betBtn.textContent = '이 슬롯에 배팅';
    betBtn.dataset.casinoIndex = i;
    betBtn.addEventListener('click', () => {
      if (!socket) return;
      socket.emit('chooseBetValue', i);
      hideAllBetButtons();
      rollBtn.disabled = true;
    });

    cell.appendChild(betBtn);
    choiceRow.appendChild(cell);
  }
}

// 라운드 시작 시 돈 배치 애니메이션
function animateRoundSetup(payload) {
  const { round, casinos, maxRounds } = payload;
  if (maxRounds) {
    currentMaxRounds = maxRounds;
    roundCountSelect.value = String(maxRounds);
  }
  roundNumberSpan.textContent = String(round);

  setupCasinosEmpty();

  let delay = 0;
  const stepDelay = 400;

  casinos.forEach((c) => {
    const moneyList = document.getElementById(`casino-money-${c.index}`);
    if (!moneyList) return;

    const sortedNotes = [...c.banknotes].sort((a, b) => a - b);

    sortedNotes.forEach((note) => {
      setTimeout(() => {
        const div = document.createElement('div');
        div.className = 'casino-money';
        div.textContent = note.toLocaleString() + ' $';

        // 💰 금액별로 색상을 주기 위한 클래스
        switch (note) {
          case 10000: div.classList.add('money-10000'); break;
          case 20000: div.classList.add('money-20000'); break;
          case 30000: div.classList.add('money-30000'); break;
          case 40000: div.classList.add('money-40000'); break;
          case 50000: div.classList.add('money-50000'); break;
          case 60000: div.classList.add('money-60000'); break;
          case 70000: div.classList.add('money-70000'); break;
          case 80000: div.classList.add('money-80000'); break;
          case 90000: div.classList.add('money-90000'); break;
          default: break;
        }

        moneyList.appendChild(div);
      }, delay);
      delay += stepDelay;
    });
  });
}

// 슬롯 위 주사위 요약 + 실제 주사위 아이콘 표시
function updateCasinoDiceSummaries(casinosState) {
  if (!casinosState) return;

  casinosState.forEach((c) => {
    const summaryEl = document.getElementById(`casino-dice-${c.index}`);
    const diceArea = document.getElementById(`casino-dice-area-${c.index}`);
    if (!summaryEl || !diceArea) return;

    summaryEl.innerHTML = '';
    diceArea.innerHTML = '';

    // 플레이어 색 주사위들
    players.forEach((p) => {
      const count = c.diceByPlayer?.[p.id] || 0;
      for (let i = 0; i < count; i++) {
        const cls = 'small-die color-' + (p.color || 'red');
        const dieEl = createDie(c.index, cls);   // 슬롯 번호만큼 눈 표시
        dieEl.dataset.playerId = p.id;         // 🔹 이 줄 추가
        diceArea.appendChild(dieEl);
      }
    });

    // 중립 주사위들
    const neutralCount = c.neutralCount || 0;
    for (let i = 0; i < neutralCount; i++) {
      const dieEl = createDie(c.index, 'small-die neutral');
      diceArea.appendChild(dieEl);
    }
  });
}



// 남은 주사위 개수를 내/상대 프사 옆에 "아이콘 + 개수"로 표시
function updateRemainingDiceUI() {
  const me = players.find((p) => p.id === myId);
  if (!me) return;

  // 공통 렌더 함수: 색 주사위 ? 하나 + 숫자, 중립 주사위 ? 하나 + 숫자
  function renderRemainingDiceSummary(container, player) {
    if (!container) return;
    container.innerHTML = '';

    const colorLeft = player.diceColorLeft ?? 0;
    const neutralLeft = player.diceNeutralLeft ?? 0;

    if (colorLeft <= 0 && neutralLeft <= 0) return;

    // 색 주사위
    if (colorLeft > 0) {
      const wrap = document.createElement('div');
      wrap.className = 'dice-count';

      const icon = createDie('?', 'small-die color-' + (player.color || 'red'));
      const text = document.createElement('span');
      text.textContent = `× ${colorLeft}`;

      wrap.appendChild(icon);
      wrap.appendChild(text);
      container.appendChild(wrap);
    }

    // 중립 주사위
    if (neutralLeft > 0) {
      const wrap = document.createElement('div');
      wrap.className = 'dice-count';

      const icon = createDie('?', 'small-die neutral');
      const text = document.createElement('span');
      text.textContent = `× ${neutralLeft}`;

      wrap.appendChild(icon);
      wrap.appendChild(text);
      container.appendChild(wrap);
    }
  }

  // 내 주사위
  if (myDiceRow) {
    renderRemainingDiceSummary(myDiceRow, me);
  }

  // 상대들 주사위
  const others = players.filter((p) => p.id !== myId);
  others.forEach((p) => {
    const row = document.querySelector(
      `.opponent-dice-row[data-player-id="${p.id}"]`
    );
    if (row) {
      renderRemainingDiceSummary(row, p);
    }
  });
}

    
// 아바타 dataURL 읽기
function readAvatarFile(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

/* ---------- 프로필 화면 ---------- */

avatarDrop.addEventListener('click', () => {
  avatarInput.click();
});

avatarInput.addEventListener('change', async () => {
  const file = avatarInput.files[0];
  if (!file) return;
  const dataUrl = await readAvatarFile(file);
  if (!dataUrl) return;
  myProfile.avatar = dataUrl;
  avatarDropText.style.display = 'none';

  avatarDrop.innerHTML = '';
  const img = document.createElement('img');
  img.src = dataUrl;
  avatarDrop.appendChild(img);
});

enterGameBtn.addEventListener('click', async () => {
  const nickname = nicknameInput.value.trim();
  if (!nickname) {
    alert('닉네임을 입력해줘!');
    return;
  }
  myProfile.name = nickname;
  myProfile.color = colorSelect.value;

  if (!myProfile.avatar && avatarInput.files[0]) {
    myProfile.avatar = await readAvatarFile(avatarInput.files[0]);
  }

  profileScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  setupCasinosEmpty();
  setupBetButtonsRow();   // ✅ 굴린 주사위 아래 베팅 버튼 줄 세팅
  connectSocket();
  play(bgm);
bgm.volume = 0.4; // 볼륨 적당하게
});

/* ---------- 소켓 & 게임 화면 ---------- */

function connectSocket() {
 if (socket && (socket.connected || socket.connecting)) {
    return;
  }

  socket = io();

  socket.on('connect', () => {
    addLog('서버에 연결되었습니다.');
    // 확인용으로 콘솔에도 찍어봐도 좋음
    console.log('소켓 연결됨:', socket.id);
 });
  
  socket.on('awaitProfile', () => {
    socket.emit('registerProfile', {
      name: myProfile.name,
      avatar: myProfile.avatar,
      color: myProfile.color,
    });
  });

  socket.on('roomFull', () => {
    alert('이미 두 명이 입장해서 방이 꽉 찼어!');
  });

  socket.on('playerInfo', (info) => {
    myId = info.id;
    myNameSpan.textContent = info.name || '나';
    myMoneySpan.textContent = (info.money ?? 0) + ' $';
    if (info.avatar) myAvatarImg.src = info.avatar;
  });

  socket.on('playerList', (list) => {
  players = list;

  const me = list.find((p) => p.id === myId);

  if (me) {
    isHost = me.index === 1;
    // 내 이름, 돈, 아바타 갱신
    myNameSpan.textContent = me.name || '나';
    myMoneySpan.textContent = (me.money ?? 0).toLocaleString() + ' $';
    if (me.avatar) myAvatarImg.src = me.avatar;

    // 내 돈 span에도 playerId 달아두면 나중에 공통 처리 편해짐
    myMoneySpan.dataset.playerId = me.id;
  }

  // 시작 버튼 활성화 조건: 2~4명, 아직 게임 시작 전, 내가 호스트일 때
  if (me) {
    if (isHost && !gameStarted && list.length >= 2 && list.length <= 4) {
      startGameBtn.disabled = false;
      roundCountSelect.disabled = false;
    } else if (!gameStarted) {
      startGameBtn.disabled = true;
      roundCountSelect.disabled = true;
    }
  }

  // 상대들 패널 다시 그림
  renderOpponentPanels();
  updateAvatarBorders();
});


  
  socket.on('readyToStart', ({ hostId, maxRounds }) => {
    if (maxRounds) {
      currentMaxRounds = maxRounds;
      roundCountSelect.value = String(maxRounds);
    }
    if (myId === hostId) {
      startGameBtn.disabled = false;
      roundCountSelect.disabled = false;
      addLog('두 명 모두 입장! 선 플레이어가 [게임 시작]과 라운드 수를 설정하세요.');
    } else {
      startGameBtn.disabled = true;
      roundCountSelect.disabled = true;
      addLog('두 명 모두 입장! 선 플레이어가 게임을 시작할 때까지 기다려주세요.');
    }
  });

  socket.on('configUpdated', ({ maxRounds }) => {
    if (maxRounds) {
      currentMaxRounds = maxRounds;
      roundCountSelect.value = String(maxRounds);
      addLog(`라운드 수가 ${maxRounds}로 설정되었습니다.`);
    }
  });

  socket.on('gameStarted', ({ round, maxRounds }) => {
  gameStarted = true;

  // ✅ 새 게임 시작할 때 모든 사람 화면에서 점수판 숨기기
  if (typeof gameOverPanel !== 'undefined' && gameOverPanel) {
    gameOverPanel.classList.add('hidden');
  }

  startGameBtn.disabled = true;
  startGameBtn.classList.add('hidden');
  roundCountSelect.disabled = true;
  if (maxRounds) {
    currentMaxRounds = maxRounds;
    roundCountSelect.value = String(maxRounds);
  }
  roundNumberSpan.textContent = String(round);
  addLog(`게임 시작! ROUND ${round} / ${currentMaxRounds}`);
});

  socket.on('roundSetup', (payload) => {
    animateRoundSetup(payload);
  });

  socket.on('turnChanged', ({ currentPlayerId, currentPlayerName }) => {
    currentTurnId = currentPlayerId;
    updateTurnUI(currentPlayerId, currentPlayerName);
    updateRemainingDiceUI();
  });

    socket.on('gameState', (state) => {
  if (state.round) {
    roundNumberSpan.textContent = String(state.round);
  }
  players = state.players || players;
  currentTurnId = state.currentTurnId || currentTurnId;
  if (state.maxRounds) {
    currentMaxRounds = state.maxRounds;
    roundCountSelect.value = String(state.maxRounds);
  }

  // 💰 모든 플레이어 돈 텍스트 갱신
  players.forEach((p) => {
    // 내 돈
    if (p.id === myId) {
      myMoneySpan.textContent =
        (p.money ?? 0).toLocaleString() + ' $';
      myMoneySpan.dataset.playerId = p.id;
    }

    // 상대들 돈
    const moneyElem = document.querySelector(
      `.player-money[data-player-id="${p.id}"]`
    );
    if (moneyElem) {
      moneyElem.textContent = (p.money ?? 0).toLocaleString() + ' $';
    }
  });

  // 🔹 최신 슬롯 상태 저장
  latestCasinosState = state.casinos || [];

  updateCasinoDiceSummaries(state.casinos || []);
  updateRemainingDiceUI();
  renderOpponentPanels();   // 혹시 인원 변동시 다시 그리기
  updateAvatarBorders();
});

  socket.on('diceRolled', ({ rollerId, rollerName, dice }) => {
    const roller = players.find((p) => p.id === rollerId);
    const rollerColor = roller?.color || null;

    addLog(`${rollerName}가 주사위를 굴렸습니다. (${dice.length}개)`);

    renderGroupedDiceRoll(dice, rollerColor);

    if (rollerId === myId) {
      // 🔹 내 턴이면, 굴린 눈에 해당하는 슬롯에만 베팅 버튼 보여주기
      showBetButtonsForDice(dice);
    } else {
      // 상대 턴이면 모두 숨김
      hideAllBetButtons();
    }
  });

  socket.on('betPlaced', ({ playerId, playerName, casinoIndex, colorCount, neutralCount }) => {
    const owner = playerId === myId ? '나' : playerName;
    addLog(
      `${owner}가 ${casinoIndex}번 슬롯에 색 주사위 ${colorCount}개, 중립 ${neutralCount}개를 배팅했습니다.`,
    );

    animateDiceToCasino(playerId, casinoIndex, colorCount, neutralCount);
    rolledDiceRow.innerHTML = '';
    hideAllBetButtons();   // 🔹 베팅 끝나면 슬롯 버튼도 닫기
  });

  socket.on('payouts', (payouts) => {
  // 서버에서 슬롯별로 한 번씩 보내주는 payouts 배열을
  // 큐에 차례대로 쌓아둠 (1번 슬롯, 2번 슬롯, ...)
  payoutQueue.push(payouts);
  if (!isProcessingPayouts) {
    processNextPayoutBatch();
  }
});

  socket.on('gameOver', ({ players: finalPlayers, winnerId, winnerName, maxRounds }) => {
  gameStarted = false;
  play(sfxWin);
  const rounds = maxRounds || currentMaxRounds;
  gameOverTitle.textContent = `게임 종료 (총 ${rounds}라운드)`;

  // money 기준으로 순위 정렬
  const sorted = [...finalPlayers].sort(
    (a, b) => (b.money ?? 0) - (a.money ?? 0),
  );

  gameOverList.innerHTML = '';

  sorted.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'game-over-row';
    row.textContent = `${idx + 1}위 - ${p.name}: ${(p.money ?? 0).toLocaleString()} $`;
    if (p.id === winnerId) {
      row.classList.add('winner');
    }
    gameOverList.appendChild(row);
  });

  // 호스트는 다시 시작 가능, 게스트는 읽기만
  if (isHost) {
    restartBtn.disabled = false;
    restartBtn.textContent = '같은 인원으로 다시 하기';
  } else {
    restartBtn.disabled = true;
    restartBtn.textContent = '호스트가 다시 시작할 때까지 대기 중';
  }

  // 다시 시작 버튼(위에 있는 기존 버튼)도 재활성화
  if (isHost) {
    startGameBtn.disabled = false;
  }

  gameOverPanel.classList.remove('hidden');
});

  socket.on('notYourTurn', () => {
    addLog('⚠ 아직 네 턴이 아니야!');
  });

  socket.on('rollRejected', () => {
    addLog('이미 굴린 주사위를 먼저 배팅해야 해!');
  });

  socket.on('noDiceLeft', () => {
    addLog('더 이상 굴릴 주사위가 없어. 이번 라운드에 할 수 있는 건 끝!');
  });

  startGameBtn.addEventListener('click', () => {
    if (!isHost) return;
    play(sfxStart);
    socket.emit('startGame');
    startGameBtn.disabled = true;
  });

  rollBtn.addEventListener('click', () => {
    if (!socket) return;
    play(sfxDice);
    myDiceRow.innerHTML = '';
    socket.emit('rollDice');
  });

  roundCountSelect.addEventListener('change', () => {
    if (!socket) return;
    if (!isHost || gameStarted) return;
    const v = Number(roundCountSelect.value);
    if (v >= 1 && v <= 4) {
      socket.emit('setMaxRounds', v);
    }
  });

restartBtn.addEventListener('click', () => {
  gameOverPanel.classList.add('hidden');

  if (!socket) return;

  if (isHost) {
    startGameBtn.disabled = true;
    socket.emit('startGame');
  } else {
    addLog('호스트가 다시 시작하면 새 게임이 시작됩니다!');
  }
});

}

function updateTurnUI(currentPlayerId, currentPlayerName) {
  const isMyTurn = myId && currentPlayerId === myId;
  if (isMyTurn) {
    turnIndicator.textContent = '내 차례';
    rollBtn.disabled = false;
  } else if (currentPlayerName) {
    turnIndicator.textContent = `${currentPlayerName}의 차례`;
    rollBtn.disabled = true;
  } else {
    turnIndicator.textContent = '대기 중…';
    rollBtn.disabled = true;
  }
}

function updateAvatarBorders() {
  const me = players.find((p) => p.id === myId);

  if (me && myAvatarImg) {
    const c = avatarColorMap[me.color] || '#333333';
    myAvatarImg.style.borderColor = c;
  }

  // 상대들 아바타
  const others = players.filter((p) => p.id !== myId);
  others.forEach((p) => {
    const panel = document.querySelector(
      `.opponent-panel[data-player-id="${p.id}"]`
    );
    if (!panel) return;
    const img = panel.querySelector('.avatar-img');
    if (!img) return;
    const c = avatarColorMap[p.color] || '#333333';
    img.style.borderColor = c;
  });
}

// 모든 슬롯의 베팅 버튼 숨기기
function hideAllBetButtons() {
  document.querySelectorAll('.bet-btn').forEach((btn) => {
    btn.classList.add('hidden');
    btn.disabled = true;
  });
}

// 내 주사위 결과에 해당하는 슬롯만 베팅 버튼 보여주기
function showBetButtonsForDice(dice) {
  hideAllBetButtons();
  if (!dice || !Array.isArray(dice)) return;

  const values = [...new Set(dice.map((d) => d.value))];  // 중복 제거
  values.forEach((v) => {
    const btn = document.querySelector(`.bet-btn[data-casino-index="${v}"]`);
    if (btn) {
      btn.classList.remove('hidden');
      btn.disabled = false;
    }
  });
}

function darkenTiedDiceForCasino(casinoIndex) {
  if (!latestCasinosState || latestCasinosState.length === 0) return;

  // 1) 이 슬롯 상태 찾기
  const casino = latestCasinosState.find((c) => c.index === casinoIndex);
  if (!casino || !casino.diceByPlayer) return;

  // 2) 각 플레이어별 주사위 개수 (0개는 제외)
  const entries = Object.entries(casino.diceByPlayer)
    .filter(([_, count]) => count > 0);
  if (entries.length === 0) return;

  // 3) 개수별로 묶기: { count: [playerId1, playerId2, ...] }
  const byCount = {};
  for (const [playerId, count] of entries) {
    if (!byCount[count]) byCount[count] = [];
    byCount[count].push(playerId);
  }

  // 4) 그 중에서 "2명 이상"인 그룹 = 동률 그룹
  const tiedIds = new Set();
  Object.values(byCount).forEach((playerIdList) => {
    if (playerIdList.length > 1) {
      playerIdList.forEach((id) => tiedIds.add(id));
    }
  });

  // 동률이 하나도 없으면 끝
  if (tiedIds.size === 0) return;

  // 5) DOM에서 해당 슬롯 주사위들 중, tiedIds에 포함된 플레이어의 주사위만 어둡게
  const diceArea = document.getElementById(`casino-dice-area-${casinoIndex}`);
  if (!diceArea) return;

  diceArea.querySelectorAll('.die').forEach((dieEl) => {
    const pid = dieEl.dataset.playerId;
    if (pid && tiedIds.has(pid)) {
      dieEl.classList.add('muted-die');
    }
  });
}


function animatePayout(payout, index) {
  const { casinoIndex, playerName, amount } = payout;

  const moneyList = document.getElementById(`casino-money-${casinoIndex}`);
  if (!moneyList) return;

  const formatted = amount.toLocaleString() + ' $';

  // 1) 슬롯 안에서 이 금액과 같은 지폐 하나 찾기
  let sourceNote = null;
  const notes = Array.from(
    moneyList.getElementsByClassName('casino-money'),
  );
  sourceNote = notes.find(
    (el) => el.textContent.trim() === formatted,
  );

  // 못 찾으면 그냥 첫 번째 지폐라도 사용
  if (!sourceNote && notes.length > 0) {
    sourceNote = notes[notes.length - 1];
  }
  if (!sourceNote) return;

  const sourceRect = sourceNote.getBoundingClientRect();

  // 2) 원본 지폐는 슬롯에서 제거 (이 순간부터 화면에서 사라짐)
  moneyList.removeChild(sourceNote);

  // 3) 화면에 날릴 지폐 하나 새로 만들어서 같은 위치에서 시작
  const moneyEl = sourceNote.cloneNode(true);
  moneyEl.classList.add('animating-money');

  const startX = sourceRect.left + sourceRect.width / 2;
  const startY = sourceRect.top + sourceRect.height / 2;
  moneyEl.style.left = startX + 'px';
  moneyEl.style.top = startY + 'px';

  document.body.appendChild(moneyEl);

  // 도착 위치 계산 (기본값: 위로 살짝)
  let targetX = startX;
  let targetY = sourceRect.top - 40;

  let targetElem = null;

  if (playerName !== '중립') {
    // 이름으로 플레이어 찾기
    const targetPlayer = players.find((p) => p.name === playerName);

    if (targetPlayer) {
      // 내가 받는 돈이면 내 돈 칸으로
      if (targetPlayer.id === myId) {
        targetElem = myMoneySpan;
      } else {
        // 상대 플레이어면, 해당 플레이어의 돈 칸 찾기
        targetElem = document.querySelector(
          `.player-money[data-player-id="${targetPlayer.id}"]`
        );
      }
    }
  }

  if (targetElem) {
    const targetRect = targetElem.getBoundingClientRect();
    targetX = targetRect.left + targetRect.width / 2;
    targetY = targetRect.top + targetRect.height / 2;
  }

  // 같은 슬롯 안에서도 한 장씩 순차적으로 날리기 위한 딜레이
  const delay = 80 * (index ?? 0);

  setTimeout(() => {
    play(sfxMoney);
    moneyEl.style.left = targetX + 'px';
    moneyEl.style.top = targetY + 'px';
    moneyEl.style.transform = 'scale(0.8)';
    moneyEl.style.opacity = '0';
  }, 30 + delay);

  setTimeout(() => {
    if (moneyEl.parentNode) {
      moneyEl.parentNode.removeChild(moneyEl);
    }
  }, 650 + delay);
}


function processNextPayoutBatch() {
  if (payoutQueue.length === 0) {
    isProcessingPayouts = false;
    return;
  }

  isProcessingPayouts = true;

  // 큐에서 맨 앞(가장 먼저 온 슬롯) 꺼내기
  const payouts = payoutQueue.shift();
 if (!payouts || payouts.length === 0) {
    // 비어 있으면 바로 다음
    setTimeout(processNextPayoutBatch, 0);
    return;
  }

  // 🔹 여기서 이 batch가 어떤 슬롯인지 알아내기
  const casinoIndex = payouts[0].casinoIndex;
  if (casinoIndex != null) {
    darkenTiedDiceForCasino(casinoIndex);
  }
  // 혹시 몰라서, 이 슬롯 안에서도 큰 돈부터 정렬
  const sorted = [...payouts].sort((a, b) => b.amount - a.amount);

  sorted.forEach((p, idx) => {
    addLog(
      `${p.casinoIndex}번 슬롯: ${p.playerName} 이(가) ${p.amount.toLocaleString()} $ 획득!`,
    );
    // idx를 넘겨서 안에서 delay 줄 수 있게
    animatePayout(p, idx);
  });

  // 이 batch 애니메이션이 끝날 때쯤 다음 슬롯 처리
  // animatePayout 내부에서 한 장당 최대 ~650ms + idx*80ms 정도 쓰니까
  const perOneMs = 650;
  const gapMs = 80;
  const totalMs = perOneMs + gapMs * (sorted.length + 1);

  setTimeout(() => {
    processNextPayoutBatch();
  }, totalMs);
}




// 선택한 슬롯로 주사위 이동 애니메이션
function animateDiceToCasino(playerId, casinoIndex, colorCount, neutralCount) {
  const sourceRect = rolledDiceRow.getBoundingClientRect();
  const targetArea = document.getElementById(`casino-dice-area-${casinoIndex}`);
  if (!targetArea) return;
  const targetRect = targetArea.getBoundingClientRect();

  const player = players.find((p) => p.id === playerId);
  const colorClass = player ? 'color-' + (player.color || 'red') : '';

  const total = colorCount + neutralCount;
  const angleStep = (Math.PI * 2) / Math.max(total, 1);
  let idx = 0;

  function spawnAnimatingDie(isColor) {
    const dieEl = document.createElement('div');
    dieEl.className =
      'die animating-die ' + (isColor ? colorClass : 'neutral');
    dieEl.textContent = '';

    const startX = sourceRect.left + sourceRect.width / 2;
    const startY = sourceRect.top + sourceRect.height / 2;
    dieEl.style.left = startX + 'px';
    dieEl.style.top = startY + 'px';

    document.body.appendChild(dieEl);

    const angle = idx * angleStep;
    const endX = targetRect.left + targetRect.width / 2 + Math.cos(angle) * 10;
    const endY = targetRect.top + targetRect.height / 2 + Math.sin(angle) * 10;

    requestAnimationFrame(() => {
      dieEl.style.left = endX + 'px';
      dieEl.style.top = endY + 'px';
      dieEl.style.transform = 'scale(0.7)';
    });

    setTimeout(() => {
      document.body.removeChild(dieEl);
      // 최종 상태는 gameState에서 다시 그림
    }, 450);

    idx++;
  }

  for (let i = 0; i < colorCount; i++) {
    setTimeout(() => spawnAnimatingDie(true), i * 60);
  }
  for (let i = 0; i < neutralCount; i++) {
    setTimeout(() => spawnAnimatingDie(false), (colorCount + i) * 60);
  }
}
