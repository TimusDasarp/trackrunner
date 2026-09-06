import { io, Socket } from "socket.io-client";
import { getToken } from "./auth";
import { apiBaseUrl } from "./config";
import type { LocationUpdate } from "./types";

let socket: Socket | null = null;

export function getSocket(): Socket {
  // Several dashboard components subscribe during the same render. Keep the
  // in-flight connection shared; replacing it while `connecting` leaves early
  // subscribers attached to a discarded socket and the UI stuck reconnecting.
  if (socket) return socket;
  const token = getToken();
  socket = io(apiBaseUrl || undefined, {
    path: "/socket.io",
    // Render proxies can decline an initial WebSocket upgrade. Start with
    // polling so task events connect reliably, then let Socket.IO upgrade.
    transports: ["polling", "websocket"],
    tryAllTransports: true,
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
