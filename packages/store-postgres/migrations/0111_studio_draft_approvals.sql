-- Authoring only; no activation or publication of flows.
CREATE TABLE flow_bot.studio_draft_approvals (
  workspace_id text NOT NULL,
  environment text NOT NULL,
  flow_id text NOT NULL,
  revision integer NOT NULL,
  reviewer_id text NOT NULL CHECK (reviewer_id ~ '^[A-Za-z0-9_-]{1,120}$'),
  document_sha256 text NOT NULL CHECK (document_sha256 ~ '^[a-f0-9]{64}$'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[a-f0-9]{64}$'),
  scenario_count integer NOT NULL CHECK (scenario_count BETWEEN 1 AND 20),
  approved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, environment, flow_id, revision),
  FOREIGN KEY (workspace_id, environment, flow_id, revision)
    REFERENCES flow_bot.studio_draft_revisions (workspace_id, environment, flow_id, revision)
);

REVOKE ALL ON flow_bot.studio_draft_approvals FROM PUBLIC;
