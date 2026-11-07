-- Additive: do not reinterpret existing daily_activity values or estimates.
ALTER TABLE profiles ADD COLUMN activity_routine jsonb;
--> statement-breakpoint
ALTER TABLE profiles ADD CONSTRAINT profiles_activity_routine_object CHECK (activity_routine IS NULL OR jsonb_typeof(activity_routine) = 'object');
--> statement-breakpoint
ALTER TABLE nutrition_estimates ADD CONSTRAINT nutrition_estimates_v3_goal_values CHECK (
  formula_version <> 'mifflin-routine-goals-v3'
  OR (status = 'ready' AND num_nonnulls(normalized_goal,maintenance_calories,calorie_adjustment_kcal,protein_factor) = 4
    AND maintenance_calories > 0 AND calories = maintenance_calories + calorie_adjustment_kcal
    AND ((normalized_goal = 'bulk' AND calorie_adjustment_kcal BETWEEN 0 AND 300 AND protein_factor = 1.6)
      OR (normalized_goal = 'cut' AND calorie_adjustment_kcal BETWEEN -500 AND 0 AND calories >= 1500 AND protein_factor = 2)
      OR (normalized_goal = 'maintenance' AND calorie_adjustment_kcal = 0 AND protein_factor = 1.6)))
  OR (status <> 'ready' AND num_nonnulls(maintenance_calories,calorie_adjustment_kcal,protein_factor) = 0)
);
