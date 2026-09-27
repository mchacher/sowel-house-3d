import { useEffect, useRef, useState } from "react";
import { Hud } from "./hud/Hud.tsx";
import { HouseRenderer, MINI_CLOSENESS } from "./scene/renderer.ts";
import type { Focus } from "./scene/house.ts";
import { detectLang, rememberLang, type Lang } from "./i18n.ts";
import { selectableLevels } from "./scene/geometry.ts";
import { useHouse } from "./useHouse.ts";
import { parseAnchor } from "./anchor.ts";

// Relative to the app's base, so the same build works at the root during a bare
// `vite dev` and under /maison/ behind the showroom's proxy.
const PLAN_URL = `${import.meta.env.BASE_URL}plans/showroom.json`;
const MAPPING_URL = `${import.meta.env.BASE_URL}plans/showroom.mapping.json`;

/**
 * `?mini=1`: the vignette the showroom floats over the Sowel interface — the house
 * from outside, standing closer, and no HUD. The camera stays where it is: it used
 * to fly to whatever a person acted on, and a view that lurched on every click was
 * harder to watch than one that simply showed the house reacting.
 */
const MINI = new URLSearchParams(window.location.search).get("mini") === "1";

/**
 * The vignette opened full screen, asked for by the page it floats in through this
 * frame's `#full` anchor. An anchor rather than a message: changing it reloads
 * nothing, and it is already there when the app starts, where a message sent
 * during loading would be lost before anyone listened.
 */
const fullRequested = (): boolean => parseAnchor(window.location.hash).full;

/**
 * Whether this browser will draw at all, asked once on a throwaway canvas.
 *
 * Asked *before* building the scene rather than discovered by building it: a
 * `WebGLRenderer` that cannot get a context throws, a throw inside an effect
 * unmounts the React tree, and the visitor is left with a blank white page
 * carrying no explanation of any kind. WebGL is off or blocked more often than it
 * looks — an old machine, a locked-down profile, hardware acceleration turned off,
 * a remote session.
 */
function drawsWebGL(): boolean {
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") ?? probe.getContext("webgl"));
  } catch {
    return false;
  }
}

export function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<HouseRenderer | null>(null);
  const [level, setLevel] = useState<Focus>(MINI ? "outside" : 0);
  // Small (the vignette) or big (the vignette opened full screen): the HUD and the
  // framing turn on it.
  const [mini, setMini] = useState(MINI && !fullRequested());
  const miniRef = useRef(mini);
  const [lang, setLang] = useState<Lang>(detectLang);
  // The renderer is built once the plan is in, which is after the first render:
  // it takes the language of that moment from a ref, and later changes through
  // setLang. Reading `lang` in the build effect would rebuild the house per word.
  const langRef = useRef(lang);
  // Computed once, in the initialiser: nothing here re-probes, and nothing sets it
  // from inside an effect.
  const [webgl] = useState(drawsWebGL);
  const { phase, socket, plan, state, lampCounts, counts, moveGhost } = useHouse(
    PLAN_URL,
    MAPPING_URL,
  );

  // The renderer outlives a render, so it is built once the plan is in and torn down
  // with the component — not rebuilt on every state change.
  useEffect(() => {
    if (!canvas.current || !plan || !webgl) return;
    // Belt and braces: the probe said yes, so this should not throw — and if it
    // does, the readouts and the status line must still survive it. Losing the
    // scene is a degraded demo; losing the tree is a white page.
    let house: HouseRenderer;
    try {
      house = new HouseRenderer(
        canvas.current,
        plan,
        level,
        langRef.current,
        miniRef.current ? MINI_CLOSENESS : 1,
      );
    } catch {
      return;
    }
    renderer.current = house;
    house.start();
    const onResize = () => house.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      house.stop();
      renderer.current = null;
    };
    // `level` is applied through setLevel below rather than by rebuilding the whole
    // renderer, so it is deliberately not a dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, webgl]);

  useEffect(() => {
    renderer.current?.setLampCounts(lampCounts, counts);
  }, [lampCounts, counts]);

  useEffect(() => {
    langRef.current = lang;
    renderer.current?.setLang(lang);
  }, [lang]);

  useEffect(() => {
    renderer.current?.setLevel(level);
  }, [level]);

  useEffect(() => {
    if (state) renderer.current?.update(state);
  }, [state]);

  // The page the vignette floats in talks through the anchor (spec 003, amended):
  // full screen and back, a storey, a walk. Read on every change, and once the
  // house is built for an anchor that was already there when the app started.
  useEffect(() => {
    const house = renderer.current;
    if (!house) return;
    const apply = (): void => {
      const anchor = parseAnchor(window.location.hash);
      if (MINI) {
        const next = !anchor.full;
        if (next !== miniRef.current) {
          miniRef.current = next;
          setMini(next);
          house.setMini(next);
          house.frameLevel();
        }
      }
      // A walk decides the view itself, following the figure (spec 005, FR4).
      if (anchor.walk && !anchor.me) house.walkOther(anchor.walk, anchor.who);
      else if (anchor.walk) house.walkTo(anchor.walk);
      else if (anchor.level !== null) {
        setLevel(anchor.level);
        house.setLevel(anchor.level);
      }
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [plan, webgl]);

  // The visitor's figure tells Sowel where it is as it walks in (spec 005, FR3), and
  // the storey follows it, so it never walks inside a ghosted floor (FR4). Standing
  // in a room, it renews its ghost every minute: the simulator forgets a ghost after
  // two minutes without an order. Walking out, it sends `away`, and the ghost goes.
  const [ghostTrouble, setGhostTrouble] = useState(false);
  useEffect(() => {
    const house = renderer.current;
    if (!house || !plan) return;
    house.onVisitorEnter = (room) => {
      void moveGhost(room).then((ok: boolean) => setGhostTrouble(!ok));
    };
    house.onFollow = (focus) => setLevel(focus);
    const renew = window.setInterval(() => {
      const room = house.visitorAt;
      if (room) void moveGhost(room);
    }, 60_000);
    return () => {
      house.onVisitorEnter = null;
      house.onFollow = null;
      window.clearInterval(renew);
    };
  }, [plan, webgl, moveGhost]);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#EEF5F8] font-sans dark:bg-slate-950">
      <canvas ref={canvas} className="block h-full w-full" hidden={!webgl} />
      <Hud
        phase={webgl ? phase : { kind: "no-webgl" }}
        socket={socket}
        state={state}
        levels={plan && webgl ? selectableLevels(plan) : []}
        level={level}
        onLevel={(next) => {
          // A storey picked by hand: the view stops following the figure.
          renderer.current?.stopFollowing();
          setLevel(next);
        }}
        onRecentre={() => renderer.current?.frameLevel()}
        lang={lang}
        onLang={(next) => {
          rememberLang(next);
          setLang(next);
        }}
        mini={mini}
        unheard={ghostTrouble}
      />
    </main>
  );
}
