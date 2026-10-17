-- Nullable additions retain v1 snapshots unchanged. New v2 estimates are
-- produced by the server/backfill, not by rewriting historical records.
ALTER TABLE nutrition_estimates
  ADD COLUMN normalized_goal varchar(20),
  ADD COLUMN maintenance_calories integer,
  ADD COLUMN calorie_adjustment_kcal integer,
  ADD COLUMN protein_factor numeric(4,2),
  ADD CONSTRAINT nutrition_estimates_goal CHECK (normalized_goal IS NULL OR normalized_goal IN ('bulk', 'cut', 'maintenance')),
  ADD CONSTRAINT nutrition_estimates_goal_values CHECK (
    formula_version <> 'mifflin-pal-goals-v2'
    OR (status = 'ready' AND num_nonnulls(normalized_goal, maintenance_calories, calorie_adjustment_kcal, protein_factor) = 4
      AND maintenance_calories > 0 AND calories = maintenance_calories + calorie_adjustment_kcal
      AND ((normalized_goal = 'bulk' AND calorie_adjustment_kcal BETWEEN 0 AND 300 AND protein_factor = 1.6)
        OR (normalized_goal = 'cut' AND calorie_adjustment_kcal BETWEEN -500 AND 0 AND calories >= 1500 AND protein_factor = 2)
        OR (normalized_goal = 'maintenance' AND calorie_adjustment_kcal = 0 AND protein_factor = 1.6)))
    OR (status <> 'ready' AND num_nonnulls(maintenance_calories, calorie_adjustment_kcal, protein_factor) = 0)
  );
