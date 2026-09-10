import { describe, expect, it, vi } from "vitest";
import { Session } from "./session.ts";
import { Rest, SowelUnauthorised, SowelUnreachable } from "./rest.ts";
import { Socket, type SocketStatus, type SowelEvent } from "./socket.ts";

describe("Session", () => {
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
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  closed = false;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
    FakeSocket.made.push(this);
  }

  close(): void {
    this.closed = true;
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
      make: (url) => new FakeSocket(url) as unknown as WebSocket,
    });
    return { socket, events, statuses };
  }

  it("puts the token on the query string and announces itself", () => {
    const { socket, statuses } = harness();
    socket.start();
    expect(FakeSocket.made[0].url).toBe("ws://sowel/ws?token=t");
    expect(statuses).toEqual(["connecting"]);
    socket.stop();
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
