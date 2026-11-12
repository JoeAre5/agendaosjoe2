#!/usr/bin/env bash
set -euo pipefail
# Explicit dedicated local socket/port only. Never use environment PGHOST.
socket="${1:?Pass the disposable socket directory}"
port="${2:?Pass the disposable port}"
database="${3:?Pass the empty disposable database name}"
case "$socket" in /tmp/duplicate-validation*) ;; *) echo 'Refusing non-test socket'; exit 1 ;; esac
case "$database" in duplicate_test*) ;; *) echo 'Refusing non-test database'; exit 1 ;; esac
psql -h "$socket" -p "$port" -U lovable -d "$database" -v ON_ERROR_STOP=1 \
  -f supabase/tests/client_duplicate_review_bootstrap.sql \
  -f drizzle/migrations/0019_client_duplicate_review_actions.sql \
  -f supabase/tests/client_duplicate_review_test.sql