# Mycelium PostgreSQL hosting decision memo

**22 October 2026 — Codex. Research complete; recommendation only. No purchasing, provisioning, migration or deployment approved.**

Authority: [Chris's hosting review commission](../../team/MYCELIUM_CODEX_POSTGRES_HOSTING_REVIEW_2026-10-22.md). This is a pricing addendum to the [single joint architecture](../../../docs/mycelium/PHASE_0_ARCHITECTURE_REVIEW.md), not another architecture or an implementation grant. Public official pages were retrieved today; no provider account, quote request, paid API or benchmark was used. Prices below are published rates; workload, FX, backup volumes and labour are explicit estimates.

**Latest precedence:** Chris's subsequent [£0-first commercial gates](../../../docs/mycelium/PHASE_0_COMMERCIAL_GATES_2026-10-22.md), received during this research, govern next steps. **Incremental experimentation budget is £0.** This comparison does not justify a new plan or an immediate paid Phase0A request. Prove a supported subscription-based Codex→Claude→Codex handoff first, then measurable discovery/reliability value under separately approved stages; consider paid capacity only after an observed bottleneck and a costed approval request.

## Recommendation

If a later, demonstrated bottleneck justifies paid testing, **Neon Launch, AWS London, is the preferred short benchmark candidate**: actual-data storage billing, adjustable compute and no minimum monthly fee suit a disposable test. Keep R2 as candidate evidence/portable-backup store. The joint plan's 4-CU/~16GB and smaller1-CU profiles would need measurement; neither has proved latency/throughput. Its earlier **£75 /24-hour** envelope is only a proposed maximum for a future specifically approved paid test, **not the next authorised step**.

For an **always-on service**, DigitalOcean deserves a direct benchmark comparison: its expected single-primary bills are lower than Neon at the assumed compute occupancy. If managed HA/longer history is required, compare DO Advanced plus standby with Aiven Business and Neon Scale's different recovery model. Supabase is viable but adds features we do not need and a material PITR charge. A self-managed VPS is cheap infrastructure, with a larger operational obligation; neither BRIX nor home connectivity may host the authoritative database or coordinator.

**No provider is selected yet.** Complete the £0-first gates and measure need before seeking a paid benchmark or ongoing subscription. Existing V3 D1/R2/customer/billing services are unaffected. There is no observed Mycelium database bottleneck yet: Mycelium is not running. Historical V3 D1 pressure motivated storage research, not a purchase by itself.

### No-cost options checked

Official current free quotas cannot hold25GB: **Neon1GB/project/100CU-hours monthly**, scale-to-zero after5min; **Aiven Free1GB** or Developer$5/8GB, without chosen region/pooling at those tiers; **Supabase Free500MB**, paused after a week of inactivity and no automatic backups/PITR. They are calibration/synthetic-proof candidates, not production capacity at any requested scale. A tiny10k-lead fixture is roughly96MB in the architecture's physical-size model, useful for a bounded free calibration only after approval and measured headroom; this cannot stand in for100k/1m/10m benchmarks. Do not split authoritative state across free accounts or exceed usage limits to avoid paying.

Read-only local checks found Codex's non-interactive CLI present and Claude CLI absent; no subscribed machine authentication or £0 billing mode is established. The joint review records supported-CLI documentation and remaining prerequisites. Existing cloud workspace/hardware are proposed for the initial synthetic proof; no machine was installed, provider free project created or model invoked. These are **options investigated**, not tests secretly executed. A genuine unavailable free path must be reported or simplified, not replaced by a metered API.

## Comparable assumptions

- **Data:** 25 / 100 / 250 decimal GB of actual operational PostgreSQL heap + indexes + TOAST, including retained graph/control data. Not raw HTML/PDFs, not lead counts, not just unindexed table payload. WAL, temporary space and maintenance headroom are additional.
- **Disk allowance:** target at least `1.5 × operational data + 5GB`; model 50 / 160 / 400 provider disk units, respecting each product's minima. DO/Aiven advertise binary-style sizes; Supabase/Hetzner label theirs GB. Either interpretation exceeds this decimal-data headroom target; do not silently equate GB with GiB. DO's 25GB Standard case needs its 60GiB minimum. Neon bills actual data rather than reserved local disk. Load-time WAL/restore peaks still require measurement.
- **Currency/time:** **US$1 = £0.80; €1 = £0.85**, planning assumptions, not observed FX or a bank quote. 730 hours/month for hourly services; use DO's advertised monthly caps. Exclude VAT/sales tax, payment FX fees and annual discounts. Allow ±10% FX sensitivity and recheck regional checkout prices before approval.
- **Idle:** 0.1 short DB transactions/s, mostly heartbeats; 10GB DB egress/month; changed history estimated at 0.5% of data/day. Neon at 0.25 CU **throughout 730h**. A durable coordinator polling regularly prevents scale-to-zero; no invented sleep savings. Other providers keep their selected fixed instance.
- **Expected:** 10 short DB transactions/s average, 10% writes, at most 16 ordinary active connections; 100GB DB egress/month, changed history 2% of data/day. Target RAM 4 / 8 / 16GB for the three sizes, subject to index working-set/CPU/I/O measurement. Neon averages 1 / 2 / 4 CU, one CU approximately 4GB RAM with associated CPU. Provider vCPUs/CUs are not performance equivalents.
- **Busy:** 40 short DB transactions/s, 25% writes, 1,000GB DB egress/month; changed history 10%/day. Model twice the RAM/compute tier, within the same disk allowance. These are **hypothetical approved upgrades**, not permission to autoscale or a throughput guarantee; otherwise pause at the existing grant. Shared CPU and write amplification may invalidate this sizing.
- **Recovery:** price seven-day PITR where available; retain an independent private portable-backup allowance separately below. Provider recovery capability is not a measured RPO≤15min/RTO≤4h. An executed restore/lease-invalidation drill is still a gate. Aiven Startup's two-day PITR is therefore not treated as meeting the seven-day requirement.

## Database bill: side-by-side estimates

Each cell is **GBP/month: idle / expected / busy**. Includes the database compute, modelled disk, provider PITR and stated DB egress. Includes HA **only for Aiven Business**; other availability differences are explicit below. Common R2/coordinator and operator work follow separately so the whole bill can be reconstructed.

| Provider/configuration | 25GB operational | 100GB operational | 250GB operational |
|---|---:|---:|---:|
| **Neon Launch** — usage-based, 7d history | **£22.62 / £69.46 / £173.61** | **£44.04 / £154.05 / £326.82** | **£86.88 / £323.22 / £633.23** |
| **Aiven Business, DO London** — 2 nodes, 14d PITR | £144.25 / £144.25 / £279.74 | £279.74 / £279.74 / £512.17 | £555.68 / £555.68 / £960.10 |
| **DigitalOcean** — Standard 4GB at25GB; Advanced 8/16GB at100/250GB, single primary | £48.72 / £48.72 / £108.60 | £118.72 / £118.72 / £222.72 | £244.80 / £244.80 / £452.80 |
| **Supabase Pro + 7d PITR** — Medium / Large / XL | £144.21 / £144.21 / £238.80 | £195.80 / £195.80 / £329.22 | £299.22 / £299.22 / £513.42 |
| **Hetzner VPS** — CX23 / CX33 / CX43 + volume + root-image backups; self-operated | £7.98 / £7.98 / £11.04 | £15.15 / £15.15 / £22.80 | £31.78 / £31.78 / £45.55 |

These are calculations, not personalised quotes. The VPS row is a published **cost baseline**, not a capacity reservation: the retrieved cost-optimised page marks availability limitations. Check actual region/stock; never silently substitute a higher-priced server. The very small VPS bill excludes the DBA/on-call effort essential to its backup/HA/security claims.

### Original rates and reproducible calculations

**Neon** ([pricing](https://neon.com/pricing), [billing/limits](https://neon.com/docs/introduction/plans)):

Launch **$0.106/CU-hour**, Scale **$0.222/CU-hour**, actual PG storage **$0.35/GB-month**, changed restore history **$0.20/GB-month**. Launch supports up to7d history, Scale30d; paid default is1d, so7d must be set deliberately. Public egress includes500GB/project/month, then$0.10/GB. No minimum monthly fee. Extra branches $0.002/branch-hour beyond included count; manual/scheduled snapshot storage $0.09/GB-month, not enabled in this model.

For data `D`, average CU `C`, assumed changed-history footprint `H` and DB egress `E`: `USD = 730×C×0.106 + 0.35×D + 0.20×H + max(E−500,0)×0.10`. Here `H = 7 × daily change fraction × D`; this is a hypothesis about billable history, **not measured WAL amplification**. Expected original USD totals: **$86.83 / $192.56 / $404.02**. More index/page rewrites or retained branches can materially raise them; every extra100GB of history costs another$20/month. Frequent polls keep compute active even when there are no acquisitions.

**Aiven** ([public regional pricing](https://aiven.io/pricing/postgresql)):

The page's published plan/region data give **DO London Business-4/8/16** at **$0.247/$0.479/$0.877 per hour**, 2 nodes, 4/8/16GB RAM per VM and80/175/350GiB base disk. Monthly cards round these to$180/$350/$640; use730-hour bills **$180.31/$349.67/$640.21** here. The250GB scenario extends350→400GiB at published **$0.00149 per additional disk GB-hour** for that Business service, adding$54.385/month. Do not multiply the already service-level HA rate again. Busy uses Business-8/16/32 ($0.479/$0.877/$1.644 per hour); Business-32 includes700GiB. Networking, routine monitoring/patching and provider backups are bundled; upgraded support is extra. Business PITR14d; Premium30d.

Cheaper **Startup-4/8/16** is $0.103/$0.199/$0.342 per hour, single-node with only **2d PITR**. Using its published$0.00054/additional-GB-hour, the same expected sizes cost about **£60.15 / £116.22 / £215.50**. It is a legitimate benchmark alternative, but fails the current seven-day recovery target. A daily logical dump cannot turn2d PITR into7d transaction-level recovery. Region/provider choice changes prices; the generic AWS London starting rate is not the quoted DO London rate.

**DigitalOcean** ([price table](https://www.digitalocean.com/pricing/managed-databases), [current terms](https://docs.digitalocean.com/products/databases/postgresql/details/pricing/), [Advanced](https://docs.digitalocean.com/products/databases/postgresql/concepts/advanced-edition/), [backups](https://docs.digitalocean.com/products/databases/postgresql/how-to/restore-from-backups/)):

Published plan data separate compute and disk. Standard4GB/2vCPU compute **$48/month + $0.215/GiB**, minimum60GiB: **$60.90 total**, not$60.90 plus storage again. Advanced8GB/2vCPU is **$130/month + $0.115/GiB**;16GB/4vCPU **$260 + disk**;32GB/8vCPU **$520 + disk**. Expected totals **$60.90/$148.40/$306.00**. DB traffic is not charged against transfer allowance. Automatic daily backups/7d restore history are included; manual restore creates another billable cluster and needs capacity/quota. Their destruction policy removes provider backups with the original cluster, so retain an independent export.

**Important effective-date constraint:** from **15Oct2026 for new accounts**, Standard cannot create plans above4GB or add standby/read-only nodes; this applies to all accounts from30Nov. The marketing table still lists larger Standard options. Do **not** budget a new8/16GB Standard cluster or cheap Standard HA from that table; use Advanced or obtain a verified exception. HA needs matching billed standby compute **and disk**. The25GB busy case moves to Advanced8GB rather than the now-ineligible Standard8GB.

**Supabase** ([pricing](https://supabase.com/pricing), [compute/disk](https://supabase.com/docs/guides/platform/compute-and-disk), [PITR](https://supabase.com/docs/guides/platform/backups), [spend cap](https://supabase.com/docs/guides/platform/cost-control)):

Pro **$25/month**, one **$10 monthly compute credit per organisation**,8GB disk included then **$0.125/GB-month**. Selected compute hourly rates: Medium4GB **$0.0822**, Large8GB **$0.1517**, XL16GB **$0.2877**, busy2XL32GB **$0.562**.7d PITR is **$0.137/hour (~$100/month)**, minimum Small compute;14d ~$200/28d ~$400. It replaces daily backups rather than creating another logical export. Include250GB uncached egress then **$0.09/GB**; cached API allowances are not a discount on ordinary PG traffic.

`USD = 25−10 + 730×compute_rate + 0.125×(disk−8) + 730×0.137 + max(E−250,0)×0.09`. Expected totals **$180.266 / $244.751 / $374.031**. We assume the organisation's compute credit is available to this one project; otherwise add$10/month. The default spend cap can block the disk expansion required here, while **compute, PITR, replicas and additional IOPS are excluded from that cap**. Configure project/admission limits deliberately; turning the spend cap off is not a safe global budget control.

gp3 lists3000 disk IOPS/$0.024 per extra IOPS-month, but effective compute throughput may be lower (Medium minimum2000IOPS/39MB/s; Large3600/79; XL6000/149). Burst exhaustion matters. The retrieved pricing page and compute guide disagree on extra throughput ($0.095 vs$0.95/MB/s-month); **no additional throughput is purchased or included**. Resolve the discrepancy before any such option is approved.

**Hetzner self-managed** ([server prices](https://www.hetzner.com/cloud/cost-optimized/), [volume price](https://www.hetzner.com/cloud/block-storage/), [backup limits](https://docs.hetzner.com/cloud/servers/backups-snapshots/overview/)):

EU CX23/33/43/53 list **€5.99/€8.99/€16.49/€29.99 per month**, includingIPv4,4/8/16/32GB RAM; cost-optimised shared CPU. Use CX23/33/43 for expected and the next size for busy. Public block-storage calculator gives **€0.044 per GB-month**; bill50/160/400 native volume units plus OS disk. Add a conservative20% of server price for root-image backups: `EUR = 1.2×server + 0.044×volume`. Expected **€9.388 / €17.828 / €37.388**.20TB EU traffic covers these scenarios; recheck any overage/region pricing before approval. The page's hourly backup/traffic labels have presentation ambiguities; these monthly estimates are not an invoice.

**Server image backups exclude attached volumes**, and seven daily image slots are not PITR. The database volume therefore needs properly operated PostgreSQL base backups + continuous WAL archiving,7d retention, restore verification and monitoring; storage allowance is in R2 below, implementation/labour is not free. Patching, upgrades, TLS, role/firewall policy, connection pooling, disk growth, WAL stalls, monitoring, corruption recovery and out-of-hours incidents belong to us. Powered-off VPSs still bill until decommissioned. Triple-replicated block storage is not PostgreSQL HA or an offsite backup.

## Common cloud, objects and operator cost

These costs apply **in addition to** the database row; they are not existing V3 spending or a model/search allowance.

[R2 Standard](https://developers.cloudflare.com/r2/pricing/) is **$0.015/GB-month**, Class A **$4.50/million**, Class B **$0.36/million**, no egress fee. Assume primary evidence `4D` and independent compressed backup allocation `2D`:150/600/1500GB total at the three database sizes. This ratio is a planning assumption, not measured source-body compression. Provider PITR is already counted above; do not charge it again here. R2 backup references/restore manifests must have separate ACL/lifecycle from raw evidence; another prefix is not another failure domain. Managed PG→R2 gives provider separation, but two R2 prefixes alone do not give independent object-provider disaster recovery. Any further replica/export has a separate approved cost.

No incremental free-tier credit is assumed: existing account use may consume it. R2's advertised10GB storage/1mA/10mB free allowances could lower the marginal bill, not guarantee it. Standard avoids infrequent-access retrieval fees and30d minimums. A backup application must prove its S3/WAL/restore compatibility; pricing R2 does not prove that software works.

[Workers Paid](https://developers.cloudflare.com/workers/platform/pricing/) starts **$5/account/month**,10m requests/30mCPU-ms included, then$0.30/m requests/$0.02/mCPU-ms. [Hyperdrive](https://developers.cloudflare.com/hyperdrive/platform/pricing/) pooling is included on Paid; Free's100kSQL statements/day is insufficient for the expected load. Model a cloud broker/gateway on Workers, subject to the joint0A pooling/placement benchmark; a separately hosted regional coordinator would require its own quote, not an invisible free server.

| Incremental cloud scenario, GBP/month | 25GB data | 100GB data | 250GB data |
|---|---:|---:|---:|
| Idle: objects +0.1mA/1mB +$5 Workers | £6.45 | £11.85 | £22.65 |
| Expected: objects +1mA/10mB +$5 Workers | £12.28 | £17.68 | £28.48 |
| Busy: objects +5mA/50mB +30m Worker requests at7msCPU (~$14.60) | £45.88 | £51.28 | £62.08 |

SQL transactions and broker HTTP/object requests have different counts; record each instead of treating10SQL/s as10object GETs/s. No new queue/log-drain/metrics subscription is assumed. Provider basic monitoring and our existing hub are sufficient for the proposed test; extended log retention/support/further replica costs require a quote. Different measured object ratios or requests replace these estimates.

**Operator allowance, not a vendor charge:** managed DB1–2hours/month at an illustrative£50/hour (**£50–100**); self-managed4–8h (**£200–400**), excluding initial setup/major incident and independent commercial-quality review. These are explicit planning allowances, not a service contract or a promise that existing chat sessions will operate unattended.

At100GB expected, infrastructure including common cloud is about **Neon£172 / Aiven£297 / DO£136 / Supabase£213 / VPS£33 per month**. With the stated routine operator allowance, about **£222–272 / £347–397 / £186–236 / £263–313 / £233–433** respectively. Paid AI, Serper, human opportunity audits, tax and exceptional incident work are separate. AI/search allowance remains **zero under this research order**.

## Availability, regions and access

| Option | Availability/recovery distinction and expected HA price |
|---|---|
| Neon Launch / Scale | [Multi-AZ storage and stateless compute recovery](https://neon.com/docs/introduction/high-availability) are built in, not a separately billed idle PostgreSQL standby. Brief writer interruption remains; provider describes seconds-to-minutes recovery and a5min unhealthy-endpoint detector. Launch does not include Scale's SLA/private-network features. At expected usage Scale is **£137 / £290 / £594** DB-only for25/100/250GB, not merely a storage upgrade. Confirm actual SLA/feature terms if required. |
| Aiven Business | Two-node managed HA/14d PITR already included in main row; quoted99.99% SLA is not proof of observed uptime or a substitute for restore testing. Startup's advertised SLA does not make its single VM redundant. |
| DO Advanced + standby | Expected two matching nodes including both disks: **£217 / £237 / £490** DB-only at the three sizes.25GB must use Advanced8GB for new-account HA. Connection pooler/failover still needs application reconnection/fencing tests. |
| Supabase Pro | One primary plus PITR in the row. [Read replicas](https://supabase.com/docs/guides/platform/read-replicas) are asynchronous read endpoints, not evidence of an automatic writable failover service. Required write-HA/contractual SLA needs confirmed supported topology and quote; not priced as a cheap replica. |
| VPS | Single VM is a single DB/coordinator failure point. Genuine HA needs two data nodes, an independent cloud quorum/witness, fencing and on-call operations. A100GB two-node + small-witness infrastructure floor is roughly£36/month before common cloud/operator work; it is **not a validated HA design/quote**. Do not use a BRIX as the witness or database. |

[Neon lists AWS London](https://neon.com/docs/introduction/regions); its London PG service exists even though some unrelated backend products are absent. Aiven's quoted DO London region exists. DO London and [Supabase London/EU regions](https://supabase.com/docs/guides/platform/regions) should be checked for the selected compute stock before creation. Hetzner baseline is Germany/Finland EU, not UK hosting; lower hardware cost may mean more network latency and our own security work. No database/Workers/BRIX latency has been measured in this review. Region changes generally involve export/replication and a new database, not a free in-place relocation.

Cloud-first means the coordinator, APIs, graph, task leases and evidence references remain usable with **both BRIX hosts and home internet offline**. Their tasks expire safely; they are replaceable fetch/extraction workers. They receive scoped HTTPS broker grants, never SQL/admin credentials. API/provider accounts, primary data, backups and stop controls must not depend on a Pi/BRIX disk or SSH tunnel.

Use verified TLS/CA/SNI and separate migration/broker/readonly roles; secrets in cloud bindings, no broad shared operator token. Benchmark Hyperdrive or the provider's transaction pooler against real short transactions, `SKIP LOCKED`, fencing, callbacks and connection limits. **Disable query caching on coordinator/lease/budget/outcome reads**; do not stack poolers or rely on session advisory locks/temp-state without validation. Ordinary Workers do not automatically provide a stable allowlisted egress IP/private VPC connection. Confirm the exact permitted connectivity mechanism; VPC/PrivateLink has plan/network costs. Prefer a regional broker/private DB path for a VPS; do not expose unauthenticated PostgreSQL or give home hosts DB access. Cloudflare placement near PG is a benchmark question, not a latency guarantee.

## Decision and upgrade gates

| Stage | Recommended configuration / threshold | Decision needed |
|---|---|---|
| £0 first milestone | Supported native subscription CLI Codex→Claude review→Codex reconciliation on already available cloud compute; synthetic/private handoff, no production rights; logged without Chris copying responses. | Establish actual permitted auth/quota, Claude CLI availability and hard stop before any extra charges, then obtain explicit stage approval. No model execution is authorised by the current design order. |
| Later paid storage benchmark, only if justified | Conditional candidate Neon Launch AWS London, supported pinned PG version, isolated synthetic100k/1m/10m; benchmark1CU and planned4CU/~16GB with caps. Earlier£75/24h proposal remains unspent. | First show the observed bottleneck, no-cost paths attempted, recurring/variable bill and expected commercial value. Chris approves exact provider/credential/test lifecycle and spend before provisioning; usage alerts are not a hard cap. |
| 25GB operational | Start from measured working set, not a free tier. Expected Neon1CU gives£69DB/£82cloud total before labour; DO4GB/60GiB gives£49/£61. Review DO if actual always-on Neon use is sustained above~0.66CU at equivalent measured service quality. | Separate ongoing monthly grant and availability/backup acceptance. No scale permission from benchmark success. |
| 100GB operational | Compare Neon2CU (~£154DB) with DO Advanced8GB/160GiB (~£119 single or£237HA). At Neon average~1.43CU, modeled compute/storage reaches DO's single-node bill; performance equivalence remains unproved. | Upgrade before memory/IOPS/backlog or storage headroom fails; obtain an explicit budget/HA choice. Aiven Business8 (~£280) is a bundled-HA alternative. |
| 250GB operational | Re-benchmark Neon4CU (~£323DB), DO Advanced16GB/400GiB (~£245 single/£490HA), SupabaseXL+PITR (~£299) and Aiven Business16+disk (~£556). Neon cost crossover is~2.73CU versus DO single at these assumptions. | Approve measured total bill, real restore duration/WAL peaks and any compute/HA/provider migration; do not let autoscaling choose the budget. |

At any size, investigate before disk live use reaches70% of its approved allowance, restore/expiry backlog breaches the joint thresholds, sustained CPU/working-set pressure invalidates p95 targets, or provider spend approaches80% of the approved phase/month cap. Stop admitting work before90% of the cap unless funded settlement/retention reserve remains. Native pricing alerts are **not** a hard stop: fixed compute maxima, no extra branches/replicas/IOPS, bounded ingress and an operator resource-expiry mechanism are prerequisites. Retained history/storage continues to bill while compute is paused.

For a future approved disposable0A project, record its configuration/manifest/results privately, preserve required test evidence, and obtain explicit permission for its end-of-window decommissioning **as part of that grant**. No existing V3 infrastructure or evidence is part of cleanup. If its safe lifecycle/cost bound cannot be enforced, do not create it. Re-price before every approval; no contract, account, dependency, credential, database, host service or paid workload was created by this review.

**Next: resolve and peer-review the £0 subscription-runtime prerequisites, then request approval for that bounded proof.** Paid storage, BRIX installation/profile execution, source acquisition, V3 adapters and ongoing production/HA subscriptions remain separate, unapproved decisions. No paid provider approval is requested merely because this comparison exists.
