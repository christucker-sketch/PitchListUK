# FindPitches v2

This directory contains the clean-room cloud runtime for FindPitches v2.

## Hard boundaries

FindPitches v2 must not depend on legacy runtime code, state, services, workflows, databases, local paths, systemd services, local cron jobs, or Hal.

Any legacy logic or data worth retaining must be copied into the v2 partition, reviewed, and thereafter owned by v2.

## Runtime target

- Cloudflare Worker
- Cloudflare Cron
- one generic acquisition Workflow where a Workflow is genuinely necessary
- dedicated D1 database
- dedicated queues/bindings
- cloud-hosted provider credentials
- GitHub Actions deployment
- FindPitches naming throughout

## Safety

The initial implementation is shadow-only. It must not write to the existing production opportunity datasets.

Publishing is introduced only after the common GB/US/CA acquisition path is proven.
