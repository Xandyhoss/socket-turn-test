import express from "express";
import cors from "cors";
import { MainRoutes } from "./routes/index.js";
import { Server } from "socket.io";
import "dotenv/config";
import { createServer } from "http";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize environment variables
const PORT = process.env.HOST_PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

type Player = {
  id: string;
  username: string;
};

const players: { [key: string]: Player } = {};
const rooms: {
  [key: string]: {
    gameState: {
      started: boolean;
      players: Player[];
      currentPlayer: Player | null;
      currentTurn: number | null;
      owner: Player | null;
    };
  };
} = {};

io.on("connection", (socket) => {
  socket.on("register", (data) => {
    players[socket.id] = {
      id: socket.id,
      username: data.username,
    };
    io.to(socket.id).emit("welcome", {
      message: "Welcome to the Socket.IO server!",
      id: socket.id,
    });
  });

  socket.on("createRoom", () => {
    const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    socket.join(roomCode);
    const currentPlayer = players[socket.id];
    rooms[roomCode] = {
      gameState: {
        players: [currentPlayer as Player],
        started: false,
        currentPlayer: null,
        currentTurn: null,
        owner: currentPlayer as Player,
      },
    };
    io.to(socket.id).emit("roomCreated", {
      room: roomCode,
      gameState: rooms[roomCode].gameState,
      players: rooms[roomCode].gameState.players,
    });
    console.log("Current rooms:", rooms);
  });

  socket.on("joinRoom", (code) => {
    if (!rooms[code]) {
      io.to(socket.id).emit("error", { message: "Room does not exist." });
      return;
    }
    socket.join(code);
    if (rooms[code]) {
      const currentPlayer = players[socket.id];
      rooms[code].gameState.players.push(currentPlayer as Player);
      io.to(socket.id).emit("roomJoined", {
        room: code,
        gameState: rooms[code].gameState,
        players: rooms[code].gameState.players,
      });
      io.to(code).emit("playerListUpdated", {
        players: rooms[code].gameState.players,
      });
    }
    console.log("Current rooms:", rooms);
  });

  socket.on("leaveRoom", (code) => {
    socket.leave(code);
    io.to(socket.id).emit("roomLeft", { room: code });
    if (rooms[code]) {
      rooms[code].gameState.players = rooms[code].gameState.players.filter(
        (player) => player.id !== socket.id
      );
      io.to(code).emit("playerListUpdated", {
        players: rooms[code].gameState.players,
      });
      if (rooms[code].gameState.players.length === 0) {
        delete rooms[code];
      }
    }
    console.log("Current rooms:", rooms);
  });

  socket.on("startGame", (code) => {
    if (rooms[code]) {
      if (rooms[code].gameState.players.length < 2) {
        io.to(socket.id).emit("error", {
          message: "Not enough players to start the game.",
        });
        return;
      }
      rooms[code].gameState.started = true;
      const shuffledPlayers = rooms[code].gameState.players
        .map((player) => ({ player, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ player }) => player);

      rooms[code].gameState.players = shuffledPlayers;
      rooms[code].gameState.currentPlayer = shuffledPlayers[0] ?? null;
      rooms[code].gameState.currentTurn = 1;
      console.log("GAME STARTED AT", code);
      io.to(code).emit("gameStarted", {
        gameState: {
          started: rooms[code].gameState.started,
          players: rooms[code].gameState.players,
          currentPlayer: rooms[code].gameState.currentPlayer,
          currentTurn: rooms[code].gameState.currentTurn,
        },
      });
      io.to(code).emit("updateGameState", {
        gameState: {
          started: rooms[code].gameState.started,
          players: rooms[code].gameState.players,
          currentPlayer: rooms[code].gameState.currentPlayer,
          currentTurn: rooms[code].gameState.currentTurn,
        },
      });
    }
  });

  socket.on("nextTurn", (data) => {
    const { code } = data;
    if (rooms[code] && rooms[code].gameState.started) {
      const playersArr = rooms[code].gameState.players;
      const currentPlayer = rooms[code].gameState.currentPlayer;
      if (playersArr.length === 0 || !currentPlayer) return;

      const currentIndex = playersArr.findIndex(
        (p) => p.id === currentPlayer.id
      );
      // If currentPlayer is not found, do not proceed
      if (currentIndex === -1) return;

      const nextIndex = (currentIndex + 1) % playersArr.length;
      rooms[code].gameState.currentPlayer = playersArr[nextIndex] ?? null;
      rooms[code].gameState.currentTurn =
        (rooms[code].gameState.currentTurn ?? 0) + 1;

      // Only emit if there are players and a valid currentPlayer
      if (
        rooms[code].gameState.players.length > 0 &&
        rooms[code].gameState.currentPlayer
      ) {
        io.to(code).emit("updateGameState", {
          gameState: {
            started: rooms[code].gameState.started,
            players: rooms[code].gameState.players,
            currentPlayer: rooms[code].gameState.currentPlayer,
            currentTurn: rooms[code].gameState.currentTurn,
          },
        });
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected under ID:", socket.id);
    delete players[socket.id];
    for (const code in rooms) {
      if (rooms[code]) {
        rooms[code].gameState.players = rooms[code].gameState.players.filter(
          (player) => player.id !== socket.id
        );
        if (rooms[code].gameState.players.length === 0) {
          delete rooms[code];
        }
        console.log("Current rooms:", rooms);
      }
    }
  });
});

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

//Route initialization
MainRoutes(app);

httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
