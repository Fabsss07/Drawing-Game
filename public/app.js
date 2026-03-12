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
})

socket.on('join-error', message => {
  joinMessage.textContent = message
  lobbyMessage.textContent = message

  if (message === 'Room is full' || message === 'Game already started') {
    lobbyScreen.classList.add('hidden')
    joinScreen.classList.remove('hidden')
  }
})