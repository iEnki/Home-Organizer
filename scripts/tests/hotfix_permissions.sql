-- Run only in a NEW disposable home28_* database as local supabase_admin.
-- psql -X -v ON_ERROR_STOP=1 -U supabase_admin -d home28_permissions -f scripts/tests/hotfix_permissions.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'home28\_%' ESCAPE '\' THEN
    RAISE EXCEPTION 'Use a new disposable home28_* database; never run on application/live databases';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
    RAISE EXCEPTION 'Fixture setup requires local administrative role';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='postgres' AND rolsuper) THEN
    RAISE EXCEPTION 'Fixture requires non-superuser postgres as in Supabase';
  END IF;
  IF to_regclass('public.home_einkaufliste') IS NOT NULL OR to_regclass('public.home_rezept_zutaten') IS NOT NULL THEN
    RAISE EXCEPTION 'Fixture database must not already contain application tables';
  END IF;
END $$;
GRANT USAGE, CREATE ON SCHEMA public TO postgres;
CREATE TABLE public.home_einkaufliste (id integer PRIMARY KEY, vorrat_id uuid);
CREATE TABLE public.home_rezept_zutaten (id integer PRIMARY KEY, matched_vorrat_id uuid);
INSERT INTO public.home_einkaufliste VALUES (1, NULL);
INSERT INTO public.home_rezept_zutaten VALUES (2, NULL);
ALTER TABLE public.home_einkaufliste OWNER TO postgres;
ALTER TABLE public.home_rezept_zutaten OWNER TO supabase_admin;
CREATE INDEX idx_home_einkaufliste_vorrat_id ON public.home_einkaufliste(vorrat_id);
CREATE INDEX idx_home_rezept_zutaten_matched_vorrat_id ON public.home_rezept_zutaten(matched_vorrat_id);
CREATE TEMP TABLE before_indexes AS SELECT oid, relname, relowner, relacl FROM pg_class
 WHERE oid IN ('public.idx_home_einkaufliste_vorrat_id'::regclass,'public.idx_home_rezept_zutaten_matched_vorrat_id'::regclass);
CREATE TEMP TABLE before_tables AS SELECT oid, relname, relowner, relacl FROM pg_class
 WHERE oid IN ('public.home_einkaufliste'::regclass,'public.home_rezept_zutaten'::regclass);

-- Both indexes exist, including one on a table postgres does not own.
SET LOCAL ROLE postgres;
\ir ../hotfix_2026_07_29_fast_mutations.sql
RESET ROLE;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM before_indexes b JOIN pg_class c USING(oid)
   WHERE c.relowner<>b.relowner OR c.relacl IS DISTINCT FROM b.relacl)
 OR (SELECT count(*) FROM before_indexes b JOIN pg_class c USING(oid))<>2 THEN
   RAISE EXCEPTION 'Existing indexes changed';
 END IF;
END $$;

-- Own missing index is created, foreign missing optional index warns and skips.
DROP INDEX public.idx_home_einkaufliste_vorrat_id;
DROP INDEX public.idx_home_rezept_zutaten_matched_vorrat_id;
SET LOCAL ROLE postgres;
\ir ../hotfix_2026_07_29_fast_mutations.sql
RESET ROLE;
DO $$ BEGIN
 IF to_regclass('public.idx_home_einkaufliste_vorrat_id') IS NULL
 OR to_regclass('public.idx_home_rezept_zutaten_matched_vorrat_id') IS NOT NULL THEN
   RAISE EXCEPTION 'Expected own create and foreign optional skip';
 END IF;
END $$;

-- Administrative manual run completes the missing index, repeat is idempotent.
\ir ../hotfix_2026_07_29_fast_mutations.sql
CREATE TEMP TABLE after_indexes AS SELECT oid FROM pg_class
 WHERE oid IN ('public.idx_home_einkaufliste_vorrat_id'::regclass,'public.idx_home_rezept_zutaten_matched_vorrat_id'::regclass);
\ir ../hotfix_2026_07_29_fast_mutations.sql
DO $$ BEGIN
 IF (SELECT count(*) FROM after_indexes b JOIN pg_class c USING(oid))<>2
 OR EXISTS (SELECT 1 FROM before_tables b JOIN pg_class c USING(oid)
   WHERE c.relowner<>b.relowner OR c.relacl IS DISTINCT FROM b.relacl)
 OR (SELECT count(*) FROM public.home_einkaufliste WHERE id=1)<>1
 OR (SELECT count(*) FROM public.home_rezept_zutaten WHERE id=2)<>1 THEN
   RAISE EXCEPTION 'Repeat, owners, grants or generated rows changed';
 END IF;
END $$;

-- A conflicting same-name relation is warned about and retained.
DROP INDEX public.idx_home_rezept_zutaten_matched_vorrat_id;
CREATE TABLE public.idx_home_rezept_zutaten_matched_vorrat_id (sentinel integer);
\ir ../hotfix_2026_07_29_fast_mutations.sql
DO $$ BEGIN
 IF (SELECT relkind FROM pg_class WHERE oid='public.idx_home_rezept_zutaten_matched_vorrat_id'::regclass)<>'r' THEN
   RAISE EXCEPTION 'Conflicting object was changed';
 END IF;
END $$;
DROP TABLE public.idx_home_rezept_zutaten_matched_vorrat_id;

-- Older schemas without target column/table remain supported.
ALTER TABLE public.home_rezept_zutaten DROP COLUMN matched_vorrat_id;
DROP TABLE public.home_einkaufliste;
\ir ../hotfix_2026_07_29_fast_mutations.sql
ROLLBACK;
\echo HOME28_PERMISSION_CONTRACT_PASSED
