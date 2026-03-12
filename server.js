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
        drawings: {},
        submittedPlayers: {},
        votes: {}
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
      room.submittedPlayers[socket.id] = true

      const submittedCount = room.players.filter(
        player => room.submittedPlayers[player.id]
      ).length
      const totalPlayers = room.players.length

      io.to(roomCode).emit('submission-status', {
        submittedCount,
        totalPlayers
      })

    socket.on('cast-vote', votedPlayerId => {
    const roomCode = socket.data.roomCode
    if (!roomCode) return

    const room = rooms[roomCode]
    if (!room || !room.gameStarted) return

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

    io.to(roomCode).emit('round-result', {
      winner,
      tie,
      imposterName: imposterPlayer ? imposterPlayer.name : 'Unknown',
      votedOutName: tie ? null : (votedOutPlayer ? votedOutPlayer.name : null),
      voteResults
    })
  }
})  

      console.log(`Drawing submitted by ${socket.id} in room ${roomCode}`)

      const allSubmitted = room.players.every(
        player => room.submittedPlayers[player.id]
      )

      if (allSubmitted) {
        const revealedDrawings = room.players.map(player => ({
          playerId: player.id,
          playerName: player.name,
          imageData: room.drawings[player.id] || ''
        }))

        io.to(roomCode).emit('show-voting', revealedDrawings)
      }
    })

    emitRoomData(roomCode)

    console.log(`Player ${socket.id} joined ${roomCode}`)
  })

  socket.on('unsubmit-drawing', () => {
    const roomCode = socket.data.roomCode
    if (!roomCode) return

    const room = rooms[roomCode]
    if (!room || !room.gameStarted) return

    room.submittedPlayers[socket.id] = false

    const submittedCount = room.players.filter(player => room.submittedPlayers[player.id]).length
    const totalPlayers = room.players.length

    io.to(roomCode).emit('submission-status', {
        submittedCount,
        totalPlayers
    })
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


    room.votes = {}
    room.drawings = {}
    room.submittedPlayers = {}

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
