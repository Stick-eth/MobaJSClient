import { io } from "socket.io-client";
import { addRemotePlayer, updateRemotePlayer, removeRemotePlayer } from "./remotePlayers.js";

export const socket = io("http://localhost:3000");

export let players = [];
export let myId = null;

socket.on("connect", () => {
  myId = socket.id;
});

socket.on("playersList", (serverPlayers) => {
  players = serverPlayers.filter(p => p.id !== socket.id);
  // Pour chaque joueur reçu à la connexion, on ajoute son mesh
  players.forEach(p => addRemotePlayer(p.id, p.x, p.z));
  console.log("Liste des autres joueurs :", players);
});

socket.on("playerJoined", (newPlayer) => {
  if (newPlayer.id !== socket.id) {
    addRemotePlayer(newPlayer.id, newPlayer.x, newPlayer.z);
    players.push(newPlayer);
    console.log("Nouveau joueur :", newPlayer);
  }
});

socket.on("playerLeft", ({ id }) => {
  removeRemotePlayer(id);
  players = players.filter(p => p.id !== id);
  console.log("Joueur parti :", id);
});

socket.on("playerPositionUpdate", (data) => {
  if (data.id !== socket.id) {
    updateRemotePlayer(data.id, data.x, data.z);
  }
});

