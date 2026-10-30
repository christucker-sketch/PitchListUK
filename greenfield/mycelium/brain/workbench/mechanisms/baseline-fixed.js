// Baseline: a fair FIXED workflow, the way a classic crawler (and fpd) works without learning. Breadth-first over new links;
// pages that have shown an opportunity (open or closed) go on a watch list and are re-checked oldest-first once due
// (PERIOD steps), using at most one fetch in every REVISIT_EVERY, like fpd's bounded rechecks; when there is nothing new
// left, it only re-checks. It knows no case vocabulary and never changes its rules.
function create(api) {
  const PERIOD = 150, REVISIT_EVERY = 4, queue = api.seeds.map(s => s.id), seen = new Set(queue), watch = new Map();
  let head = 0, step = 0;
  const due = now => { let best = null, bt = Infinity; for (const [id, t] of watch) if (now - t >= PERIOD && t < bt) { bt = t; best = id; } return best; };
  return {
    choose(now) {
      step++;
      if (step % REVISIT_EVERY === 0 || head >= queue.length) { const d = due(now); if (d !== null) return { fetch: d }; }
      if (head < queue.length) return { fetch: queue[head++] };
      return { wait: true };
    },
    observe(o) {
      if (o.key) watch.set(o.id, o.t);
      for (const l of o.links) if (!seen.has(l.to)) { seen.add(l.to); queue.push(l.to); }
    }
  };
}
