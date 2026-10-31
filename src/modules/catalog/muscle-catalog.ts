import { musclesByBodyPart } from "./exercise-query";
import { type muscleAreas } from "@/src/modules/workouts/measurement";

const labels: Record<(typeof muscleAreas)[number], { id: string; en: string }> = {
  chest: { id: "Dada", en: "Chest" }, shoulders: { id: "Bahu", en: "Shoulders" },
  biceps: { id: "Bisep", en: "Biceps" }, triceps: { id: "Trisep", en: "Triceps" },
  forearms: { id: "Lengan bawah", en: "Forearms" }, abs: { id: "Perut", en: "Abdominals" },
  obliques: { id: "Perut samping", en: "Obliques" }, upperBack: { id: "Punggung atas", en: "Upper Back" },
  lats: { id: "Otot punggung samping", en: "Lats" }, lowerBack: { id: "Punggung bawah", en: "Lower Back" },
  glutes: { id: "Bokong", en: "Glutes" }, quadriceps: { id: "Paha depan", en: "Quadriceps" },
  hamstrings: { id: "Paha belakang", en: "Hamstrings" }, calves: { id: "Betis", en: "Calves" },
};

export function getMuscleCatalog() {
  return {
    catalogVersion: "1",
    groups: ([
      { id: "upper_body", idLabel: "Tubuh atas", enLabel: "Upper Body" },
      { id: "lower_body", idLabel: "Tubuh bawah", enLabel: "Lower Body" },
    ] as const).map(group => ({
      ...group,
      muscles: musclesByBodyPart[group.id].map(id => ({ id, idLabel: labels[id].id, enLabel: labels[id].en })),
    })),
  };
}
