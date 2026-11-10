-- Nothing is undone: the engine's migrations add the same plan columns and statuses, and
-- dropping them would lose the engine's plans. Remove only if the engine is not used:
--   DROP INDEX IF EXISTS :"schema".idx_rem_plans_policy;
SELECT 1;
