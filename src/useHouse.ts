/**
 * Wiring: the plan, the session, the two reads, the socket, the state.
 *
 * A hook rather than a store, because there is exactly one house on the page and a
 * Zustand store would be a layer with nothing in it. If phase 4 needs state in two
 * places, that is when it earns a store.
 */

import { useEffect, useRef, useState } from "react";
import { Rest, SowelUnauthorised, SowelUnreachable } from "./client/rest.ts";
import { Session } from "./client/session.ts";
import { Socket, type SocketStatus, type SowelEvent } from "./client/socket.ts";
import { validatePlan } from "./plan/validate.ts";
import type { Plan } from "./plan/types.ts";
import type { Mapping } from "./mapping/types.ts";
import { derive } from "./mapping/derive.ts";
import { applyEvent, buildSceneState, type SceneState } from "./state/scene-state.ts";
import type { Aggregation, Equipment, Zone } from "./sowel/types.ts";
import type { AppPhase } from "./hud/status.ts";

export interface House {
  phase: AppPhase;
  socket: SocketStatus;
  plan: Plan | null;
  state: SceneState | null;
  /** How many lamps each room has, so the scene is built with the right count. */
  lampCounts: Record<string, number>;
}

export function useHouse(planUrl: string, mappingUrl: string): House {
  const [phase, setPhase] = useState<AppPhase>({ kind: "loading" });
  const [socketStatus, setSocketStatus] = useState<SocketStatus>("connecting");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [state, setState] = useState<SceneState | null>(null);
  const [lampCounts, setLampCounts] = useState<Record<string, number>>({});

  // The raw truth, kept out of React state: every event replaces one binding and the
  // scene state is recomputed, so re-rendering on each intermediate array would be
  // work for nothing.
  const live = useRef<{
    plan: Plan;
    mapping: Mapping;
    zones: Zone[];
    equipments: Equipment[];
    aggregation: Aggregation;
  } | null>(null);

  useEffect(() => {
    const session = new Session();
    const rest = new Rest(session);
    let socket: Socket | null = null;
    let cancelled = false;

    const recompute = (): void => {
      const current = live.current;
      if (!current) return;
      setState(buildSceneState(current));
    };

    const onEvent = (event: SowelEvent): void => {
      const current = live.current;
      if (!current) return;
      const result = applyEvent(current.equipments, current.aggregation, event);
      if (!result.changed) return;
      current.equipments = result.equipments;
      current.aggregation = result.aggregation;
      recompute();
    };

    void (async () => {
      if (session.state.kind === "absent") {
        setPhase({ kind: "no-session" });
        setSocketStatus("closed");
        return;
      }

      // The socket opens before the reads finish and holds what it hears, so nothing
      // that changes during startup is lost.
      socket = new Socket({
        token: () => session.token,
        onEvent,
        onStatus: (s) => !cancelled && setSocketStatus(s),
      });
      socket.start();

      try {
        const [planJson, mappingJson] = await Promise.all([
          fetch(planUrl).then((r) => r.json() as Promise<Plan>),
          fetch(mappingUrl).then((r) => r.json() as Promise<Mapping>),
        ]);
        const problems = validatePlan(planJson);
        if (problems.length > 0) {
          // A plan that does not validate would build a house with holes in it.
          throw new SowelUnreachable(`plan invalide : ${problems[0]}`);
        }

        const [zones, equipments, aggregation] = await Promise.all([
          rest.zones(),
          rest.equipments(),
          rest.aggregation(),
        ]);
        if (cancelled) return;

        live.current = { plan: planJson, mapping: mappingJson, zones, equipments, aggregation };
        const derived = derive(planJson, mappingJson, zones, equipments);
        setLampCounts(
          Object.fromEntries(Object.entries(derived.rooms).map(([id, r]) => [id, r.lamps.length])),
        );
        setPlan(planJson);
        recompute();
        setPhase({ kind: "live" });
        socket.release();
      } catch (error) {
        if (cancelled) return;
        setPhase(
          error instanceof SowelUnauthorised ? { kind: "no-session" } : { kind: "unreachable" },
        );
        // Release anyway: holding events for a startup that failed only leaks memory.
        socket?.release();
      }
    })();

    return () => {
      cancelled = true;
      socket?.stop();
    };
  }, [planUrl, mappingUrl]);

  return { phase, socket: socketStatus, plan, state, lampCounts };
}
