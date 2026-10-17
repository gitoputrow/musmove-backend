CREATE TABLE workout_program_catalog (
 id varchar(255) PRIMARY KEY,
 mode training_mode NOT NULL,
 name varchar(120) NOT NULL,
 focus varchar(20) NOT NULL CHECK (focus IN ('full','leg','chest','back','arm')),
 duration_minutes smallint NOT NULL CHECK (duration_minutes BETWEEN 10 AND 180),
 active boolean NOT NULL DEFAULT true,
 UNIQUE (id, mode)
);
--> statement-breakpoint
CREATE TABLE workout_program_exercises (
 program_id varchar(255) NOT NULL,
 position integer NOT NULL CHECK (position > 0),
 mode training_mode NOT NULL,
 exercise_id varchar(255) NOT NULL,
 sets smallint NOT NULL CHECK (sets BETWEEN 1 AND 10),
 reps smallint NOT NULL CHECK (reps BETWEEN 1 AND 100),
 PRIMARY KEY (program_id, position),
 UNIQUE (program_id, exercise_id),
 FOREIGN KEY (program_id, mode) REFERENCES workout_program_catalog(id, mode) ON DELETE CASCADE,
 FOREIGN KEY (mode, exercise_id) REFERENCES exercise_catalog(mode, id)
);
--> statement-breakpoint
-- Repetition-based core entries replace timed holds until timed prescriptions
-- are supported by the mobile editor and sync DTO.
INSERT INTO exercise_catalog (id,mode,id_label,en_label,default_sets,default_reps,requirements)
VALUES ('dead_bug','gym','Dead bug','Dead bug',3,10,'[[]]');
--> statement-breakpoint
INSERT INTO workout_program_catalog (id,mode,name,focus,duration_minutes) VALUES
('gym-full-dumbbell-v1','gym','Full Body Dumbbell','full', 35),
('gym-flow-dumbbell-v1','gym','Dumbbell Flow','full', 25),
('cali-full-body-v1','calisthenics','Bodyweight Foundation','full', 25),
('cali-flow-bodyweight-v1','calisthenics','Bodyweight Flow','full', 20),
('app-gym-leg-v1','gym','Gym leg','leg', 20),
('app-gym-chest-v1','gym','Gym chest','chest', 20),
('app-gym-back-v1','gym','Gym back','back', 20),
('app-gym-arm-v1','gym','Gym arm','arm', 20),
('app-calisthenics-leg-v1','calisthenics','Calisthenics leg','leg', 20),
('app-calisthenics-chest-v1','calisthenics','Calisthenics chest','chest', 20),
('app-calisthenics-back-v1','calisthenics','Calisthenics back','back', 20),
('app-calisthenics-arm-v1','calisthenics','Calisthenics arm','arm', 20);
--> statement-breakpoint
INSERT INTO workout_program_exercises (program_id,position,mode,exercise_id,sets,reps) VALUES
('gym-full-dumbbell-v1',1,'gym','press',3,10),
('gym-full-dumbbell-v1',2,'gym','row',3,12),
('gym-full-dumbbell-v1',3,'gym','squat',3,12),
('gym-full-dumbbell-v1',4,'gym','dead_bug',3,10),
('gym-flow-dumbbell-v1',1,'gym','curl',3,12),
('gym-flow-dumbbell-v1',2,'gym','raise',3,10),
('gym-flow-dumbbell-v1',3,'gym','lunge',2,10),
('cali-full-body-v1',1,'calisthenics','pushup',3,8),
('cali-full-body-v1',2,'calisthenics','squat',3,12),
('cali-full-body-v1',3,'calisthenics','lunge',2,10),
('cali-full-body-v1',4,'calisthenics','dead_bug',3,10),
('cali-flow-bodyweight-v1',1,'calisthenics','squat',3,12),
('cali-flow-bodyweight-v1',2,'calisthenics','bridge',3,12),
('cali-flow-bodyweight-v1',3,'calisthenics','bird_dog',3,10),
('app-gym-leg-v1',1,'gym','squat',3,12),
('app-gym-leg-v1',2,'gym','lunge',2,10),
('app-gym-chest-v1',1,'gym','press',3,10),
('app-gym-back-v1',1,'gym','row',3,12),
('app-gym-arm-v1',1,'gym','curl',3,12),
('app-gym-arm-v1',2,'gym','raise',3,10),
('app-calisthenics-leg-v1',1,'calisthenics','squat',3,12),
('app-calisthenics-leg-v1',2,'calisthenics','lunge',2,10),
('app-calisthenics-leg-v1',3,'calisthenics','bridge',3,12),
('app-calisthenics-chest-v1',1,'calisthenics','pushup',3,8),
('app-calisthenics-back-v1',1,'calisthenics','pullup',2,6),
('app-calisthenics-arm-v1',1,'calisthenics','diamond',2,6);
--> statement-breakpoint
INSERT INTO catalog_state (name,version) VALUES ('programs',1);
--> statement-breakpoint
CREATE FUNCTION bump_program_catalog_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE catalog_state SET version = version + 1 WHERE name = 'programs';
 RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER program_catalog_changed AFTER INSERT OR UPDATE OR DELETE ON workout_program_catalog
FOR EACH STATEMENT EXECUTE FUNCTION bump_program_catalog_version();
--> statement-breakpoint
CREATE TRIGGER program_exercises_changed AFTER INSERT OR UPDATE OR DELETE ON workout_program_exercises
FOR EACH STATEMENT EXECUTE FUNCTION bump_program_catalog_version();

