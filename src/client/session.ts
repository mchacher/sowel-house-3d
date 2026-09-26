/**
 * The session, which this app is given rather than asks for (spec 001, FR4).
 *
 * The showroom's landing page logs a visitor in and leaves the tokens in
 * `localStorage`, the same place the product UI keeps them, on the same origin.
 * This app reads them and refreshes on a 401.
 *
 * **It offers no login form.** This is a view onto a Sowel somebody else
 * authenticated; a second front door would be a second thing to secure, and the
 * one place a visitor types a password should stay the one place.
 */

/**
 * The product UI's own keys, character for character.
 *
 * Not a convention worth inventing: this app and the Sowel interface share an
 * origin in the showroom, so they share `localStorage`, and a visitor logged in by
 * the landing page must arrive logged in to **both**. Guessing `sowel.accessToken`
 * meant neither of them saw a session and the landing page's whole point was lost —
 * found by opening the page, which is the only way it could have been.
 */
const ACCESS_KEY = "sowel_access_token";
const REFRESH_KEY = "sowel_refresh_token";

export type SessionState =
  { kind: "ready"; accessToken: string } | { kind: "absent" } | { kind: "expired" };

/** `localStorage` throws in some privacy modes, so every touch is guarded. */
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* a session that cannot be stored still works for this page's lifetime */
  }
}

export class Session {
  private readonly origin: string;
  private accessToken: string | null;
  private refreshToken: string | null;
  /** One refresh at a time: a burst of 401s must not become a burst of refreshes. */
  private refreshing: Promise<boolean> | null = null;

  constructor(
    origin = "",
    initial?: { accessToken?: string | null; refreshToken?: string | null },
  ) {
    this.origin = origin;
    this.accessToken = initial?.accessToken ?? read(ACCESS_KEY);
    this.refreshToken = initial?.refreshToken ?? read(REFRESH_KEY);
  }

  get state(): SessionState {
    if (this.accessToken) return { kind: "ready", accessToken: this.accessToken };
    return this.refreshToken ? { kind: "expired" } : { kind: "absent" };
  }

  get token(): string | null {
    return this.accessToken;
  }

  /** True when a new access token was obtained. Never throws. */
  async refresh(): Promise<boolean> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<boolean> {
    if (!this.refreshToken) return false;
    try {
      const res = await fetch(`${this.origin}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });
      if (!res.ok) {
        // A refresh token Sowel will not honour is worse than none: keeping it
        // would have every request try, fail and try again.
        this.accessToken = null;
        this.refreshToken = null;
        return false;
      }
      const body = (await res.json()) as { accessToken?: string; refreshToken?: string };
      if (!body.accessToken) return false;
      this.accessToken = body.accessToken;
      write(ACCESS_KEY, body.accessToken);
      if (body.refreshToken) {
        this.refreshToken = body.refreshToken;
        write(REFRESH_KEY, body.refreshToken);
      }
      return true;
    } catch {
      return false;
    }
  }
}
