#!/bin/sh
# Starts the notification relay (alert email through Amazon SES, Jira issues)
# next to nginx, bound to loopback. It inherits the container's environment,
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
echo "notify-relay: starting on 127.0.0.1:${PORT} (MAIL_FROM=${MAIL_FROM:-unset}, region=${SES_REGION:-${AWS_REGION:-ap-south-1}})"
