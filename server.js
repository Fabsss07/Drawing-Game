const express = require('express')
const http = require('http')
const { Server } = require('socket.io')

const app = express()
const server = http.createServer(app)
const io = new Server(server)

const PORT = 3000

app.use(express.static('public'))

// store rooms
const rooms = {}

io.on('connection', socket => {
  console.log('User connected:', socket.id)

  socket.on('join-room', roomCode => {

    if (!rooms[roomCode]) {
      rooms[roomCode] = []
    }

    const room = rooms[roomCode]

    if (room.length >= 4) {
      socket.emit('room-full')
      return
    }

    room.push(socket.id)
    socket.join(roomCode)

    io.to(roomCode).emit('update-players', room)

    console.log(`Player ${socket.id} joined ${roomCode}`)
  })

  socket.on('disconnect', () => {

    for (const roomCode in rooms) {

      const room = rooms[roomCode]
      const index = room.indexOf(socket.id)

      if (index !== -1) {
        room.splice(index, 1)

        io.to(roomCode).emit('update-players', room)
      }

      if (room.length === 0) {
        delete rooms[roomCode]
      }
    }

    console.log('User disconnected:', socket.id)
  })
})

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})