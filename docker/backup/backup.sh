#!/bin/bash
# Nightly pg_dump (custom format) into /backups, keeping BACKUP_KEEP_DAYS days.
# Sync /backups off-site (rclone, Unraid backup plugin, …).
#   Run once now:  docker compose run --rm backup now
#   Restore:       see README → Backups
set -euo pipefail

KEEP="${BACKUP_KEEP_DAYS:-14}"
HOUR="${BACKUP_HOUR:-3}"
DIR="${BACKUP_PATH:-/backups}"

dump() {
  local ts file
  ts="$(date +%Y-%m-%d_%H%M)"
  file="${DIR}/catastif_${ts}.dump"
  pg_dump --format=custom --no-owner --file="${file}.partial"
  mv "${file}.partial" "${file}"
  find "${DIR}" -maxdepth 1 -name 'catastif_*.dump' -mtime "+${KEEP}" -delete
  echo "[backup] $(date -Iseconds) wrote ${file} ($(du -h "${file}" | cut -f1))"
}

if [[ "${1:-}" == "now" ]]; then
  dump
  exit 0
fi

echo "[backup] daily at ${HOUR}:00 ${TZ:-UTC}, keeping ${KEEP} days"
while true; do
  now="$(date +%s)"
  next="$(date -d "today ${HOUR}:00" +%s)"
  (( next <= now )) && next="$(date -d "tomorrow ${HOUR}:00" +%s)"
  sleep $(( next - now ))
  dump || echo "[backup] $(date -Iseconds) FAILED" >&2
done
