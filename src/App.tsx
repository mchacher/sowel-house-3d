import { useEffect, useRef, useState } from "react";
import { Hud } from "./hud/Hud.tsx";
import { HouseRenderer } from "./scene/renderer.ts";
import type { Focus } from "./scene/house.ts";
import { detectLang, rememberLang, type Lang } from "./i18n.ts";
import { selectableLevels } from "./scene/geometry.ts";
import { useHouse } from "./useHouse.ts";

// Relative to the app's base, so the same build works at the root during a bare
// `vite dev` and under /maison/ behind the showroom's proxy.
const PLAN_URL = `${import.meta.env.BASE_URL}plans/showroom.json`;
const MAPPING_URL = `${import.meta.env.BASE_URL}plans/showroom.mapping.json`;

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
  const [level, setLevel] = useState<Focus>(0);
  const [lang, setLang] = useState<Lang>(detectLang);
  // The renderer is built once the plan is in, which is after the first render:
  // it takes the language of that moment from a ref, and later changes through
  // setLang. Reading `lang` in the build effect would rebuild the house per word.
  const langRef = useRef(lang);
  // Computed once, in the initialiser: nothing here re-probes, and nothing sets it
  // from inside an effect.
  const [webgl] = useState(drawsWebGL);
  const { phase, socket, plan, state, lampCounts, counts } = useHouse(PLAN_URL, MAPPING_URL);

  // The renderer outlives a render, so it is built once the plan is in and torn down
  // with the component — not rebuilt on every state change.
  useEffect(() => {
    if (!canvas.current || !plan || !webgl) return;
    // Belt and braces: the probe said yes, so this should not throw — and if it
    // does, the readouts and the status line must still survive it. Losing the
    // scene is a degraded demo; losing the tree is a white page.
    let house: HouseRenderer;
    try {
      house = new HouseRenderer(canvas.current, plan, level, langRef.current);
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

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#EEF5F8] font-sans dark:bg-slate-950">
      <canvas ref={canvas} className="block h-full w-full" hidden={!webgl} />
      <Hud
        phase={webgl ? phase : { kind: "no-webgl" }}
        socket={socket}
        state={state}
        levels={plan && webgl ? selectableLevels(plan) : []}
        level={level}
        onLevel={setLevel}
        onRecentre={() => renderer.current?.frameLevel()}
        lang={lang}
        onLang={(next) => {
          rememberLang(next);
          setLang(next);
        }}
      />
    </main>
  );
}
