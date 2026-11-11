-- 011: remediation_guides, the by-hand fix of a rule that has no automatic fix
-- (read by GET /remediation/findings/{id}/fix and guided plans, see
-- internal/remediation/store/guides.go). The security team owns the rows; this
-- only creates the table and the DEFAULT row, so a fresh tenant still gets
-- general steps. Existing rows are never changed.
-- Steps are JSON [{title, console, cli, iac}] with {placeholders} filled from the
-- finding: {open_title} {open_console} {open_cli} {how_to_fix} {target} {target_arn}
-- {role_name} {user_name} {region_flag} {tag_owner} {tag_purpose} ...
CREATE TABLE IF NOT EXISTS :"schema".remediation_guides (
    rule_id     VARCHAR(32) PRIMARY KEY,
    title       TEXT        NOT NULL,
    description TEXT        NOT NULL,
    risk_level  TEXT        NOT NULL DEFAULT 'MEDIUM',
    steps       JSONB       NOT NULL,
    enabled     BOOLEAN     NOT NULL DEFAULT true,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO :"schema".remediation_guides (rule_id, title, description, risk_level, steps) VALUES
  ('DEFAULT', 'Fix by hand', 'No automatic fix exists for this rule. Follow the steps in AWS.', 'MEDIUM',
   '[{"title":"{open_title}","console":"{open_console}","cli":"{open_cli}"},
     {"title":"Make the change: {how_to_fix}"},
     {"title":"Check the change is in place","console":"{open_console}","cli":"{open_cli}"},
     {"title":"Mark the plan done in the dashboard. The next scan closes the finding"}]'),
  ('OG-ID-005', 'Add a purpose tag', 'Write down what the identity is used for (a purpose tag or a description), so unusual activity can be recognised.', 'LOW',
   '[{"title":"{open_title}","console":"{open_console}","cli":"{open_cli}"},
     {"title":"Add the tag purpose = <what this identity is used for> (or write a description)","cli":"{tag_purpose}"},
     {"title":"Check that the tag is there","console":"{open_console}","cli":"{open_cli}"},
     {"title":"Mark the plan done in the dashboard. The next scan closes the finding"}]')
ON CONFLICT (rule_id) DO NOTHING;
