# Chris's BRIX allocation clarification — 22 October 2026

This clarifies the [Mycelium Phase 0 commission](MYCELIUM_PHASE0_COMMISSION_2026-10-22.md) and [Codex consolidation order](MYCELIUM_CODEX_CONSOLIDATION_ORDER_2026-10-22.md). Incorporate it into the SINGLE joint architecture review.

**Owner decision:** Both available BRIX units are allocated **exclusively to Mycelium**, not to increasing the existing V3 producer's throughput:
- Gigabyte BRIX J3455, 8GB RAM, SSD.
- Gigabyte BRIX J1900, 8GB RAM, SSD.
- They are currently **powered off on Chris's bench**, and Chris intends to move them to his home tonight. Neither is currently running producer jobs.
- Chris is happy for both to be dedicated entirely to this project.

**Resource design:** Do **not** apply the Raspberry Pi's observed **450MB cgroup cap** as a default or mandatory limit to either BRIX. They each have 8GB RAM. Propose appropriate per-service cgroup ceilings, worker concurrency, process isolation, memory reserves, thermal/load limits and backpressure separately for each BRIX based on actual benchmarks. Eight GB physically installed does not imply eight GB available for one worker or identical capacity on J3455/J1900. Account for OS, caches, I/O, watchdog and overhead. Start conservatively, profile, then tune.

**Scope/approval distinction:** This is explicit hardware *allocation to the Mycelium project* and approval to plan their use. It is **not** blanket approval to provision a paid database, install experimental services tonight, turn on autonomous crawls, use paid APIs/models, modify V3, or bypass Phase 0 review. Any test/benchmark execution should be clearly specified in the consolidated plan with its requirements and safety limits, then approved as the next step; do not confuse intent to bring the machines home with evidence they are installed or online.

**For Codex and Claude:** Remove BRIX ownership/allocation as an open product decision. Retain benchmark details (and the host access/install mechanism) as an engineering question. Claude designs BRIX worker software and profiles; Codex handles coordinator/interface planning. No competing systems. Distinguish the Raspberry Pi's 450MB measured operating envelope from the 8GB BRIX hardware.

Keep the current V3 Pi operating independently. Hal remains outside FindPitches processing.
