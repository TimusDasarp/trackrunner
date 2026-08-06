import { io, Socket } from "socket.io-client";
import { getToken } from "./auth";
import { apiBaseUrl } from "./config";
import type { LocationUpdate } from "./types";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket && socket.connected) return socket;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  const token = getToken();
  socket = io(apiBaseUrl || undefined, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
