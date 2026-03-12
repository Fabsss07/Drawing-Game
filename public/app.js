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
const categoryText = document.getElementById('categoryText')
const wordText = document.getElementById('wordText')
const gameMessage = document.getElementById('gameMessage')

const colorPicker = document.getElementById('colorPicker')
const brushSize = document.getElementById('brushSize')
const brushSizeValue = document.getElementById('brushSizeValue')
const clearBtn = document.getElementById('clearBtn')
const submitDrawingBtn = document.getElementById('submitDrawingBtn')
const canvas = document.getElementById('drawingCanvas')
const ctx = canvas.getContext('2d')

let drawing = false
let hasSubmittedDrawing = false
let lastX = 0
let lastY = 0

function resetCanvas() {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
}

function getCanvasPosition(event) {
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

function startDrawing(event) {
  if (hasSubmittedDrawing) return

  drawing = true
  const pos = getCanvasPosition(event)
  lastX = pos.x
  lastY = pos.y
}

function draw(event) {
  if (!drawing || hasSubmittedDrawing) return
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
  if (hasSubmittedDrawing) return
  resetCanvas()
})

submitDrawingBtn.addEventListener('click', () => {
  if (hasSubmittedDrawing) return

  const imageData = canvas.toDataURL('image/png')
  socket.emit('submit-drawing', imageData)

  hasSubmittedDrawing = true
  submitDrawingBtn.disabled = true
  gameMessage.textContent = 'Drawing submitted.'
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
    li.textContent = player.id === socket.id ? `${player.name} (You)` : player.name
    playerList.appendChild(li)
  })

  if (hostId === socket.id) {
    hostText.textContent = 'You are the host'
    startBtn.classList.remove('hidden')
  } else {
    const hostPlayer = players.find(player => player.id === hostId)
    hostText.textContent = hostPlayer ? `${hostPlayer.name} is the host` : 'Waiting for host...'
    startBtn.classList.add('hidden')
  }
})

socket.on('role-data', ({ role, category, word }) => {
  if (role === 'imposter') {
    roleText.textContent = 'Role: Imposter'
    categoryText.textContent = `Category: ${category}`
    wordText.textContent = 'Secret word: ???'
  } else {
    roleText.textContent = 'Role: Crewmate'
    categoryText.textContent = `Category: ${category}`
    wordText.textContent = `Secret word: ${word}`
  }
})

socket.on('game-started', () => {
  lobbyScreen.classList.add('hidden')
  gameScreen.classList.remove('hidden')

  hasSubmittedDrawing = false
  submitDrawingBtn.disabled = false
  gameMessage.textContent = ''
  brushSizeValue.textContent = brushSize.value

  resetCanvas()
})

socket.on('join-error', message => {
  joinMessage.textContent = message
  lobbyMessage.textContent = message

  if (message === 'Room is full' || message === 'Game already started') {
    lobbyScreen.classList.add('hidden')
    joinScreen.classList.remove('hidden')
  }
})