const socket = io()

const joinBtn = document.getElementById('joinBtn')
const roomInput = document.getElementById('roomInput')

const joinScreen = document.getElementById('joinScreen')
const lobby = document.getElementById('lobby')

const playerList = document.getElementById('playerList')

let currentRoom = null

joinBtn.addEventListener('click', () => {

  const roomCode = roomInput.value.trim()

  if (!roomCode) return

  currentRoom = roomCode

  socket.emit('join-room', roomCode)

  joinScreen.style.display = 'none'
  lobby.style.display = 'block'
})

socket.on('update-players', players => {

  playerList.innerHTML = ''

  players.forEach(player => {

    const li = document.createElement('li')
    li.textContent = player

    playerList.appendChild(li)
  })
})

socket.on('room-full', () => {
  alert('Room is full')
})