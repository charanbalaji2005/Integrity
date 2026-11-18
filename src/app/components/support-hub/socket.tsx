import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { createAuthedSocket, joinRoom } from "../../utils/socket-client";

interface SocketState {
  socket: Socket | null;
  connected: boolean;
}

const SupportSocketContext = createContext<SocketState>({ socket: null, connected: false });

/** Owns one authenticated socket for the console and joins the `support-staff` room. */
export function SupportSocketProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SocketState>({ socket: null, connected: false });

  useEffect(() => {
    let socket: Socket;
    try {
      socket = createAuthedSocket();
    } catch (err) {
      console.error("Support socket failed to start", err);
      return;
    }
    const onConnect = () => {
      setState({ socket, connected: true });
      // Rooms are lost on reconnect, so (re)join on every connect.
      void joinRoom(socket, "support-staff");
    };
    const onDisconnect = () => setState({ socket, connected: false });
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    setState({ socket, connected: socket.connected });
    if (socket.connected) onConnect();
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.disconnect();
    };
  }, []);

  return <SupportSocketContext.Provider value={state}>{children}</SupportSocketContext.Provider>;
}

export function useSupportSocket(): SocketState {
  return useContext(SupportSocketContext);
}

/** Subscribe to one or more socket events; the latest handler is always used. */
export function useSocketEvent(events: string | string[], handler: (payload: any, event: string) => void) {
  const { socket } = useSupportSocket();
  const ref = useRef(handler);
  ref.current = handler;
  const key = Array.isArray(events) ? events.join("|") : events;

  useEffect(() => {
    if (!socket) return;
    const names = key.split("|");
    const listeners = names.map((name) => {
      const fn = (payload: any) => ref.current(payload, name);
      socket.on(name, fn);
      return [name, fn] as const;
    });
    return () => {
      listeners.forEach(([name, fn]) => socket.off(name, fn));
    };
  }, [socket, key]);
}

/** Joins a room while mounted (and after each reconnect). Server keeps us in it until disconnect. */
export function useJoinRoom(room: string | null) {
  const { socket, connected } = useSupportSocket();
  useEffect(() => {
    if (!socket || !connected || !room) return;
    void joinRoom(socket, room);
    return () => {
      // Best effort: the backend may or may not implement leave-room; harmless if ignored.
      socket.emit("leave-room", room);
    };
  }, [socket, connected, room]);
}

export const TICKET_EVENTS = [
  "ticket:created",
  "ticket:triaged",
  "ticket:assigned",
  "ticket:accepted",
  "ticket:reassigned",
  "ticket:escalated",
  "ticket:resolved",
  "ticket:updated",
];

export const AGENT_EVENTS = [
  "support:agent:online",
  "support:agent:offline",
  "support:agent:availability_changed",
];
