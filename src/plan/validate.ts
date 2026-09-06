import type { Plan } from "./types.ts";

/**
 * Checks a plan before anything is built from it. Returns every problem found,
 * so an author fixes a plan in one pass rather than one error at a time.
 */
export function validatePlan(plan: Plan): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();

  for (const r of plan.rooms) {
    if (ids.has(r.id)) problems.push(`duplicate room id "${r.id}"`);
    ids.add(r.id);
    if (r.w <= 0 || r.d <= 0) problems.push(`room "${r.id}" has a non-positive size`);
    const [sx, sz] = r.spot;
    if (sx < r.x || sx > r.x + r.w || sz < r.z || sz > r.z + r.d) {
      problems.push(`room "${r.id}" spot is outside the room`);
    }
  }

  for (const [i, w] of plan.walls.entries()) {
    if (w.to <= w.from) problems.push(`wall #${i} has to <= from`);
    for (const o of w.openings) {
      if (o.at - o.w / 2 < w.from || o.at + o.w / 2 > w.to) {
        problems.push(`wall #${i} opening at ${o.at} overflows the wall`);
      }
      if (o.head <= o.sill) problems.push(`wall #${i} opening at ${o.at} has head <= sill`);
      if (o.head > plan.height)
        problems.push(`wall #${i} opening at ${o.at} is taller than the wall`);
    }
  }

  for (const d of plan.doors) {
    for (const end of [d.a, d.b]) {
      if (end !== "away" && !ids.has(end))
        problems.push(`door ${d.a}-${d.b} references unknown room "${end}"`);
    }
  }

  const reachable = new Set<string>(["away"]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of plan.doors) {
      if (reachable.has(d.a) && !reachable.has(d.b)) {
        reachable.add(d.b);
        grew = true;
      }
      if (reachable.has(d.b) && !reachable.has(d.a)) {
        reachable.add(d.a);
        grew = true;
      }
    }
  }
  for (const r of plan.rooms) {
    if (!reachable.has(r.id)) problems.push(`room "${r.id}" cannot be reached from outside`);
  }

  return problems;
}
