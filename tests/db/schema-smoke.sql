begin;

do $$
declare
  application_table_count integer;
begin
  select count(*)
    into application_table_count
    from information_schema.tables
   where table_schema = 'public'
     and table_type = 'BASE TABLE';

  if application_table_count <> 24 then
    raise exception 'expected 24 application tables, found %', application_table_count;
  end if;
end
$$;

insert into users (id, issuer, subject)
values
  ('11111111-1111-4111-8111-111111111111', 'https://issuer.test', 'user-one'),
  ('22222222-2222-4222-8222-222222222222', 'https://issuer.test', 'user-two');

insert into training_preferences (user_id, mode, no_equipment)
values ('11111111-1111-4111-8111-111111111111', 'calisthenics', true);

insert into custom_programs (
  user_id,
  id,
  mode,
  name,
  duration_minutes,
  weekday,
  exercise_prescriptions
)
values (
  '11111111-1111-4111-8111-111111111111',
  'custom-monday',
  'gym',
  'Monday strength',
  45,
  1,
  '[{"id":"squat","idLabel":"Squat","enLabel":"Squat","sets":3,"reps":8,"targetWeightKg":40,"requirements":[["barbell"]]}]'::jsonb
);

do $$
begin
  begin
    insert into custom_programs (
      user_id,
      id,
      mode,
      name,
      duration_minutes,
      weekday,
      exercise_prescriptions
    )
    values (
      '11111111-1111-4111-8111-111111111111',
      'custom-conflict',
      'gym',
      'Conflicting Monday',
      30,
      1,
      '[{"id":"press"}]'::jsonb
    );
    raise exception 'expected duplicate live schedule to fail';
  exception
    when unique_violation then null;
  end;
end
$$;

insert into workout_sessions (
  user_id,
  id,
  plan_id,
  mode,
  status,
  started_at,
  exercise_snapshot,
  set_log
)
values (
  '11111111-1111-4111-8111-111111111111',
  'session-active',
  'custom-monday',
  'gym',
  'active',
  now(),
  '[{"id":"squat"}]'::jsonb,
  '[]'::jsonb
);

do $$
begin
  begin
    insert into workout_sessions (
      user_id,
      id,
      plan_id,
      mode,
      status,
      started_at,
      exercise_snapshot,
      set_log
    )
    values (
      '11111111-1111-4111-8111-111111111111',
      'session-conflict',
      'another-plan',
      'calisthenics',
      'active',
      now(),
      '[{"id":"push-up"}]'::jsonb,
      '[]'::jsonb
    );
    raise exception 'expected second active session to fail';
  exception
    when unique_violation then null;
  end;
end
$$;

do $$
begin
  begin
    insert into place_favorites (user_id, place_id)
    values ('33333333-3333-4333-8333-333333333333', 'unknown-user-place');
    raise exception 'expected ownership foreign key to fail';
  exception
    when foreign_key_violation then null;
  end;
end
$$;

do $$
begin
  begin
    insert into operation_receipts (user_id, operation_id, request_hash, result)
    values (
      '11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'not-a-sha256',
      '{}'::jsonb
    );
    raise exception 'expected invalid receipt hash to fail';
  exception
    when check_violation then null;
  end;
end
$$;

do $$
begin
  begin
    insert into nutrition_estimates (user_id, profile_version, formula_version, status, input_snapshot, reason_codes)
    values ('11111111-1111-4111-8111-111111111111', 1, 'test', 'ready', '{}', '{}');
    raise exception 'expected ready nutrition without values to fail';
  exception when check_violation then null;
  end;
  begin
    insert into meal_entries (user_id, id, snapshot, servings)
    values ('11111111-1111-4111-8111-111111111111', 'incomplete-meal', '{}', 1);
    raise exception 'expected partially structured meal to fail';
  exception when check_violation then null;
  end;
  begin
    insert into nutrition_estimates (user_id, profile_version, formula_version, status, input_snapshot, reason_codes, resting_kcal, calories, protein_grams, protein_min, protein_max)
    values ('11111111-1111-4111-8111-111111111111', 1, 'mifflin-pal-goals-v2', 'ready', '{}', '{}', 1673.75, 2590, 112, 98, 140);
    raise exception 'expected v2 ready estimate without goal metadata to fail';
  exception when check_violation then null;
  end;
  begin
    insert into nutrition_estimates (user_id, profile_version, formula_version, status, input_snapshot, reason_codes, resting_kcal, calories, protein_grams, protein_min, protein_max, normalized_goal, maintenance_calories, calorie_adjustment_kcal, protein_factor)
    values ('11111111-1111-4111-8111-111111111111', 1, 'mifflin-pal-goals-v2', 'ready', '{}', '{}', 1673.75, 1990, 140, 112, 140, 'cut', 2590, -600, 2);
    raise exception 'expected excessive v2 deficit to fail';
  exception when check_violation then null;
  end;
  begin
    insert into nutrition_estimates (user_id, profile_version, formula_version, status, input_snapshot, reason_codes, resting_kcal, calories, protein_grams, protein_min, protein_max, normalized_goal, maintenance_calories, calorie_adjustment_kcal, protein_factor)
    values ('11111111-1111-4111-8111-111111111111', 1, 'mifflin-pal-goals-v2', 'ready', '{}', '{}', 1673.75, 2190, 140, 112, 140, 'cut', 2590, -390, 2);
    raise exception 'expected inconsistent v2 energy arithmetic to fail';
  exception when check_violation then null;
  end;
end
$$;

do $$
begin
  begin
    update place_catalog set latitude = 91 where id = 'jakarta-ftl-tebet';
    raise exception 'expected out-of-range coordinates to fail';
  exception when check_violation then null;
  end;
  begin
    update place_catalog set gym_category = null where id = 'jakarta-ftl-tebet';
    raise exception 'expected missing gym category to fail';
  exception when check_violation then null;
  end;
  begin
    update place_catalog set access_model = 'membership_or_per_visit', day_pass_available = null where id = 'jakarta-ftl-tebet';
    raise exception 'expected unsubstantiated per-visit flag to fail';
  exception when check_violation then null;
  end;
  begin
    update place_catalog set gym_category = 'conventional' where id = 'jakarta-gbk-gate-vii';
    raise exception 'expected gym category for a park to fail';
  exception when check_violation then null;
  end;
  begin
    update place_catalog set sources = '[]' where id = 'jakarta-ftl-tebet';
    raise exception 'expected empty place sources to fail';
  exception when check_violation then null;
  end;
end
$$;

do $$
declare
  invalid_tags text[];
begin
  begin
    update exercise_catalog set movement_tags = null where mode = 'gym' and id = 'press';
    raise exception 'expected null movement tags to fail';
  exception when not_null_violation then null;
  end;
  foreach invalid_tags slice 1 in array ARRAY[ARRAY[''], ARRAY['sholder'], ARRAY[NULL::text]] loop
    begin
      update exercise_catalog set movement_tags = invalid_tags where mode = 'gym' and id = 'press';
      raise exception 'expected invalid movement tag to fail';
    exception when check_violation then null;
    end;
  end loop;
  begin
    update exercise_catalog set movement_tags = '{}' where mode = 'gym' and id = 'press';
    raise exception 'expected empty movement tags to fail';
  exception when check_violation then null;
  end;
  begin
    insert into exercise_catalog (mode, id, id_label, en_label, default_sets, default_reps, requirements)
    values ('gym', 'untagged-test', 'Test', 'Test', 2, 8, '[[]]');
    raise exception 'expected new exercise without movement tags to fail';
  exception when not_null_violation then null;
  end;
end
$$;

do $$
begin
  begin
    update exercise_catalog set requirements = '[["unknown_machine"]]' where mode = 'gym' and id = 'press';
    raise exception 'expected unknown equipment reference to fail';
  exception when foreign_key_violation then null;
  end;
  begin
    update exercise_catalog set requirements = '["not-an-array"]' where mode = 'gym' and id = 'press';
    raise exception 'expected malformed equipment group to fail';
  exception when check_violation then null;
  end;
  begin
    update exercise_catalog set requirements = '{"wrong":"shape"}' where mode = 'gym' and id = 'press';
    raise exception 'expected malformed outer equipment structure to fail';
  exception when check_violation then null;
  end;
  begin
    delete from equipment_catalog where id = 'dumbbell';
    raise exception 'expected referenced equipment deletion to fail';
  exception when foreign_key_violation then null;
  end;
  begin
    update equipment_catalog set id = 'renamed_dumbbell' where id = 'dumbbell';
    raise exception 'expected referenced equipment ID rename to fail';
  exception when foreign_key_violation then null;
  end;
end
$$;

rollback;
