/**
 * The live channel (spec 001, FR3).
 *
 * One WebSocket carries the whole house. There is **no polling fallback**: if the
 * socket drops, the app says it is reconnecting and keeps showing the last state,
 * greyed. A visitor can tell the difference between a house that is quiet and an app
 * that is lying, and only one of those is survivable.
 *
 * Events that arrive before the startup reads have resolved are queued and replayed,
 * so the gap between "connected" and "we know what exists" loses nothing.
 */

export type SocketStatus = "connecting" | "open" | "reconnecting" | "closed";

/** The events this app cares about. Anything else is ignored, not an error. */
export interface SowelEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * What this app asks the server to send it.
 *
 * A socket that connects and subscribes to nothing is a socket that says nothing:
 * the server starts every client on `system` only and waits to be told. That is
 * why the first version connected cleanly and the scene never updated — the status
 * said "open" and the house sat still, which looks exactly like a rendering bug.
 */
export const TOPICS = ["equipments", "zones", "system"] as const;

export interface SocketOptions {
  /** Returns the current access token, or null. Read per connection attempt. */
  token: () => string | null;
  onEvent: (event: SowelEvent) => void;
  onStatus: (status: SocketStatus) => void;
  /** Test seam. Defaults to the global. */
  make?: (url: string, protocol?: string) => WebSocket;
  /** Test seam, so a test does not wait seconds. */
  now?: () => number;
  origin?: string;
}

const BACKOFF_MS = [500, 1000, 2000, 5000, 10_000, 20_000];

/**
 * The events in one frame.
 *
 * The server batches: it accumulates events per client and sends
 * `JSON.stringify(deduped)` — **a bare array**, with no envelope and no `type` of
 * its own. Only the greeting is a single object. A client that checks `.type` on
 * the parsed frame therefore drops every batch in silence, keeps a healthy-looking
 * open socket, and shows a house that never moves. That is what this app did.
 */
export function eventsOf(parsed: unknown): SowelEvent[] {
  const one = (value: unknown): SowelEvent | null =>
    value !== null && typeof value === "object" && typeof (value as SowelEvent).type === "string"
      ? (value as SowelEvent)
      : null;

  if (Array.isArray(parsed)) return parsed.map(one).filter((e): e is SowelEvent => e !== null);
  const single = one(parsed);
  return single ? [single] : [];
}

export class Socket {
  private readonly options: SocketOptions;
  private ws: WebSocket | null = null;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  /** Events seen before `release()` is called. */
  private queue: SowelEvent[] = [];
  private holding = true;

  constructor(options: SocketOptions) {
    this.options = options;
  }

  /**
   * Stop holding events and replay what arrived while the startup reads were in
   * flight. Called once the app knows what exists.
   */
  release(): void {
    this.holding = false;
    const queued = this.queue;
    this.queue = [];
    for (const event of queued) this.options.onEvent(event);
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    // Detach the handlers before closing: a close we asked for must not look like
    // a drop and schedule a reconnection.
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      ws.close();
    }
    this.options.onStatus("closed");
  }

  private url(): string | null {
    const origin = this.options.origin;
    if (origin) return `${origin.replace(/^http/, "ws")}/ws`;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${location.host}/ws`;
  }

  /**
   * The token, as the subprotocol the core actually reads.
   *
   * `extractWsToken` in the core takes an `Authorization` header or a
   * `Sec-WebSocket-Protocol` of `bearer.<token>`, and **nothing else** — a token on
   * the query string is silently not a token, so the handshake succeeds with a 101
   * and the server then closes it saying "Authentication required". The browser
   * WebSocket API cannot set headers, which is exactly why the subprotocol path
   * exists.
   */
  private protocol(): string | null {
    const token = this.options.token();
    return token ? `bearer.${token}` : null;
  }

  private connect(): void {
    if (this.stopped) return;
    const url = this.url();
    const protocol = this.protocol();
    if (!url || !protocol) {
      this.options.onStatus("closed");
      return;
    }

    this.options.onStatus(this.attempt === 0 ? "connecting" : "reconnecting");
    const make =
      this.options.make ??
      ((u: string, p?: string) => (p ? new WebSocket(u, p) : new WebSocket(u)));
    let ws: WebSocket;
    try {
      ws = make(url, protocol);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      // Subscribe first, announce second: a listener that reacts to "open" by
      // reading state should not see a socket that is not yet carrying any.
      try {
        ws.send(JSON.stringify({ type: "subscribe", topics: [...TOPICS] }));
      } catch {
        /* the close handler will deal with it */
      }
      this.options.onStatus("open");
    };
    ws.onmessage = (message: MessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(message.data));
      } catch {
        return; // a frame we cannot read is not a reason to drop the connection
      }
      for (const event of eventsOf(parsed)) {
        if (this.holding) this.queue.push(event);
        else this.options.onEvent(event);
      }
    };
    ws.onerror = () => {
      /* onclose follows, and that is where reconnection is decided */
    };
    ws.onclose = () => {
      if (this.stopped) return;
      this.ws = null;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const wait = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)];
    this.attempt += 1;
    this.options.onStatus("reconnecting");
    this.timer = setTimeout(() => this.connect(), wait);
  }
}
