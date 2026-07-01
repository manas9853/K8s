"""
Celery application instance.

Broker  → redis db 1  (CELERY_BROKER_URL)
Backend → redis db 2  (CELERY_RESULT_BACKEND)

Import order matters: this module must be importable without triggering
FastAPI / database init so the worker process can start cleanly.
"""
from celery import Celery
from config.settings import settings

celery_app = Celery(
    "k8s_opt",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "tasks.report_tasks",
        "tasks.compliance_tasks",
    ],
)

celery_app.conf.update(
    # Serialisation
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    # Timezone
    timezone="UTC",
    enable_utc=True,
    # Results
    result_expires=3600,          # keep results for 1 hour
    task_track_started=True,      # STARTED state visible to callers
    # Retry / ack
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    # Concurrency hint (overridden by --concurrency CLI flag)
    worker_prefetch_multiplier=1,
)

# Made with Bob
