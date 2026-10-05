# CampusCE

Pipeline that copies the ELEARNING_CampusCE database from the ADS SQL Server into a PostgreSQL
database (CampusCE_ADS_DB) on tosmonline0003.

- pull.ps1: runs on the laptop (off VPN). Reads ADS in throttled batches and writes gzipped CSV files.
  Resumes from the last finished batch if it fails. Read-only against ADS.
- push.ps1: runs on the laptop (on VPN). Copies finished runs to 0003, updates the server's clone of this repo
  and runs loader.py in the campusce-etl container.
- loader.py: merges each table into Postgres, one transaction per table. Tables with a primary key are upserted
  and rows missing from the snapshot are deleted. Tables without a key are replaced only if their content changed.
- install-tasks.ps1: registers two hourly Windows scheduled tasks. The pull only does work when 8 hours have passed
  since the last finished run and ADS is reachable; the push only does work when a finished run is waiting and 0003
  is reachable. Because ADS needs the VPN off and 0003 needs it on, each task simply waits for its turn.

On 0003 the Postgres container (campusce-pg) listens on 127.0.0.1:5433. Data is in schema dbo with lower-case
table names; load history is in etl.run_table.

The staging folder, logs and credentials are not tracked.
