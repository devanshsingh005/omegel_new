const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

// Store active users
const activeUsers = new Set();
const userQueue = [];

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    activeUsers.add(socket.id);

    // Add user to queue
    socket.on('queue-join', () => {
        console.log(`User ${socket.id} joined queue`);
        if (!userQueue.includes(socket.id)) {
            userQueue.push(socket.id);
            matchUsers();
        }
    });

    // Handle chat messages
    socket.on('chat-message', ({ to, message }) => {
        if (activeUsers.has(to)) {
            io.to(to).emit('chat-message', {
                from: socket.id,
                message
            });
        }
    });

    // Handle WebRTC signaling
    socket.on('peer-signal', ({ to, signal }) => {
        console.log(`Signaling from ${socket.id} to ${to}`);
        if (activeUsers.has(to)) {
            io.to(to).emit('peer-signal', {
                from: socket.id,
                signal
            });
        } else {
            console.log(`Target user ${to} not found`);
            socket.emit('peer-disconnected');
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        activeUsers.delete(socket.id);
        const queueIndex = userQueue.indexOf(socket.id);
        if (queueIndex > -1) {
            userQueue.splice(queueIndex, 1);
        }
        // Notify any connected peers
        io.emit('peer-disconnected', socket.id);
    });
});

// Function to match users
function matchUsers() {
    console.log('Matching users. Queue length:', userQueue.length);
    while (userQueue.length >= 2) {
        const user1 = userQueue.shift();
        const user2 = userQueue.shift();
        
        if (activeUsers.has(user1) && activeUsers.has(user2)) {
            console.log(`Matching users ${user1} and ${user2}`);
            io.to(user1).emit('user-matched', user2);
            io.to(user2).emit('user-matched', user1);
        }
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
