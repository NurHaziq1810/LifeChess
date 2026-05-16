const socket = io();
let myColor = null;
let game = null;
let board = null;

// Scoring Variables
let whiteStartPoints = 0; let blackStartPoints = 0;
let whiteScore = 0; let blackScore = 0;
const PIECE_VALUES = { 'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9 };

function updatePointsUI() {
    $('#whiteStart').text(whiteStartPoints); $('#blackStart').text(blackStartPoints);
    $('#whiteScore').text(whiteScore); $('#blackScore').text(blackScore);
    const liveWhite = whiteStartPoints - blackScore; const liveBlack = blackStartPoints - whiteScore; 
    const diff = Math.abs(liveWhite - liveBlack);
    let leaderText = "Even";
    if (liveWhite > liveBlack) leaderText = `White +${diff}`;
    if (liveBlack > liveWhite) leaderText = `Black +${diff}`;
    $('#pointDiff').text(leaderText);
}

function removeHighlights() { $('#myBoard .square-55d63').css('box-shadow', ''); }
function highlightSquare(square) { $('#myBoard .square-' + square).css('box-shadow', 'inset 0 0 0 5px rgba(20, 85, 30, 0.5)'); }
function flashRedSquare(square) {
    const $square = $('#myBoard .square-' + square);
    $square.css('box-shadow', 'inset 0 0 0 5px rgba(255, 0, 0, 0.8)');
    setTimeout(() => { $square.css('box-shadow', ''); }, 400); 
}

function updateStatus() {
    if (game === null) return; 

    let statusText = '';
    let moveColor = game.turn() === 'w' ? 'White' : 'Black';

    if (game.in_checkmate()) {
        let winner = moveColor === 'White' ? 'Black' : 'White';
        statusText = `Game Over! ${winner} wins by Checkmate.`;
        if (myColor !== 'spectator') $('#resetBtn').text('Next Match (Winner Stays)').show(); 
    } else if (game.in_draw()) {
        statusText = 'Game Over! Drawn position.';
        if (myColor !== 'spectator') $('#resetBtn').text('Next Match (Swap Players)').show(); 
    } else {
        statusText = `${moveColor} to move`;
        if (game.in_check()) statusText += ` (Check!)`;
    }
    
    let myColorName = myColor === 'w' ? 'White' : (myColor === 'b' ? 'Black' : 'Spectator');
    $('#status').text(`You are ${myColorName}. ${statusText}`);
}

// --- MULTIPLAYER LOGIC ---
socket.on('waitingForOpponent', () => {
    $('#status').text('Waiting for an opponent to join...');
    $('#spectatorLabel').hide();
});

socket.on('startGame', (data) => {
    myColor = data.color;
    $('#spectatorLabel').hide(); // Hide the spectator warning
    $('#resetBtn').hide();
    
    whiteStartPoints = data.setup.whitePoints; blackStartPoints = data.setup.blackPoints;
    whiteScore = 0; blackScore = 0;
    updatePointsUI();

    game = new Chess(data.setup.fen);

    const config = {
        draggable: true,
        position: data.setup.fen,
        orientation: myColor === 'w' ? 'white' : 'black',
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
        
        onDragStart: function(source, piece) {
            if (game.game_over() || game.turn() !== myColor || piece.charAt(0) !== myColor) return false;
            const moves = game.moves({ square: source, verbose: true });
            if (moves.length === 0) { flashRedSquare(source); return false; }
            highlightSquare(source);
            moves.forEach(m => highlightSquare(m.to));
        },
        
        onDrop: function(source, target) {
            removeHighlights();
            if (source === target) return 'snapback';

            const move = game.move({ from: source, to: target, promotion: 'q' });
            if (move === null) { flashRedSquare(target); return 'snapback'; }

            // Include the new FEN so spectators stay in sync!
            socket.emit('makeMove', { source: source, target: target, newFen: game.fen() });

            if (move.captured) {
                if (move.color === 'w') whiteScore += PIECE_VALUES[move.captured];
                else blackScore += PIECE_VALUES[move.captured];
                updatePointsUI();
            }
        },
        
        onSnapEnd: function() { board.position(game.fen()); updateStatus(); }
    };

    board = Chessboard('myBoard', config);
    updateStatus();
});

// If you are in the queue, you get this instead!
socket.on('spectatorUpdate', (data) => {
    myColor = 'spectator';
    $('#spectatorLabel').show(); // Flash the red warning
    $('#resetBtn').hide();
    
    whiteStartPoints = data.setup.whitePoints; blackStartPoints = data.setup.blackPoints;
    
    // We don't know the exact score if we joined mid-game, but we can set the board up
    game = new Chess(data.currentFen);
    
    const config = {
        draggable: false, // Spectators CANNOT touch the pieces!
        position: data.currentFen,
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
    };

    board = Chessboard('myBoard', config);
    updatePointsUI();
    updateStatus();
});

// Replaces 'opponentMove'. Updates the board for the opponent AND all spectators.
socket.on('updateBoard', (moveData) => {
    const move = game.move({ from: moveData.source, to: moveData.target, promotion: 'q' });
    
    if (move && move.captured) {
        if (move.color === 'w') whiteScore += PIECE_VALUES[move.captured];
        else blackScore += PIECE_VALUES[move.captured];
        updatePointsUI();
    }
    
    board.position(game.fen());
    updateStatus();
});

// --- WINNER STAYS ON BUTTON ---
$('#resetBtn').on('click', () => {
    $('#resetBtn').hide();
    // Tell the server we want to go again. Pass our color so it knows who won and who to kick out.
    socket.emit('nextMatch', myColor);
});

updatePointsUI();
