/**
 * The two startup reads (spec 001, FR3).
 *
 * Everything after this arrives on the WebSocket. These give the shape of things:
 * what equipments exist, in which zones, and what each zone aggregates.
 *
 * A 401 is retried once behind a refresh, and then given up on. Retrying a second
 * time would only turn one visible failure into a slower one.
 */

import type { Aggregation, Equipment, Zone } from "../sowel/types.ts";
import type { Session } from "./session.ts";

export class SowelUnreachable extends Error {}
export class SowelUnauthorised extends Error {}

export class Rest {
  private readonly session: Session;
  private readonly origin: string;

  constructor(session: Session, origin = "") {
    this.session = session;
    this.origin = origin;
  }

  private async get<T>(path: string, retried = false): Promise<T> {
    const token = this.session.token;
    if (!token) throw new SowelUnauthorised(path);

    let res: Response;
    try {
      res = await fetch(`${this.origin}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      throw new SowelUnreachable(path);
    }

    if (res.status === 401 && !retried) {
      if (await this.session.refresh()) return this.get<T>(path, true);
      throw new SowelUnauthorised(path);
    }
    if (res.status === 401) throw new SowelUnauthorised(path);
    if (!res.ok) throw new SowelUnreachable(`${path} → ${res.status}`);
    return (await res.json()) as T;
  }

  equipments(): Promise<Equipment[]> {
    return this.get<Equipment[]>("/api/v1/equipments");
  }

  zones(): Promise<Zone[]> {
    return this.get<Zone[]>("/api/v1/zones");
  }

  aggregation(): Promise<Aggregation> {
    return this.get<Aggregation>("/api/v1/zones/aggregation");
  }
}
