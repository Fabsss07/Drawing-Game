const express = require('express')
const http = require('http')
const { Server } = require('socket.io')

const app = express()
const server = http.createServer(app)
const io = new Server(server)

const PORT = 3000

app.use(express.static('public'))

const rooms = {}

const prompts = [
  { word: 'Instrument', hint: 'Music object' },
  { word: 'Fruit', hint: 'Plant food' },
  { word: 'Vehicle', hint: 'Transport thing' },
  { word: 'Furniture', hint: 'Household object' },
  { word: 'Tool', hint: 'Used for work' },
  { word: 'Sea Animal', hint: 'Ocean creature' },
  { word: 'Clothing', hint: 'Something you wear' },
  { word: 'Toy', hint: 'Thing used for play' },
  { word: 'Sport', hint: 'Physical competition' },
  { word: 'School Item', hint: 'Used for learning' }
]

function emitRoomData(roomCode) {
  const room = rooms[roomCode]
  if (!room) return

  io.to(roomCode).emit('room-data', {
    players: room.players,
    hostId: room.hostId
  })
}

function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)]
}

function getSubmittedCount(room) {
  return room.players.filter(player => room.submittedPlayers[player.id]).length
}

function emitSubmissionStatus(roomCode) {
  const room = rooms[roomCode]
  if (!room) return

  io.to(roomCode).emit('submission-status', {
    submittedCount: getSubmittedCount(room),
    totalPlayers: room.players.length
  })
}

function getBlankCanvasDataUrl() {
  return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
}

function revealVoting(roomCode) {
  const room = rooms[roomCode]
  if (!room) return
  if (room.phase !== 'drawing' && room.phase !== 'force-submit') return

  if (room.timerInterval) {
    clearInterval(room.timerInterval)
    room.timerInterval = null
  }

  room.phase = 'voting'

  const revealedDrawings = room.players.map(player => ({
    playerId: player.id,
    playerName: player.name,
    imageData: room.drawings[player.id] || getBlankCanvasDataUrl()
  }))

  io.to(roomCode).emit('show-voting', revealedDrawings)
}

function startRoundTimer(roomCode) {
  const room = rooms[roomCode]
  if (!room) return

  if (room.timerInterval) {
    clearInterval(room.timerInterval)
    room.timerInterval = null
  }

  room.timerSeconds = 30
  io.to(roomCode).emit('timer-update', room.timerSeconds)

  room.timerInterval = setInterval(() => {
    const currentRoom = rooms[roomCode]
    if (!currentRoom) return

    currentRoom.timerSeconds -= 1
    io.to(roomCode).emit('timer-update', currentRoom.timerSeconds)

    if (currentRoom.timerSeconds <= 0) {
      clearInterval(currentRoom.timerInterval)
      currentRoom.timerInterval = null

      currentRoom.phase = 'force-submit'
      io.to(roomCode).emit('force-submit-request')
    }
  }, 1000)
}

function finishVoting(roomCode) {
  const room = rooms[roomCode]
  if (!room) return

  const voteCounts = {}

  room.players.forEach(player => {
    voteCounts[player.id] = 0
  })

  Object.values(room.votes).forEach(votedId => {
    if (voteCounts[votedId] !== undefined) {
      voteCounts[votedId]++
    }
  })

  let mostVotes = -1
  let votedOutPlayerId = null
  let tie = false

  for (const playerId in voteCounts) {
    if (voteCounts[playerId] > mostVotes) {
      mostVotes = voteCounts[playerId]
      votedOutPlayerId = playerId
      tie = false
    } else if (voteCounts[playerId] === mostVotes) {
      tie = true
    }
  }

  const votedOutPlayer = room.players.find(player => player.id === votedOutPlayerId)
  const imposterPlayer = room.players.find(player => player.id === room.imposterId)

  let winner
  if (tie) {
    winner = 'imposter'
  } else if (votedOutPlayerId === room.imposterId) {
    winner = 'crewmates'
  } else {
    winner = 'imposter'
  }

  const voteResults = room.players.map(player => {
    const votedForId = room.votes[player.id]
    const votedForPlayer = room.players.find(p => p.id === votedForId)

    return {
      voterName: player.name,
      votedForName: votedForPlayer ? votedForPlayer.name : 'Nobody'
    }
  })

  room.phase = 'results'

  io.to(roomCode).emit('round-result', {
    winner,
    tie,
    imposterName: imposterPlayer ? imposterPlayer.name : 'Unknown',
    votedOutName: tie ? null : votedOutPlayer ? votedOutPlayer.name : null,
    voteResults
  })
}

function maybeRevealVoting(roomCode) {
  const room = rooms[roomCode]
  if (!room) return
  if (room.phase !== 'drawing' && room.phase !== 'force-submit') return

  const allSubmitted = room.players.every(player => room.submittedPlayers[player.id])

  if (allSubmitted) {
    revealVoting(roomCode)
  }
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
        currentHint: null,
        imposterId: null,
        drawings: {},
        submittedPlayers: {},
        votes: {},
        timerSeconds: 30,
        timerInterval: null,
        phase: 'lobby'
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
    room.phase = 'drawing'
    room.drawings = {}
    room.submittedPlayers = {}
    room.votes = {}

    const chosenPrompt = getRandomItem(prompts)
    const chosenImposter = getRandomItem(room.players)

    room.currentWord = chosenPrompt.word
    room.currentHint = chosenPrompt.hint
    room.imposterId = chosenImposter.id

    room.players.forEach(player => {
      const isImposter = player.id === room.imposterId
      const playerSocket = io.sockets.sockets.get(player.id)

      if (!playerSocket) return

      playerSocket.emit('role-data', {
        role: isImposter ? 'imposter' : 'crewmate',
        word: isImposter ? null : room.currentWord,
        hint: isImposter ? room.currentHint : null
      })
    })

    io.to(roomCode).emit('game-started')
    emitSubmissionStatus(roomCode)
    startRoundTimer(roomCode)
  })

  socket.on('submit-drawing', imageData => {
  const roomCode = socket.data.roomCode
  if (!roomCode) return

  const room = rooms[roomCode]
  if (!room || !room.gameStarted) return
  if (room.phase !== 'drawing' && room.phase !== 'force-submit') return

  room.drawings[socket.id] = imageData
  room.submittedPlayers[socket.id] = true

  emitSubmissionStatus(roomCode)
  maybeRevealVoting(roomCode)
})

  socket.on('unsubmit-drawing', () => {
    const roomCode = socket.data.roomCode
    if (!roomCode) return

    const room = rooms[roomCode]
    if (!room || !room.gameStarted || room.phase !== 'drawing') return

    room.submittedPlayers[socket.id] = false
    emitSubmissionStatus(roomCode)
  })

  socket.on('cast-vote', votedPlayerId => {
    const roomCode = socket.data.roomCode
    if (!roomCode) return

    const room = rooms[roomCode]
    if (!room || !room.gameStarted || room.phase !== 'voting') return

    const voterId = socket.id

    const voterExists = room.players.some(player => player.id === voterId)
    const votedPlayerExists = room.players.some(player => player.id === votedPlayerId)

    if (!voterExists || !votedPlayerExists) return
    if (voterId === votedPlayerId) return

    room.votes[voterId] = votedPlayerId

    const votesCast = Object.keys(room.votes).length
    const totalPlayers = room.players.length

    io.to(roomCode).emit('vote-status', {
      votesCast,
      totalPlayers
    })

    const allVoted = room.players.every(player => room.votes[player.id])
    if (allVoted) {
      finishVoting(roomCode)
    }
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
    delete room.submittedPlayers[socket.id]
    delete room.drawings[socket.id]
    delete room.votes[socket.id]

    if (room.hostId === socket.id && room.players.length > 0) {
      room.hostId = room.players[0].id
    }

    if (room.imposterId === socket.id) {
      room.imposterId = null
    }

    if (room.timerInterval && room.players.length <= 1) {
      clearInterval(room.timerInterval)
      room.timerInterval = null
    }

    if (room.players.length === 0) {
      if (room.timerInterval) {
        clearInterval(room.timerInterval)
      }
      delete rooms[roomCode]
      console.log('User disconnected:', socket.id)
      return
    }

    if (room.gameStarted && room.phase === 'drawing') {
      const allSubmitted = room.players.every(player => room.submittedPlayers[player.id])
      if (allSubmitted) {
        revealVoting(roomCode)
      } else {
        emitSubmissionStatus(roomCode)
      }
    }

    if (room.gameStarted && room.phase === 'voting') {
      const votesCast = Object.keys(room.votes).length
      const totalPlayers = room.players.length

      io.to(roomCode).emit('vote-status', {
        votesCast,
        totalPlayers
      })

      const allVoted = room.players.every(player => room.votes[player.id])
      if (allVoted) {
        finishVoting(roomCode)
      }
    }

    emitRoomData(roomCode)
    console.log('User disconnected:', socket.id)
  })
})

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})