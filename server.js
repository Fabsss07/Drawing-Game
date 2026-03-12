const express = require('express')
const http = require('http')
const { Server } = require('socket.io')

const app = express()
const server = http.createServer(app)
const io = new Server(server)

const PORT = 3000

app.use(express.static('public'))

const rooms = {}

const words = [
  { word: 'Banana', category: 'Fruit' },
  { word: 'Pizza', category: 'Food' },
  { word: 'Shark', category: 'Animal' },
  { word: 'Helmet', category: 'Object' },
  { word: 'Train', category: 'Vehicle' },
  { word: 'Castle', category: 'Place' },
  { word: 'Robot', category: 'Thing' },
  { word: 'Guitar', category: 'Instrument' },
  { word: 'Snowman', category: 'Winter' },
  { word: 'Palm Tree', category: 'Nature' }
]

function emitRoomData (roomCode) {
  const room = rooms[roomCode]
  if (!room) return

  io.to(roomCode).emit('room-data', {
    players: room.players,
    hostId: room.hostId
  })
}

function getRandomItem (array) {
  return array[Math.floor(Math.random() * array.length)]
}

io.on('connection', socket => {
  console.log('User connected:', socket.id)

  socket.on('join-room', roomCode => {
    roomCode = roomCode.trim().toUpperCase()

    if (!roomCode) return

    if (!rooms[roomCode]) {
      rooms[roomCode] = {
        players: [],
        hostId: socket.id,
        gameStarted: false,
        currentWord: null,
        currentCategory: null,
        imposterId: null,
        drawings: {}
      }
    }

    const room = rooms[roomCode]

    if (room.gameStarted) {
      socket.emit('join-error', 'Game already started')
      return
    }

    if (room.players.length >= 4) {
      socket.emit('join-error', 'Room is full')
      return
    }

    const alreadyInRoom = room.players.some(player => player.id === socket.id)
    if (alreadyInRoom) return

    const player = {
      id: socket.id,
      name: `Player ${room.players.length + 1}`
    }

    room.players.push(player)
    socket.join(roomCode)
    socket.data.roomCode = roomCode

    socket.on('submit-drawing', imageData => {
      const roomCode = socket.data.roomCode
      if (!roomCode) return

      const room = rooms[roomCode]
      if (!room || !room.gameStarted) return

      room.drawings[socket.id] = imageData

      console.log(`Drawing submitted by ${socket.id} in room ${roomCode}`)
    })

    emitRoomData(roomCode)

    console.log(`Player ${socket.id} joined ${roomCode}`)
  })

  socket.on('start-game', () => {
    const roomCode = socket.data.roomCode
    if (!roomCode) return

    const room = rooms[roomCode]
    if (!room) return

    if (room.hostId !== socket.id) {
      socket.emit('join-error', 'Only the host can start the game')
      return
    }

    if (room.players.length < 2) {
      socket.emit('join-error', 'Need at least 2 players to start')
      return
    }

    room.gameStarted = true

    const chosenWord = getRandomItem(words)
    const chosenImposter = getRandomItem(room.players)

    room.currentWord = chosenWord.word
    room.currentCategory = chosenWord.category
    room.imposterId = chosenImposter.id

    room.players.forEach(player => {
      const isImposter = player.id === room.imposterId
      const playerSocket = io.sockets.sockets.get(player.id)

      if (!playerSocket) return

      playerSocket.emit('role-data', {
        role: isImposter ? 'imposter' : 'crewmate',
        category: room.currentCategory,
        word: isImposter ? null : room.currentWord
      })
    })

    io.to(roomCode).emit('game-started')
  })

  socket.on('disconnect', () => {
    const roomCode = socket.data.roomCode
    if (!roomCode) {
      console.log('User disconnected:', socket.id)
      return
    }

    const room = rooms[roomCode]
    if (!room) {
      console.log('User disconnected:', socket.id)
      return
    }

    room.players = room.players.filter(player => player.id !== socket.id)

    if (room.hostId === socket.id && room.players.length > 0) {
      room.hostId = room.players[0].id
    }

    if (room.players.length === 0) {
      delete rooms[roomCode]
    } else {
      emitRoomData(roomCode)
    }

    console.log('User disconnected:', socket.id)
  })
})

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:3000`)
})
