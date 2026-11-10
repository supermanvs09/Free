-- Nothing is undone: the accounts columns and the ispm_rule_weights mapping are shared with
-- the engine (engine migrations 012 / 015 remove them), and the dropped tables are not used.
SELECT 1;
