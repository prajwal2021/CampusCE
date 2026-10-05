# CampusCE

Pipeline that copies the ELEARNING_CampusCE database from the ADS SQL Server into a PostgreSQL
database (CampusCE_ADS_DB) on tosmonline0003.

- pull.ps1: runs on the laptop (off VPN). Reads ADS in throttled batches and writes gzipped CSV files.
  Resumes from the last finished batch if it fails.
- push.ps1: runs on the laptop (on VPN). Copies finished runs to 0003 and calls loader.py there.
- loader.py: runs on 0003 in the campusce-etl container. Merges each table into Postgres, one transaction per table.

The staging folder, logs and credentials are not tracked.
