export async function controlledRolloutScheduled(controller) {
  return {
    ok: true,
    disabled: true,
    reason: 'controlled_us_rollout_manual_only',
    trigger: 'schedule',
    cron: controller?.cron || null,
    scheduled_time: controller?.scheduledTime || null,
    queued: 0
  };
}

