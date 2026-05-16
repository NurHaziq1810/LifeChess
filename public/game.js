const socket = io();
let myColor = null;
let game = null;
let board = null;

// Scoring Variables
let whiteStartPoints = 0; let blackStartPoints = 0;
let whiteScore = 0; let blackScore = 0;
const PIECE_VALUES = { 'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9 };

// --- UI HELPERS ---
function updatePointsUI() {
    $('#whiteStart').text(whiteStartPoints); $('#blackStart').text(blackStartPoints);
    $('#whiteScore').text(whiteScore); $('#blackScore').text(blackScore);
    const liveWhite = whiteStartPoints - blackScore; 
    const liveBlack = blackStartPoints - whiteScore; 
    const diff = Math.abs(liveWhite - liveBlack);
    let leaderText = "Even";
    if (liveWhite > liveBlack) leaderText = `White +${diff}`;
    if (liveBlack > liveWhite) leaderText = `Black +${diff}`;
    $('#pointDiff').text(leaderText);
}

function removeHighlights() { $('#myBoard .square-55d63').css('box-shadow', ''); }
function highlightSquare(square) { $('#myBoard .square-' + square).css('box-shadow', 'inset 0 0 0 5px rgba(20, 85, 30, 0.5)'); }

function updateStatus() {
    let statusText = '';
    let moveColor = game.turn() === 'w' ? 'White' : 'Black';

    if (game.in_checkmate()) {
        let winner = moveColor === 'White' ? 'Black' : 'White';
        statusText = `Game Over! ${winner} wins by Checkmate.`;
        $('#resetBtn').text('Find New Match').show();
    } else if (game.in_draw()) {
        statusText = 'Game Over! Drawn position.';
        $('#resetBtn').text('Find New Match').show();
    } else {
        statusText = `${moveColor} to move`;
        if (game.in_check()) statusText += ` (Check!)`;
    }
    
    // Add our color to the top so we remember who we are playing as
    let myColorName = myColor === 'w' ? 'White' : 'Black';
    $('#status').text(`You are ${myColorName}. ${statusText}`);
}

// --- MULTIPLAYER LOGIC ---

socket.on('waitingForOpponent', () => {
    $('#status').text('Waiting for an opponent to join...');
});

socket.on('opponentDisconnected', () => {
    $('#status').text('Opponent disconnected! You win by forfeit.');

    //Resets the screen back to the original
    $('#resetBtn').text('Find New Match').show();
});

// The server sends us the finalized board and our color
socket.on('startGame', (data) => {
    myColor = data.color;
    
    // Setup scores
    whiteStartPoints = data.setup.whitePoints;
    blackStartPoints = data.setup.blackPoints;
    whiteScore = 0; blackScore = 0;
    updatePointsUI();

    // Initialize chess logic
    game = new Chess(data.setup.fen);

    // Initialize the visual board
    const config = {
        draggable: true,
        position: data.setup.fen,
        orientation: myColor === 'w' ? 'white' : 'black', // Flip for black
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
        
        onDragStart: function(source, piece) {
            // Prevent moving if game is over, wrong turn, or dragging opponent's piece
            if (game.game_over() || game.turn() !== myColor || piece.charAt(0) !== myColor) {
                return false;
            }
            const moves = game.moves({ square: source, verbose: true });
            if (moves.length === 0) return false;
            highlightSquare(source);
            moves.forEach(m => highlightSquare(m.to));
        },
        
        onDrop: function(source, target) {
            removeHighlights();
            const move = game.move({ from: source, to: target, promotion: 'q' });
            if (move === null) return 'snapback';

            // IF LEGAL MOVE: Tell the server we made a move!
            socket.emit('makeMove', { source: source, target: target });

            if (move.captured) {
                if (move.color === 'w') whiteScore += PIECE_VALUES[move.captured];
                else blackScore += PIECE_VALUES[move.captured];
                updatePointsUI();
            }
        },
        
        onSnapEnd: function() {
            board.position(game.fen());
            updateStatus();
        }
    };

    board = Chessboard('myBoard', config);
    updateStatus();
});

// When the server tells us our opponent moved
socket.on('opponentMove', (moveData) => {
    // Replicate their move on our local logic board
    const move = game.move({ from: moveData.source, to: moveData.target, promotion: 'q' });
    
    // Process captures if they ate our piece
    if (move && move.captured) {
        if (move.color === 'w') whiteScore += PIECE_VALUES[move.captured];
        else blackScore += PIECE_VALUES[move.captured];
        updatePointsUI();
    }

    // --- RESET LOGIC ---
    $('#resetBtn').on('click', () => {
    // Refresh the page to cleanly drop back into the matchmaking queue
    window.location.reload();
    
    // Update our visual board
    board.position(game.fen());
    updateStatus();
});
