import { useEffect, useRef, useState } from "react";
import { Hud } from "./hud/Hud.tsx";
import { HouseRenderer } from "./scene/renderer.ts";
import { selectableLevels } from "./scene/geometry.ts";
import { useHouse } from "./useHouse.ts";

// Relative to the app's base, so the same build works at the root during a bare
// `vite dev` and under /maison/ behind the showroom's proxy.
const PLAN_URL = `${import.meta.env.BASE_URL}plans/showroom.json`;
const MAPPING_URL = `${import.meta.env.BASE_URL}plans/showroom.mapping.json`;

export function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<HouseRenderer | null>(null);
  const [level, setLevel] = useState(0);
  const { phase, socket, plan, state, lampCounts } = useHouse(PLAN_URL, MAPPING_URL);

  // The renderer outlives a render, so it is built once the plan is in and torn down
  // with the component — not rebuilt on every state change.
  useEffect(() => {
    if (!canvas.current || !plan) return;
    const house = new HouseRenderer(canvas.current, plan, level);
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
  }, [plan]);

  useEffect(() => {
    renderer.current?.setLampCounts(lampCounts);
  }, [lampCounts]);

  useEffect(() => {
    renderer.current?.setLevel(level);
  }, [level]);

  useEffect(() => {
    if (state) renderer.current?.update(state);
  }, [state]);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#EEF5F8] font-sans dark:bg-slate-950">
      <canvas ref={canvas} className="block h-full w-full" />
      <Hud
        phase={phase}
        socket={socket}
        state={state}
        levels={plan ? selectableLevels(plan) : []}
        level={level}
        onLevel={setLevel}
        onRecentre={() => renderer.current?.frameLevel()}
      />
    </main>
  );
}
