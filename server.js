const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// --- BOARD GENERATION MOVED TO THE SERVER ---
const PIECE_VALUES = { 'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9 };

function getRandomPiece(allowPawn, isWhite) {
    const pool = allowPawn ? ['p', 'p', 'p', 'p', 'n', 'n', 'b', 'b', 'r', 'r', 'q'] : ['n', 'n', 'b', 'b', 'r', 'r', 'q'];
    let piece = pool[Math.floor(Math.random() * pool.length)];
    return isWhite ? piece.toUpperCase() : piece;
}

function generateArmy(isWhite) {
    let backRow = new Array(8).fill('');
    let frontRow = new Array(8).fill('');
    let points = 0;
    const kingIndex = Math.floor(Math.random() * 8);
    backRow[kingIndex] = isWhite ? 'K' : 'k';

    for (let i = 0; i < 8; i++) {
        if (i !== kingIndex) {
            let piece = getRandomPiece(false, isWhite);
            backRow[i] = piece;
            points += PIECE_VALUES[piece.toLowerCase()];
        }
        let frontPiece = getRandomPiece(true, isWhite);
        frontRow[i] = frontPiece;
        points += PIECE_VALUES[frontPiece.toLowerCase()];
    }
    return { backRow, frontRow, points };
}

function generateBalancedBoard(maxDiff) {
    let whiteArmy = generateArmy(true);
    let blackArmy = generateArmy(false);
    while (Math.abs(whiteArmy.points - blackArmy.points) > maxDiff) {
        blackArmy = generateArmy(false);
    }
    const fenRows = [
        blackArmy.backRow.join(''), blackArmy.frontRow.join(''),
        '8', '8', '8', '8', 
        whiteArmy.frontRow.join(''), whiteArmy.backRow.join('')
    ];
    return { fen: fenRows.join('/') + ' w KQkq - 0 1', whitePoints: whiteArmy.points, blackPoints: blackArmy.points };
}

// --- MATCHMAKING & GAMEPLAY ---
let waitingPlayer = null;

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    if (waitingPlayer) {
        // 1. Create a private room and put both players in it
        const roomName = `room_${socket.id}`;
        socket.join(roomName);
        waitingPlayer.join(roomName);
        
        // Save the room name to their socket so we know where to send their moves later
        socket.roomName = roomName;
        waitingPlayer.roomName = roomName;

        // 2. The Server generates ONE exact board for the match
        const gameSetup = generateBalancedBoard(20);

        // 3. Send the startup data simultaneously to fix the race condition
        waitingPlayer.emit('startGame', { color: 'w', setup: gameSetup });
        socket.emit('startGame', { color: 'b', setup: gameSetup });

        waitingPlayer = null;
    } else {
        waitingPlayer = socket;
        socket.emit('waitingForOpponent');
    }

    // --- RELAYING MOVES ---
    // When a player makes a move, broadcast it to the opponent
    socket.on('makeMove', (moveData) => {
        socket.to(socket.roomName).emit('opponentMove', moveData);
    });

    // Handle rage quits
    socket.on('disconnect', () => {
        if (waitingPlayer === socket) waitingPlayer = null;
        if (socket.roomName) {
            socket.to(socket.roomName).emit('opponentDisconnected');
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`LifeChess server running on port ${PORT}`));