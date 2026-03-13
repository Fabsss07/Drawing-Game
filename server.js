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

function getActivePlayers (room) {
  return room.players.filter(player => player.status === 'active')
}

function findPlayer (room, playerId) {
  return room.players.find(player => player.id === playerId)
}

function getBlankCanvasDataUrl () {
  return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
}

function emitSubmissionStatus (roomCode) {
  const room = rooms[roomCode]
  if (!room) return

  const activePlayers = getActivePlayers(room)

  io.to(roomCode).emit('submission-status', {
    submittedCount: activePlayers.filter(
      player => room.submittedPlayers[player.id]
    ).length,
    totalPlayers: activePlayers.length
  })
}

function revealVoting (roomCode) {
  const room = rooms[roomCode]
  if (!room) return
  if (room.phase !== 'drawing' && room.phase !== 'force-submit') return

  if (room.timerInterval) {
    clearInterval(room.timerInterval)
    room.timerInterval = null
  }

  room.phase = 'voting'

  const activePlayers = getActivePlayers(room)

  const revealedDrawings = activePlayers.map(player => ({
    playerId: player.id,
    playerName: player.name,
    imageData: room.drawings[player.id] || getBlankCanvasDataUrl()
  }))

  io.to(roomCode).emit('show-voting', revealedDrawings)
}

function maybeRevealVoting (roomCode) {
  const room = rooms[roomCode]
  if (!room) return
  if (room.phase !== 'drawing' && room.phase !== 'force-submit') return

  const activePlayers = getActivePlayers(room)
  const allSubmitted = activePlayers.every(
    player => room.submittedPlayers[player.id]
  )

  if (allSubmitted) {
    revealVoting(roomCode)
  }
}

function startRoundTimer (roomCode) {
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

function startNextRound (roomCode) {
  const room = rooms[roomCode]
  if (!room) return
  if (!room.gameStarted) return

  const activePlayers = getActivePlayers(room)

  if (activePlayers.length <= 2) {
    room.phase = 'results'

    const imposterPlayer = findPlayer(room, room.imposterId)

    io.to(roomCode).emit('round-result', {
      tie: false,
      matchWinner: 'imposter',
      imposterName: imposterPlayer ? imposterPlayer.name : 'Unknown',
      votedOutName: null,
      voteResults: [],
      remainingActiveCount: activePlayers.length
    })
    return
  }

  room.phase = 'drawing'
  room.drawings = {}
  room.submittedPlayers = {}
  room.votes = {}

  const chosenPrompt = getRandomItem(prompts)
  room.currentWord = chosenPrompt.word
  room.currentHint = chosenPrompt.hint

  room.players.forEach(player => {
    const playerSocket = io.sockets.sockets.get(player.id)
    if (!playerSocket) return

    const isImposter = player.id === room.imposterId

    playerSocket.emit('role-data', {
      role: isImposter ? 'imposter' : 'crewmate',
      status: player.status,
      word: player.status === 'active' && !isImposter ? room.currentWord : null,
      hint: player.status === 'active' && isImposter ? room.currentHint : null
    })
  })

  io.to(roomCode).emit('game-started')
  emitSubmissionStatus(roomCode)
  startRoundTimer(roomCode)
}

function finishVoting (roomCode) {
  const room = rooms[roomCode]
  if (!room) return

  const activePlayers = getActivePlayers(room)
  const voteCounts = {}

  activePlayers.forEach(player => {
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

  let matchWinner = null
  let votedOutPlayer = null

  if (!tie) {
    votedOutPlayer = findPlayer(room, votedOutPlayerId)

    if (votedOutPlayer) {
      votedOutPlayer.status = 'spectator'
    }

    if (votedOutPlayerId === room.imposterId) {
      matchWinner = 'crewmates'
    }
  }

  const remainingActivePlayers = getActivePlayers(room)
  const imposterStillAlive = remainingActivePlayers.some(
    player => player.id === room.imposterId
  )

  if (
    !matchWinner &&
    imposterStillAlive &&
    remainingActivePlayers.length <= 2
  ) {
    matchWinner = 'imposter'
  }

  const voteResults = activePlayers.map(player => {
    const votedForId = room.votes[player.id]
    const votedForPlayer = findPlayer(room, votedForId)

    return {
      voterName: player.name,
      votedForName: votedForPlayer ? votedForPlayer.name : 'Nobody'
    }
  })

  room.phase = 'results'

  io.to(roomCode).emit('round-result', {
    tie,
    matchWinner,
    imposterName: findPlayer(room, room.imposterId)?.name || 'Unknown',
    votedOutName: tie ? null : votedOutPlayer ? votedOutPlayer.name : null,
    voteResults,
    remainingActiveCount: remainingActivePlayers.length
  })

  if (!matchWinner) {
    setTimeout(() => {
      startNextRound(roomCode)
    }, 4000)
  }
}

io.on('connection', socket => {
  console.log('User connected:', socket.id)

  socket.on('rematch', () => {
    const roomCode = socket.data.roomCode
    if (!roomCode) return

    const room = rooms[roomCode]
    if (!room) return

    if (room.hostId !== socket.id) return

    if (room.players.length < 3) {
      socket.emit('join-error', 'Need at least 3 players for a rematch')
      return
    }

    room.gameStarted = true
    room.phase = 'drawing'
    room.drawings = {}
    room.submittedPlayers = {}
    room.votes = {}
    room.timerSeconds = 30

    if (room.timerInterval) {
      clearInterval(room.timerInterval)
      room.timerInterval = null
    }

    room.players.forEach(player => {
      player.status = 'active'
    })

    const activePlayers = getActivePlayers(room)
    const chosenImposter = getRandomItem(activePlayers)
    const chosenPrompt = getRandomItem(prompts)

    room.imposterId = chosenImposter.id
    room.currentWord = chosenPrompt.word
    room.currentHint = chosenPrompt.hint

    room.players.forEach(player => {
      const playerSocket = io.sockets.sockets.get(player.id)
      if (!playerSocket) return

      const isImposter = player.id === room.imposterId

      playerSocket.emit('role-data', {
        role: isImposter ? 'imposter' : 'crewmate',
        status: player.status,
        word: isImposter ? null : room.currentWord,
        hint: isImposter ? room.currentHint : null
      })
    })

    io.to(roomCode).emit('game-started')
    emitSubmissionStatus(roomCode)
    startRoundTimer(roomCode)
  })

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
      name: `Player ${room.players.length + 1}`,
      status: 'lobby'
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

    if (room.players.length < 3) {
      socket.emit('join-error', 'Need at least 3 players to start')
      return
    }

    room.gameStarted = true
    room.phase = 'drawing'
    room.drawings = {}
    room.submittedPlayers = {}
    room.votes = {}

    room.players.forEach(player => {
      player.status = 'active'
    })

    const activePlayers = getActivePlayers(room)
    const chosenImposter = getRandomItem(activePlayers)
    const chosenPrompt = getRandomItem(prompts)

    room.currentWord = chosenPrompt.word
    room.currentHint = chosenPrompt.hint
    room.imposterId = chosenImposter.id

    room.players.forEach(player => {
      const isImposter = player.id === room.imposterId
      const playerSocket = io.sockets.sockets.get(player.id)

      if (!playerSocket) return

      playerSocket.emit('role-data', {
        role: isImposter ? 'imposter' : 'crewmate',
        status: player.status,
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

    const player = findPlayer(room, socket.id)
    if (!player || player.status !== 'active') return

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

    const player = findPlayer(room, socket.id)
    if (!player || player.status !== 'active') return

    room.submittedPlayers[socket.id] = false
    emitSubmissionStatus(roomCode)
  })

  socket.on('cast-vote', votedPlayerId => {
    const roomCode = socket.data.roomCode
    if (!roomCode) return

    const room = rooms[roomCode]
    if (!room || !room.gameStarted || room.phase !== 'voting') return

    const activePlayers = getActivePlayers(room)
    const voterId = socket.id

    const voterExists = activePlayers.some(player => player.id === voterId)
    const votedPlayerExists = activePlayers.some(
      player => player.id === votedPlayerId
    )

    if (!voterExists || !votedPlayerExists) return
    if (voterId === votedPlayerId) return

    room.votes[voterId] = votedPlayerId

    const votesCast = activePlayers.filter(
      player => room.votes[player.id]
    ).length

    io.to(roomCode).emit('vote-status', {
      votesCast,
      totalPlayers: activePlayers.length
    })

    const allVoted = activePlayers.every(player => room.votes[player.id])
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

    const disconnectedPlayer = findPlayer(room, socket.id)
    const disconnectedWasImposter = room.imposterId === socket.id

    room.players = room.players.filter(player => player.id !== socket.id)
    delete room.submittedPlayers[socket.id]
    delete room.drawings[socket.id]
    delete room.votes[socket.id]

    if (room.hostId === socket.id && room.players.length > 0) {
      room.hostId = room.players[0].id
    }

    if (room.players.length === 0) {
      if (room.timerInterval) {
        clearInterval(room.timerInterval)
      }
      delete rooms[roomCode]
      console.log('User disconnected:', socket.id)
      return
    }

    if (room.timerInterval && getActivePlayers(room).length <= 1) {
      clearInterval(room.timerInterval)
      room.timerInterval = null
    }

    if (disconnectedWasImposter && room.gameStarted) {
      room.phase = 'results'
      io.to(roomCode).emit('round-result', {
        tie: false,
        matchWinner: 'crewmates',
        imposterName: disconnectedPlayer ? disconnectedPlayer.name : 'Unknown',
        votedOutName: disconnectedPlayer ? disconnectedPlayer.name : null,
        voteResults: [],
        remainingActiveCount: getActivePlayers(room).length
      })

      room.gameStarted = false
      room.imposterId = null
      emitRoomData(roomCode)
      console.log('User disconnected:', socket.id)
      return
    }

    if (room.gameStarted && room.phase === 'drawing') {
      const activePlayers = getActivePlayers(room)
      const allSubmitted = activePlayers.every(
        player => room.submittedPlayers[player.id]
      )

      if (allSubmitted) {
        revealVoting(roomCode)
      } else {
        emitSubmissionStatus(roomCode)
      }
    }

    if (room.gameStarted && room.phase === 'voting') {
      const activePlayers = getActivePlayers(room)
      const votesCast = activePlayers.filter(
        player => room.votes[player.id]
      ).length

      io.to(roomCode).emit('vote-status', {
        votesCast,
        totalPlayers: activePlayers.length
      })

      const allVoted = activePlayers.every(player => room.votes[player.id])
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
