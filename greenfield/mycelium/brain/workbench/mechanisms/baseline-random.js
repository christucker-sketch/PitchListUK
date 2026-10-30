// Baseline: uniform random over every page it has been shown (fetched or not). Learns nothing.
function create(api) {
  const known = api.seeds.map(s => s.id), seen = new Set(known);
  return {
    choose() { return { fetch: known[Math.floor(Math.random() * known.length)] }; },
    observe(o) { for (const l of o.links) if (!seen.has(l.to)) { seen.add(l.to); known.push(l.to); } }
  };
}
