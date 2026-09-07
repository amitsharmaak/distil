-- Run once with the database owner. Login roles receive membership separately;
-- this file deliberately contains no passwords or connection strings.
DO $phase3_roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'distil_migration') THEN
    CREATE ROLE distil_migration NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'distil_runtime') THEN
    CREATE ROLE distil_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
  END IF;
END
$phase3_roles$;

GRANT distil_migration TO CURRENT_USER;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO distil_runtime;
GRANT USAGE, CREATE ON SCHEMA public TO distil_migration;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO distil_migration;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO distil_migration;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO distil_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO distil_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE distil_migration IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO distil_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE distil_migration IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO distil_runtime;

REVOKE CREATE ON SCHEMA public FROM distil_runtime;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM distil_runtime;
