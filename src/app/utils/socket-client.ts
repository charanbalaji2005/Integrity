import { io, type Socket } from "socket.io-client";
import { API_BASE_URL } from "./api-client";

/**
 * Socket.IO endpoint. Defaults to the same backend the REST API uses so the
 * session cookie / bearer token that authenticates REST also authenticates
 * the socket. Override with VITE_SOCKET_URL when they differ.
 */
export const SOCKET_URL: string = import.meta.env.VITE_SOCKET_URL || API_BASE_URL;

/**
 * Creates an authenticated socket. The server derives identity and role from
 * the verified session; nothing identity-related is sent from the client
 * besides the session token itself.
 */
export function createAuthedSocket(): Socket {
  const token = (() => {
    try {
      return localStorage.getItem("auth_token");
    } catch {
      return null;
    }
  })();

  return io(SOCKET_URL, {
    withCredentials: true,
    auth: token ? { token } : {},
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
  });
}

/** Join a room and resolve with whether the server authorized it. */
export function joinRoom(socket: Socket, roomId: string): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 8000);
    socket.emit("join-room", roomId, (res: { ok: boolean } | undefined) => {
      clearTimeout(timer);
      resolve(Boolean(res?.ok));
    });
  });
}
