const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// --- BOARD GENERATION ---
const PIECE_VALUES = { 'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9 };

function getRandomPiece(allowPawn, isWhite) {
    const pool = allowPawn ? ['p', 'p', 'p', 'p', 'n', 'n', 'b', 'b', 'r', 'r', 'q'] : ['n', 'n', 'b', 'b', 'r', 'r', 'q'];
    let piece = pool[Math.floor(Math.random() * pool.length)];
    return isWhite ? piece.toUpperCase() : piece;
}

function generateArmy(isWhite) {
    let backRow = new Array(8).fill(''); let frontRow = new Array(8).fill(''); let points = 0;
    const kingIndex = Math.floor(Math.random() * 8); backRow[kingIndex] = isWhite ? 'K' : 'k';
    for (let i = 0; i < 8; i++) {
        if (i !== kingIndex) {
            let piece = getRandomPiece(false, isWhite); backRow[i] = piece; points += PIECE_VALUES[piece.toLowerCase()];
        }
        let frontPiece = getRandomPiece(true, isWhite); frontRow[i] = frontPiece; points += PIECE_VALUES[frontPiece.toLowerCase()];
    }
    return { backRow, frontRow, points };
}

function generateBalancedBoard(maxDiff) {
    let whiteArmy = generateArmy(true); let blackArmy = generateArmy(false);
    while (Math.abs(whiteArmy.points - blackArmy.points) > maxDiff) { blackArmy = generateArmy(false); }
    const fenRows = [
        blackArmy.backRow.join(''), blackArmy.frontRow.join(''),
        '8', '8', '8', '8', 
        whiteArmy.frontRow.join(''), whiteArmy.backRow.join('')
    ];
    return { fen: fenRows.join('/') + ' w KQkq - 0 1', whitePoints: whiteArmy.points, blackPoints: blackArmy.points };
}

// --- ARCADE LOBBY LOGIC ---
let lobby = []; // Array of all connected players. [0] is White, [1] is Black. The rest are spectators.
let gameSetup = null;
let currentFen = null;

function startMatch() {
    gameSetup = generateBalancedBoard(20);
    currentFen = gameSetup.fen;

    // Send the two active players their game
    if (lobby[0]) lobby[0].emit('startGame', { color: 'w', setup: gameSetup });
    if (lobby[1]) lobby[1].emit('startGame', { color: 'b', setup: gameSetup });

    // Tell everyone else in line to watch
    for (let i = 2; i < lobby.length; i++) {
        lobby[i].emit('spectatorUpdate', { setup: gameSetup, currentFen: currentFen });
    }
}

io.on('connection', (socket) => {
    // Add them to the back of the line
    lobby.push(socket);
    
    // If a game is already running, immediately make them a spectator
    if (lobby.length > 2 && gameSetup) {
        socket.emit('spectatorUpdate', { setup: gameSetup, currentFen: currentFen });
    }

    // If we just hit exactly 2 people, start the very first match!
    if (lobby.length === 2 && !gameSetup) {
        startMatch();
    } else if (lobby.length < 2) {
        socket.emit('waitingForOpponent');
    }

    // Broadcast moves to opponent AND all spectators
    socket.on('makeMove', (moveData) => {
        currentFen = moveData.newFen; // Track the current state for late-joiners
        socket.broadcast.emit('updateBoard', moveData);
    });

    // Winner Stays On Logic
    socket.on('nextMatch', (winnerColor) => {
        if (lobby.length >= 2) {
            // Find who lost
            let loserIndex = winnerColor === 'w' ? 1 : 0; 
            let loserSocket = lobby[loserIndex];
            
            // Remove the loser from their spot and push them to the very back of the line
            lobby.splice(loserIndex, 1);
            lobby.push(loserSocket);
            
            // Start the next match!
            startMatch();
        }
    });

    socket.on('disconnect', () => {
        let index = lobby.indexOf(socket);
        if (index !== -1) {
            lobby.splice(index, 1); // Remove them from the line
            
            // If the person who quit was actively playing at the board...
            if (index <= 1 && lobby.length >= 2) {
                startMatch(); // Instantly pull up the next challenger!
            } else if (index <= 1) {
                gameSetup = null;
                if (lobby[0]) lobby[0].emit('waitingForOpponent'); // Back to waiting
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`LifeChess server running on port ${PORT}`));
