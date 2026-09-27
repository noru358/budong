CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE certainty_status AS ENUM ('OFFICIAL_CONFIRMED','SOURCE_CONFIRMED','ESTIMATED','USER_ASSUMPTION','NEEDS_REVIEW');
CREATE TYPE license_readiness AS ENUM ('GREEN','YELLOW','RED','WHITE');
CREATE TYPE boundary_kind AS ENUM ('OFFICIAL','ADMIN_CANDIDATE','ANALYSIS_ESTIMATE');

CREATE TABLE source (
  id text PRIMARY KEY,
  name text NOT NULL,
  institution text,
  source_kind text NOT NULL,
  locator text,
  checked_at timestamptz
);

CREATE TABLE source_license (
  source_id text PRIMARY KEY REFERENCES source(id),
  license_name text,
  commercial_use boolean,
  redistribution boolean,
  derivative_use boolean,
  attribution_required boolean,
  ai_processing boolean,
  readiness license_readiness NOT NULL DEFAULT 'WHITE',
  reviewed_at timestamptz,
  review_note text
);

CREATE TABLE project (
  id text PRIMARY KEY,
  canonical_name text NOT NULL,
  normalized_name text NOT NULL,
  project_type_code text NOT NULL,
  project_type_name_official text NOT NULL,
  jurisdiction text NOT NULL,
  centroid_lat double precision,
  centroid_lng double precision,
  current_stage_code text,
  current_stage_name_official text,
  current_stage_effective_date date,
  verified_at timestamptz,
  source_assertion_id text
);

CREATE TABLE project_alias (
  project_id text NOT NULL REFERENCES project(id),
  alias text NOT NULL,
  normalized_alias text NOT NULL,
  alias_kind text NOT NULL DEFAULT 'ALIAS',
  PRIMARY KEY(project_id, alias)
);

CREATE TABLE project_stage_event (
  id bigserial PRIMARY KEY,
  project_id text NOT NULL REFERENCES project(id),
  stage_code text NOT NULL,
  stage_name_official text NOT NULL,
  legal_framework text,
  event_date date,
  certainty certainty_status NOT NULL,
  source_assertion_id text
);

CREATE TABLE rights_regulation_event (
  id bigserial PRIMARY KEY,
  project_id text NOT NULL REFERENCES project(id),
  event_type_code text NOT NULL,
  event_name_official text NOT NULL,
  effective_date date,
  status certainty_status NOT NULL DEFAULT 'NEEDS_REVIEW',
  source_assertion_id text,
  note text
);

CREATE TABLE boundary_version (
  id bigserial PRIMARY KEY,
  project_id text NOT NULL REFERENCES project(id),
  geometry_geojson jsonb NOT NULL,
  kind boundary_kind NOT NULL,
  valid_from date,
  valid_to date,
  source_assertion_id text
);

CREATE TABLE fact_assertion (
  id text PRIMARY KEY,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  predicate text NOT NULL,
  value_json jsonb NOT NULL,
  certainty certainty_status NOT NULL,
  source_id text REFERENCES source(id),
  source_locator text,
  effective_at timestamptz,
  reviewed_at timestamptz
);

CREATE TABLE source_lineage (
  derived_assertion_id text NOT NULL REFERENCES fact_assertion(id),
  upstream_assertion_id text NOT NULL REFERENCES fact_assertion(id),
  PRIMARY KEY(derived_assertion_id, upstream_assertion_id)
);

CREATE TABLE investment_case (
  id text PRIMARY KEY,
  project_id text REFERENCES project(id),
  label text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_name_trgm ON project USING gin (normalized_name gin_trgm_ops);
CREATE INDEX project_alias_trgm ON project_alias USING gin (normalized_alias gin_trgm_ops);

-- Search baseline: exact > alias exact > prefix > substring > trigram fuzzy.
-- Result projection must always include official project type and official current stage.
