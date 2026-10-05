FROM postgres:18.6-bookworm@sha256:3725f4e2499eef5134592b3b4ab79a543ed7f8e533b05b5b637af926630f6650

# PGDG packages match PostgreSQL 18; pin extensions as well as the base image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       postgresql-18-partman=5.5.0-1.pgdg12+1 \
       postgresql-18-cron=1.6.8-1.pgdg12+2 \
    && rm -rf /var/lib/apt/lists/*

# cron.database_name must match the database containing CREATE EXTENSION pg_cron.
CMD ["postgres", "-c", "shared_preload_libraries=pg_cron", "-c", "cron.database_name=kinetiq", "-c", "cron.use_background_workers=on", "-c", "timezone=UTC", "-c", "max_connections=100"]
