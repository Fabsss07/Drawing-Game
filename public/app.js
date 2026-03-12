const socket = io()

const joinScreen = document.getElementById('joinScreen')
const lobbyScreen = document.getElementById('lobbyScreen')
const gameScreen = document.getElementById('gameScreen')

const roomInput = document.getElementById('roomInput')
const joinBtn = document.getElementById('joinBtn')
const joinMessage = document.getElementById('joinMessage')

const roomCodeText = document.getElementById('roomCodeText')
const hostText = document.getElementById('hostText')
const playerList = document.getElementById('playerList')
const startBtn = document.getElementById('startBtn')
const lobbyMessage = document.getElementById('lobbyMessage')

const roleText = document.getElementById('roleText')
const promptText = document.getElementById('promptText')
const timerText = document.getElementById('timerText')
const gameMessage = document.getElementById('gameMessage')

const colorPicker = document.getElementById('colorPicker')
const brushSize = document.getElementById('brushSize')
const brushSizeValue = document.getElementById('brushSizeValue')
const clearBtn = document.getElementById('clearBtn')
const submitDrawingBtn = document.getElementById('submitDrawingBtn')
const canvas = document.getElementById('drawingCanvas')
const ctx = canvas.getContext('2d')

const submissionStatus = document.getElementById('submissionStatus')
const votingScreen = document.getElementById('votingScreen')
const drawingsGrid = document.getElementById('drawingsGrid')

const voteStatus = document.getElementById('voteStatus')
const voteMessage = document.getElementById('voteMessage')
const resultScreen = document.getElementById('resultScreen')
const winnerText = document.getElementById('winnerText')
const imposterRevealText = document.getElementById('imposterRevealText')
const votedOutText = document.getElementById('votedOutText')
const voteResultsList = document.getElementById('voteResultsList')

let drawing = false
let hasSubmittedDrawing = false
let lastX = 0
let lastY = 0
let hasVoted = false
let latestCanvasImageData = ''

function resetCanvas () {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  latestCanvasImageData = canvas.toDataURL('image/jpeg', 0.8)
}

function getCanvasPosition (event) {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height

  let clientX
  let clientY

  if (event.touches && event.touches.length > 0) {
    clientX = event.touches[0].clientX
    clientY = event.touches[0].clientY
  } else {
    clientX = event.clientX
    clientY = event.clientY
  }

  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  }
}

function startDrawing (event) {
  drawing = true
  const pos = getCanvasPosition(event)
  lastX = pos.x
  lastY = pos.y
}

function draw(event) {
  if (!drawing) return
  event.preventDefault()

  const pos = getCanvasPosition(event)

  ctx.strokeStyle = colorPicker.value
  ctx.lineWidth = Number(brushSize.value)

  ctx.beginPath()
  ctx.moveTo(lastX, lastY)
  ctx.lineTo(pos.x, pos.y)
  ctx.stroke()

  lastX = pos.x
  lastY = pos.y

  latestCanvasImageData = canvas.toDataURL('image/jpeg', 0.8)

  if (hasSubmittedDrawing) {
    hasSubmittedDrawing = false
    submitDrawingBtn.textContent = 'Submit Drawing'
    gameMessage.textContent =
      'You edited your drawing, so you are no longer submitted.'
    socket.emit('unsubmit-drawing')
  }
}

function stopDrawing() {
  drawing = false
}

joinBtn.addEventListener('click', () => {
  const roomCode = roomInput.value.trim().toUpperCase()

  if (!roomCode) {
    joinMessage.textContent = 'Enter a room code'
    return
  }

  joinMessage.textContent = ''
  roomCodeText.textContent = roomCode

  socket.emit('join-room', roomCode)

  joinScreen.classList.add('hidden')
  lobbyScreen.classList.remove('hidden')
})

startBtn.addEventListener('click', () => {
  socket.emit('start-game')
})

brushSize.addEventListener('input', () => {
  brushSizeValue.textContent = brushSize.value
})

clearBtn.addEventListener('click', () => {
  resetCanvas()

  if (hasSubmittedDrawing) {
    hasSubmittedDrawing = false
    submitDrawingBtn.textContent = 'Submit Drawing'
    gameMessage.textContent =
      'You cleared your drawing, so you are no longer submitted.'
    socket.emit('unsubmit-drawing')
  }
})

submitDrawingBtn.addEventListener('click', () => {
  socket.emit('submit-drawing', latestCanvasImageData)

  hasSubmittedDrawing = true
  submitDrawingBtn.textContent = 'Submitted'
  gameMessage.textContent =
    'You are marked as submitted. You can still edit if you want.'
})

canvas.addEventListener('mousedown', startDrawing)
canvas.addEventListener('mousemove', draw)
window.addEventListener('mouseup', stopDrawing)
canvas.addEventListener('mouseleave', stopDrawing)

canvas.addEventListener('touchstart', startDrawing, { passive: false })
canvas.addEventListener('touchmove', draw, { passive: false })
window.addEventListener('touchend', stopDrawing)

socket.on('room-data', ({ players, hostId }) => {
  playerList.innerHTML = ''
  lobbyMessage.textContent = ''

  players.forEach(player => {
    const li = document.createElement('li')
    li.textContent =
      player.id === socket.id ? `${player.name} (You)` : player.name
    playerList.appendChild(li)
  })

  if (hostId === socket.id) {
    hostText.textContent = 'You are the host'
    startBtn.classList.remove('hidden')
  } else {
    const hostPlayer = players.find(player => player.id === hostId)
    hostText.textContent = hostPlayer
      ? `${hostPlayer.name} is the host`
      : 'Waiting for host...'
    startBtn.classList.add('hidden')
  }
})

socket.on('role-data', ({ role, word, hint }) => {
  if (role === 'imposter') {
    roleText.textContent = 'Role: Imposter'
    promptText.textContent = `Hint: ${hint}`
  } else {
    roleText.textContent = 'Role: Crewmate'
    promptText.textContent = `Word: ${word}`
  }
})

socket.on('timer-update', secondsLeft => {
  timerText.textContent = `Time left: ${secondsLeft}s`

  if (secondsLeft <= 0) {
    gameMessage.textContent = 'Time is up! Submitting automatically...'
  }
})

socket.on('game-started', () => {
  lobbyScreen.classList.add('hidden')
  votingScreen.classList.add('hidden')
  resultScreen.classList.add('hidden')
  gameScreen.classList.remove('hidden')

  hasSubmittedDrawing = false
  hasVoted = false
  submitDrawingBtn.textContent = 'Submit Drawing'
  gameMessage.textContent = ''
  submissionStatus.textContent = ''
  voteStatus.textContent = ''
  voteMessage.textContent = ''
  winnerText.textContent = ''
  imposterRevealText.textContent = ''
  votedOutText.textContent = ''
  voteResultsList.innerHTML = ''
  drawingsGrid.innerHTML = ''
  brushSizeValue.textContent = brushSize.value
  timerText.textContent = 'Time left: 30s'

  resetCanvas()
})

socket.on('submission-status', ({ submittedCount, totalPlayers }) => {
  submissionStatus.textContent = `${submittedCount}/${totalPlayers} players submitted`
})

socket.on('show-voting', revealedDrawings => {
  drawing = false
  gameScreen.classList.add('hidden')
  resultScreen.classList.add('hidden')
  votingScreen.classList.remove('hidden')

  drawingsGrid.innerHTML = ''
  voteMessage.textContent = ''
  voteStatus.textContent = '0 votes submitted'
  hasVoted = false

  revealedDrawings.forEach(drawing => {
    const card = document.createElement('div')
    card.className = 'drawing-card'

    const title = document.createElement('h3')
    title.textContent = drawing.playerName

    const image = document.createElement('img')
    image.src = drawing.imageData
    image.alt = `${drawing.playerName} drawing`

    const voteBtn = document.createElement('button')
    voteBtn.className = 'vote-btn'
    voteBtn.textContent = 'Vote'
    voteBtn.disabled = drawing.playerId === socket.id

    voteBtn.addEventListener('click', () => {
      if (hasVoted) return

      socket.emit('cast-vote', drawing.playerId)
      hasVoted = true
      voteMessage.textContent = `You voted for ${drawing.playerName}.`
      
      document.querySelectorAll('.vote-btn').forEach(btn => {
        btn.disabled = true
      })
    })

    card.appendChild(title)
    card.appendChild(image)
    card.appendChild(voteBtn)
    drawingsGrid.appendChild(card)
  })
})

socket.on('vote-status', ({ votesCast, totalPlayers }) => {
  voteStatus.textContent = `${votesCast}/${totalPlayers} votes submitted`
})

socket.on('round-result', ({ winner, tie, imposterName, votedOutName, voteResults }) => {
  votingScreen.classList.add('hidden')
  resultScreen.classList.remove('hidden')

  winnerText.textContent =
    winner === 'crewmates' ? 'Crewmates win!' : 'Imposter wins!'

  imposterRevealText.textContent = `The imposter was: ${imposterName}`

  if (tie) {
    votedOutText.textContent = 'It was a tie, so nobody was voted out.'
  } else {
    votedOutText.textContent = `Voted out: ${votedOutName}`
  }

  voteResultsList.innerHTML = ''

  voteResults.forEach(result => {
    const li = document.createElement('li')
    li.textContent = `${result.voterName} voted for ${result.votedForName}`
    voteResultsList.appendChild(li)
  })
})

socket.on('force-submit-request', () => {
  socket.emit('submit-drawing', latestCanvasImageData)

  hasSubmittedDrawing = true
  drawing = false
  submitDrawingBtn.textContent = 'Submitted'
  gameMessage.textContent = 'Time is up! Your drawing was submitted automatically.'
})

socket.on('join-error', message => {
  joinMessage.textContent = message
  lobbyMessage.textContent = message

  if (message === 'Room is full' || message === 'Game already started') {
    lobbyScreen.classList.add('hidden')
    joinScreen.classList.remove('hidden')
  }
})
