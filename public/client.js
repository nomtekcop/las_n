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
const opponentNameSpan = document.getElementById('opponent-name');
const opponentMoneySpan = document.getElementById('opponent-money');
const opponentAvatarImg = document.getElementById('opponent-avatar');
const opponentDiceRow = document.getElementById('opponent-dice-row');

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


// 로그 출력
function addLog(text) {
  const p = document.createElement('div');
  p.textContent = text;
  logArea.appendChild(p);
  logArea.scrollTop = logArea.scrollHeight;
}

// 주사위 DOM
function createDie(value, cssClass) {
  const div = document.createElement('div');
  div.className = 'die' + (cssClass ? ' ' + cssClass : '');
  div.textContent = value;
  return div;
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

// 카지노 6개 기본 뼈대 생성
function setupCasinosEmpty() {
  casinoRow.innerHTML = '';
  for (let i = 1; i <= 6; i++) {
    const casino = document.createElement('div');
    casino.className = 'casino';

    const header = document.createElement('div');
    header.className = 'casino-header';

    const die = document.createElement('div');
    die.className = 'casino-die';
    die.textContent = i;

    header.appendChild(die);

    const summary = document.createElement('div');
    summary.className = 'casino-dice-summary';
    summary.id = `casino-dice-${i}`;

    const diceArea = document.createElement('div');
    diceArea.className = 'casino-dice-area';
    diceArea.id = `casino-dice-area-${i}`;

    const moneyList = document.createElement('div');
    moneyList.className = 'casino-money-list';
    moneyList.id = `casino-money-${i}`;

    casino.appendChild(header);
    casino.appendChild(summary);
    casino.appendChild(diceArea);
    casino.appendChild(moneyList);
    casinoRow.appendChild(casino);
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
        moneyList.appendChild(div);
      }, delay);
      delay += stepDelay;
    });
  });
}

// 카지노 위 주사위 요약 + 실제 주사위 아이콘 표시
function updateCasinoDiceSummaries(casinosState) {
  if (!casinosState) return;
  casinosState.forEach((c) => {
    const summaryEl = document.getElementById(`casino-dice-${c.index}`);
    const diceArea = document.getElementById(`casino-dice-area-${c.index}`);
    if (!summaryEl || !diceArea) return;

    if (summaryEl) {
      summaryEl.innerHTML = '';
    }
    diceArea.innerHTML = '';

    players.forEach((p) => {
      const count = c.diceByPlayer?.[p.id] || 0;
      for (let i = 0; i < count; i++) {
        const cls = 'small-die color-' + (p.color || 'red');
        const dieEl = createDie('', cls);
        diceArea.appendChild(dieEl);
      }
    });

    // 중립 주사위도 아이콘만
    const neutralCount = c.neutralCount || 0;
    for (let i = 0; i < neutralCount; i++) {
      const dieEl = createDie('', 'small-die neutral');
      diceArea.appendChild(dieEl);
    }
  });
}


// 남은 주사위 개수를 내/상대 프사 옆에 표시
function updateRemainingDiceUI() {
  const me = players.find((p) => p.id === myId);
  const opp = players.find((p) => p.id !== myId);

  myDiceRow.innerHTML = '';
  opponentDiceRow.innerHTML = '';

  if (!me || !opp) return;

  function renderRemainingDice(container, player) {
    const colorLeft = player.diceColorLeft ?? 0;
    const neutralLeft = player.diceNeutralLeft ?? 0;

    // 색 주사위들
    for (let i = 0; i < colorLeft; i++) {
      container.appendChild(
        createDie('', 'color-' + (player.color || 'red')),
      );
    }
    // 중립 주사위들 (흰색)
    for (let i = 0; i < neutralLeft; i++) {
      container.appendChild(
        createDie('', 'neutral'),
      );
    }
  }

  if (currentTurnId === myId) {
    // 내 턴 → 상대 남은 주사위
    renderRemainingDice(opponentDiceRow, opp);
  } else {
    // 내 턴 아님 → 내 남은 주사위
    renderRemainingDice(myDiceRow, me);
  }
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
  connectSocket();
});

/* ---------- 소켓 & 게임 화면 ---------- */

function connectSocket() {
  socket = io();

  socket.on('connect', () => {
    addLog('서버에 연결되었습니다.');
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
    const opp = list.find((p) => p.id !== myId);

    if (me) {
      isHost = me.index === 1;
      if (isHost && !gameStarted && list.length === 2) {
        startGameBtn.disabled = false;
        roundCountSelect.disabled = false;
      }
    }

    if (opp) {
      opponentNameSpan.textContent = opp.name || '상대 플레이어';
      opponentMoneySpan.textContent = (opp.money ?? 0) + ' $';
      if (opp.avatar) opponentAvatarImg.src = opp.avatar;
    } else {
      opponentNameSpan.textContent = '상대 대기 중…';
      opponentMoneySpan.textContent = '0 $';
      opponentAvatarImg.removeAttribute('src');
    }
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

    players.forEach((p) => {
      if (p.id === myId) {
        myMoneySpan.textContent = (p.money ?? 0) + ' $';
      } else {
        opponentMoneySpan.textContent = (p.money ?? 0) + ' $';
      }
    });

    updateCasinoDiceSummaries(state.casinos || []);
    updateRemainingDiceUI();
  });

  socket.on('diceRolled', ({ rollerId, rollerName, dice }) => {
    const roller = players.find((p) => p.id === rollerId);
    const rollerColor = roller?.color || null;

    addLog(`${rollerName}가 주사위를 굴렸습니다. (${dice.length}개)`);

    renderGroupedDiceRoll(dice, rollerColor);

    choiceRow.innerHTML = '';

    if (rollerId === myId) {
      const values = [...new Set(dice.map((d) => d.value))].sort();
      values.forEach((v) => {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        btn.textContent = `${v}번 카지노에 배팅`;
        btn.addEventListener('click', () => {
          socket.emit('chooseBetValue', v);
          choiceRow.innerHTML = '';
          rollBtn.disabled = true;
        });
        choiceRow.appendChild(btn);
      });
    }
  });

  socket.on('betPlaced', ({ playerId, playerName, casinoIndex, colorCount, neutralCount }) => {
    const owner = playerId === myId ? '나' : playerName;
    addLog(
      `${owner}가 ${casinoIndex}번 카지노에 색 주사위 ${colorCount}개, 중립 ${neutralCount}개를 배팅했습니다.`,
    );

    animateDiceToCasino(playerId, casinoIndex, colorCount, neutralCount);
    rolledDiceRow.innerHTML = '';
  });

  socket.on('payouts', (payouts) => {
  // 서버에서 카지노별로 한 번씩 보내주는 payouts 배열을
  // 큐에 차례대로 쌓아둠 (1번 카지노, 2번 카지노, ...)
  payoutQueue.push(payouts);
  if (!isProcessingPayouts) {
    processNextPayoutBatch();
  }
});

  socket.on('gameOver', ({ players: finalPlayers, winnerId, winnerName, maxRounds }) => {
  gameStarted = false;

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
    socket.emit('startGame');
    startGameBtn.disabled = true;
  });

  rollBtn.addEventListener('click', () => {
    if (!socket) return;
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
  const opp = players.find((p) => p.id !== myId);

  if (me && myAvatarImg) {
    const c = avatarColorMap[me.color] || '#333333';
    myAvatarImg.style.borderColor = c;
  }
  if (opp && opponentAvatarImg) {
    const c = avatarColorMap[opp.color] || '#333333';
    opponentAvatarImg.style.borderColor = c;
  }
}

function animatePayout(payout, index) {
  const { casinoIndex, playerName, amount } = payout;

  const moneyList = document.getElementById(`casino-money-${casinoIndex}`);
  if (!moneyList) return;

  const formatted = amount.toLocaleString() + ' $';

  // 1) 카지노 안에서 이 금액과 같은 지폐 하나 찾기
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

  // 2) 원본 지폐는 카지노에서 제거 (이 순간부터 화면에서 사라짐)
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
    if (myNameSpan.textContent === playerName) {
      targetElem = myMoneySpan;
    } else if (opponentNameSpan.textContent === playerName) {
      targetElem = opponentMoneySpan;
    }
  }

  if (targetElem) {
    const targetRect = targetElem.getBoundingClientRect();
    targetX = targetRect.left + targetRect.width / 2;
    targetY = targetRect.top + targetRect.height / 2;
  }

  // 같은 카지노 안에서도 한 장씩 순차적으로 날리기 위한 딜레이
  const delay = 80 * (index ?? 0);

  setTimeout(() => {
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

  // 큐에서 맨 앞(가장 먼저 온 카지노) 꺼내기
  const payouts = payoutQueue.shift();

  // 혹시 몰라서, 이 카지노 안에서도 큰 돈부터 정렬
  const sorted = [...payouts].sort((a, b) => b.amount - a.amount);

  sorted.forEach((p, idx) => {
    addLog(
      `${p.casinoIndex}번 카지노: ${p.playerName} 이(가) ${p.amount.toLocaleString()} $ 획득!`,
    );
    // idx를 넘겨서 안에서 delay 줄 수 있게
    animatePayout(p, idx);
  });

  // 이 batch 애니메이션이 끝날 때쯤 다음 카지노 처리
  // animatePayout 내부에서 한 장당 최대 ~650ms + idx*80ms 정도 쓰니까
  const perOneMs = 650;
  const gapMs = 80;
  const totalMs = perOneMs + gapMs * (sorted.length + 1);

  setTimeout(() => {
    processNextPayoutBatch();
  }, totalMs);
}




// 선택한 카지노로 주사위 이동 애니메이션
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
