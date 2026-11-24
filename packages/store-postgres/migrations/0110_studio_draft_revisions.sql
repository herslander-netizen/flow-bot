-- Authoring only. Does not affect the runtime or published flow_versions.
CREATE TABLE flow_bot.studio_draft_revisions (
  workspace_id text NOT NULL CHECK (workspace_id ~ '^[A-Za-z0-9_-]{1,120}$'),
  environment text NOT NULL CHECK (environment IN ('test', 'staging')),
  flow_id text NOT NULL CHECK (flow_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  revision integer NOT NULL CHECK (revision > 0),
  document jsonb NOT NULL,
  actor_id text NOT NULL CHECK (actor_id ~ '^[A-Za-z0-9_-]{1,120}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, environment, flow_id, revision),
  CHECK (jsonb_typeof(document) = 'object'),
  CHECK ((document #>> '{flow,id}') IS NOT DISTINCT FROM flow_id),
  CHECK ((document #>> '{flow,status}') IS NOT DISTINCT FROM 'draft'),
  CHECK ((document ->> 'schemaVersion') IS NOT DISTINCT FROM 'flow-bot/v0')
);

-- Access through the trusted backend only. No browser grants or public API.
REVOKE ALL ON flow_bot.studio_draft_revisions FROM PUBLIC;
