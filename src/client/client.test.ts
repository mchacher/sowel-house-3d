import { describe, expect, it, vi } from "vitest";
import { Session } from "./session.ts";
import { Rest, SowelUnauthorised, SowelUnreachable } from "./rest.ts";
import { eventsOf, Socket, type SocketStatus, type SowelEvent } from "./socket.ts";

describe("Session", () => {
  it("reads the keys the product UI writes, so one login serves both", () => {
    // The showroom serves this app and the Sowel interface on one origin, so they
    // share localStorage. Guessing the key names meant neither saw a session.
    const store: Record<string, string> = {
      sowel_access_token: "a",
      sowel_refresh_token: "r",
    };
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    });
    expect(new Session().state).toEqual({ kind: "ready", accessToken: "a" });
    vi.unstubAllGlobals();
  });

  it("reports absence rather than guessing", () => {
    const session = new Session("", { accessToken: null, refreshToken: null });
    expect(session.state).toEqual({ kind: "absent" });
    expect(session.token).toBeNull();
  });

  it("tells an expired session from an absent one", () => {
    const session = new Session("", { accessToken: null, refreshToken: "r" });
    expect(session.state).toEqual({ kind: "expired" });
  });

  it("refreshes once and keeps the new token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accessToken: "fresh", refreshToken: "r2" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const session = new Session("", { accessToken: null, refreshToken: "r1" });
    expect(await session.refresh()).toBe(true);
    expect(session.token).toBe("fresh");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("collapses a burst of refreshes into one request", async () => {
    let resolve: (v: unknown) => void = () => {};
    const fetchMock = vi.fn().mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const session = new Session("", { accessToken: null, refreshToken: "r1" });
    const all = Promise.all([session.refresh(), session.refresh(), session.refresh()]);
    resolve({ ok: true, json: async () => ({ accessToken: "fresh" }) });
    expect(await all).toEqual([true, true, true]);
    // A burst of 401s must not become a burst of refreshes.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("drops a refresh token Sowel will not honour", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const session = new Session("", { accessToken: null, refreshToken: "stale" });
    expect(await session.refresh()).toBe(false);
    // Keeping it would have every request try, fail and try again.
    expect(session.state).toEqual({ kind: "absent" });
    vi.unstubAllGlobals();
  });

  it("survives a localStorage that throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => new Session()).not.toThrow();
    vi.unstubAllGlobals();
  });
});

describe("Rest", () => {
  const ready = () => new Session("", { accessToken: "t", refreshToken: "r" });

  it("reads the equipments", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [{ id: "a" }] }),
    );
    const equipments = await new Rest(ready()).equipments();
    expect(equipments).toEqual([{ id: "a" }]);
    vi.unstubAllGlobals();
  });

  it("retries a 401 once behind a refresh, and then gives up", async () => {
    const fetchMock = vi
      .fn()
      // the first read
      .mockResolvedValueOnce({ ok: false, status: 401 })
      // the refresh
      .mockResolvedValueOnce({ ok: true, json: async () => ({ accessToken: "fresh" }) })
      // the retry, still refused
      .mockResolvedValueOnce({ ok: false, status: 401 });
    vi.stubGlobal("fetch", fetchMock);
    await expect(new Rest(ready()).zones()).rejects.toBeInstanceOf(SowelUnauthorised);
    // Three calls, not four: retrying twice would turn one visible failure into a
    // slower one.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.unstubAllGlobals();
  });

  it("calls an unreachable Sowel unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(new Rest(ready()).aggregation()).rejects.toBeInstanceOf(SowelUnreachable);
    vi.unstubAllGlobals();
  });

  it("refuses to ask without a token", async () => {
    const session = new Session("", { accessToken: null, refreshToken: null });
    await expect(new Rest(session).equipments()).rejects.toBeInstanceOf(SowelUnauthorised);
  });
});

/** A WebSocket just real enough to drive the reconnection logic. */
class FakeSocket {
  static made: FakeSocket[] = [];
  readonly protocol: string | undefined;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  closed = false;
  readonly url: string;
  sent: string[] = [];

  constructor(url: string, protocol?: string) {
    this.url = url;
    this.protocol = protocol;
    FakeSocket.made.push(this);
  }

  close(): void {
    this.closed = true;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  deliver(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

describe("Socket", () => {
  function harness(token: () => string | null = () => "t") {
    FakeSocket.made = [];
    const events: SowelEvent[] = [];
    const statuses: SocketStatus[] = [];
    const socket = new Socket({
      token,
      origin: "http://sowel",
      onEvent: (e) => events.push(e),
      onStatus: (s) => statuses.push(s),
      make: (url, protocol) => new FakeSocket(url, protocol) as unknown as WebSocket,
    });
    return { socket, events, statuses };
  }

  it("sends the token as the subprotocol the core actually reads", () => {
    // `extractWsToken` in the core takes an Authorization header or a
    // `bearer.<token>` subprotocol and nothing else. A token on the query string
    // gets a 101 and is then closed with "Authentication required" — which is
    // exactly what the scene showed as a permanent "Reconnexion…".
    const { socket, statuses } = harness();
    socket.start();
    expect(FakeSocket.made[0].url).toBe("ws://sowel/ws");
    expect(FakeSocket.made[0].protocol).toBe("bearer.t");
    expect(FakeSocket.made[0].url).not.toContain("token=");
    expect(statuses).toEqual(["connecting"]);
    socket.stop();
  });

  it("subscribes on open, because the server sends nothing until asked", () => {
    // A socket that connects and subscribes to nothing says nothing: the server
    // starts every client on `system` only. The first version did exactly that, and
    // the scene sat still behind a status that said "open".
    const { socket } = harness();
    socket.start();
    const ws = FakeSocket.made[0];
    ws.onopen?.();
    expect(ws.sent).toHaveLength(1);
    expect(JSON.parse(ws.sent[0])).toEqual({
      type: "subscribe",
      topics: ["equipments", "zones", "system"],
    });
    socket.stop();
  });

  it("subscribes again after a reconnection", async () => {
    vi.useFakeTimers();
    const { socket } = harness();
    socket.start();
    FakeSocket.made[0].onopen?.();
    FakeSocket.made[0].onclose?.();
    await vi.advanceTimersByTimeAsync(600);
    FakeSocket.made[1].onopen?.();
    expect(FakeSocket.made[1].sent).toHaveLength(1);
    socket.stop();
    vi.useRealTimers();
  });

  it("holds events until released, then replays them in order", () => {
    const { socket, events } = harness();
    socket.start();
    const ws = FakeSocket.made[0];
    ws.onopen?.();
    ws.deliver({ type: "a" });
    ws.deliver({ type: "b" });
    // Nothing is lost in the gap between connecting and knowing what exists.
    expect(events).toEqual([]);
    socket.release();
    expect(events.map((e) => e.type)).toEqual(["a", "b"]);
    ws.deliver({ type: "c" });
    expect(events.map((e) => e.type)).toEqual(["a", "b", "c"]);
    socket.stop();
  });

  it("reads a batch, because the server sends a bare array", () => {
    // `JSON.stringify(deduped)` on the server: no envelope, no type of its own.
    // Checking `.type` on the frame drops every batch in silence and leaves a
    // healthy-looking socket above a house that never moves.
    const { socket, events } = harness();
    socket.start();
    socket.release();
    const ws = FakeSocket.made[0];
    ws.onopen?.();
    ws.deliver([{ type: "equipment.data.changed" }, { type: "zone.data.changed" }]);
    expect(events.map((e) => e.type)).toEqual(["equipment.data.changed", "zone.data.changed"]);
    socket.stop();
  });

  it("ignores a frame it cannot read rather than dropping the connection", () => {
    const { socket, events } = harness();
    socket.start();
    socket.release();
    const ws = FakeSocket.made[0];
    ws.onopen?.();
    ws.onmessage?.({ data: "not json" } as MessageEvent);
    ws.onmessage?.({ data: JSON.stringify({ noType: true }) } as MessageEvent);
    ws.deliver({ type: "real" });
    expect(events.map((e) => e.type)).toEqual(["real"]);
    expect(ws.closed).toBe(false);
    socket.stop();
  });

  it("reconnects with backoff when the socket drops", async () => {
    vi.useFakeTimers();
    const { socket, statuses } = harness();
    socket.start();
    FakeSocket.made[0].onopen?.();
    expect(statuses).toEqual(["connecting", "open"]);

    FakeSocket.made[0].onclose?.();
    expect(statuses.at(-1)).toBe("reconnecting");
    expect(FakeSocket.made).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(600);
    expect(FakeSocket.made).toHaveLength(2);
    socket.stop();
    vi.useRealTimers();
  });

  it("does not treat a close we asked for as a drop", async () => {
    vi.useFakeTimers();
    const { socket, statuses } = harness();
    socket.start();
    FakeSocket.made[0].onopen?.();
    socket.stop();
    expect(statuses.at(-1)).toBe("closed");
    await vi.advanceTimersByTimeAsync(60_000);
    // One socket ever: stopping must not schedule a reconnection.
    expect(FakeSocket.made).toHaveLength(1);
    vi.useRealTimers();
  });

  it("says closed rather than connecting without a token", () => {
    const { socket, statuses } = harness(() => null);
    socket.start();
    expect(FakeSocket.made).toHaveLength(0);
    expect(statuses).toEqual(["closed"]);
  });
});

describe("eventsOf", () => {
  it("takes a batch", () => {
    expect(eventsOf([{ type: "a" }, { type: "b" }]).map((e) => e.type)).toEqual(["a", "b"]);
  });

  it("takes the greeting, which is a lone object", () => {
    expect(eventsOf({ type: "connected", version: "1.68.0" })).toHaveLength(1);
  });

  it("drops what has no type, without dropping its neighbours", () => {
    expect(
      eventsOf([{ type: "a" }, { noType: 1 }, null, 7, { type: "b" }]).map((e) => e.type),
    ).toEqual(["a", "b"]);
  });

  it("takes an empty batch as nothing at all", () => {
    expect(eventsOf([])).toEqual([]);
    expect(eventsOf(null)).toEqual([]);
    expect(eventsOf("nope")).toEqual([]);
  });
});
