#!/usr/bin/env bash
set -euo pipefail

project_id="${GCP_PROJECT_ID:-plaudgoldminersistema}"
region="${GCP_REGION:-us-central1}"
service_name="${CLOUD_RUN_SERVICE:-plaudgoldminer}"
job_name="${PLAUD_SCHEDULER_JOB:-plaud-ingest-reconcile}"
secret_name="${PLAUD_INGEST_SECRET_NAME:-ingest-cron-secret}"

gcloud services enable cloudscheduler.googleapis.com --project="${project_id}" >/dev/null

service_url="$(
  gcloud run services describe "${service_name}" \
    --project="${project_id}" \
    --region="${region}" \
    --format='value(status.url)'
)"
ingest_secret="$(
  gcloud secrets versions access latest \
    --project="${project_id}" \
    --secret="${secret_name}"
)"

common_args=(
  --project="${project_id}"
  --location="${region}"
  --schedule="${PLAUD_SCHEDULER_CRON:-0 20 * * *}"
  --time-zone="America/Sao_Paulo"
  --uri="${service_url}/api/plaud/ingest"
  --http-method=POST
  --headers="x-ingest-secret=${ingest_secret},x-ingest-trigger=cron,Content-Type=application/json"
  --message-body='{}'
  --attempt-deadline=900s
)

if gcloud scheduler jobs describe "${job_name}" \
  --project="${project_id}" \
  --location="${region}" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "${job_name}" "${common_args[@]}"
else
  gcloud scheduler jobs create http "${job_name}" "${common_args[@]}"
fi

echo "Reconciliação automática do Plaud configurada para 20:00 (America/Sao_Paulo)."
