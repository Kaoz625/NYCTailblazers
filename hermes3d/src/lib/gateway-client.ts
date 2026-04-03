"use client";

import type { GatewayMessage } from "./types";

type MessageHandler = (msg: GatewayMessage) => void;
type StatusHandler = (connected: boolean) => void;

export class GatewayClient {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private messageHandlers: Set<MessageHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 2000;
  private maxReconnectDelay = 30000;
  private shouldReconnect = true;

  constructor(url: string, token = "") {
    this.url = url;
    this.token = token;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.shouldReconnect = true;
    this._connect();
  }

  private _connect() {
    const wsUrl = this.token
      ? `${this.url}?token=${encodeURIComponent(this.token)}`
      : this.url;

    try {
      this.ws = new WebSocket(wsUrl);
    } catch {
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectDelay = 2000;
      this.statusHandlers.forEach((h) => h(true));
      // Start heartbeat
      this._startPing();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: GatewayMessage = JSON.parse(event.data as string);
        this.messageHandlers.forEach((h) => h(msg));
      } catch {
        // ignore malformed frames
      }
    };

    this.ws.onclose = () => {
      this.statusHandlers.forEach((h) => h(false));
      if (this.shouldReconnect) this._scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private _pingInterval: ReturnType<typeof setInterval> | null = null;

  private _startPing() {
    this._stopPing();
    this._pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "ping", timestamp: new Date().toISOString() }));
      }
    }, 15_000);
  }

  private _stopPing() {
    if (this._pingInterval) {
      clearInterval(this._pingInterval);
      this._pingInterval = null;
    }
  }

  private _scheduleReconnect() {
    this._stopPing();
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this._connect();
    }, this.reconnectDelay);
  }

  disconnect() {
    this.shouldReconnect = false;
    this._stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  send(msg: Partial<GatewayMessage>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ...msg, timestamp: new Date().toISOString() }));
    }
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton for the app
let _client: GatewayClient | null = null;

export function getGatewayClient(): GatewayClient {
  if (!_client) {
    const url =
      (typeof window !== "undefined" &&
        (window as Window & { __HERMES_GATEWAY_URL__?: string }).__HERMES_GATEWAY_URL__) ||
      process.env.NEXT_PUBLIC_GATEWAY_URL ||
      "ws://localhost:18789";
    _client = new GatewayClient(url as string);
  }
  return _client;
}
