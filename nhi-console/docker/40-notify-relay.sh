#!/bin/sh
# Starts the console server next to nginx, bound to loopback: the live shared
# workspace (saved under DATA_DIR), alert email (Gmail/SMTP or Amazon SES) and
# Jira issues. It inherits the container's environment,
# so on ECS / EKS / EC2 it signs with the task, pod or instance role.
# Kept running: if it exits it is started again after two seconds.
set -eu
if [ "${NOTIFY_RELAY_ENABLED:-true}" != "true" ]; then
  echo "notify-relay: disabled (NOTIFY_RELAY_ENABLED=${NOTIFY_RELAY_ENABLED})"
  exit 0
fi
export PORT="${NOTIFY_RELAY_PORT:-8787}" HOST=127.0.0.1
(
  while true; do
    node /opt/notify-relay/notify-relay.mjs || true
    echo "notify-relay: exited, restarting in 2s" >&2
    sleep 2
  done
) &
mkdir -p "${DATA_DIR:-/var/lib/nhi}" 2>/dev/null || true
echo "notify-relay: starting on 127.0.0.1:${PORT} (shared workspace: $([ "${SYNC_ENABLED:-true}" = "false" ] && echo off || echo "on, saved in ${DATA_DIR:-/var/lib/nhi}"))"
