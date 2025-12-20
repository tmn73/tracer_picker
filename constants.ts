export const COMMITTEE_CODES = {
  EQ: "EQ",
  CNE:'CNE',
  SA: "SA",
  MB: "MB",
  AP: "AP",
  DA: "DA",
  ORS: "ORS",
  APEX: "APEX",
  MV: "MV",
  MJ: "MJ",
  PE: "PE",
  IF: "IF",
  CA: "CA",
  AU: 'AU'

};

export type CommitteeCode = keyof typeof COMMITTEE_CODES;

export const EXTRA_COMMITTEES_COUNT: Partial<Record<CommitteeCode, number>> = {
  APEX: 6,
  ORS: 15,
};

export const FILTERED_OUT_COMMITTEES: CommitteeCode[] = ["IF", "AU"]

export const SEASON_DATES = {
  start: "15/10/2025",
  end: "30/04/2026",
};

export const ALGO_WEIGHT_KNOBS = {
  // Poids de base (nombre de coureurs)
  // Ex: Si BASE_PERCENTAGE_WEIGHT = 2
  // - Un comité avec 10 coureurs (10%) -> 20%
  // - Un comité avec 20 coureurs (20%) -> 40%
  BASE_PERCENTAGE_WEIGHT: 1,

  // Poids des occurrences totales
  OCCURRENCE_WEIGHT_ENABLED: true, // Si false, le poids sera toujours 1
  // Ex: Si OCCURRENCE_DIVIDER = 2
  // - 1 occurrence -> weight = 1/(1*2) = 0.5
  // - 2 occurrences -> weight = 1/(2*2) = 0.25
  // - 3 occurrences -> weight = 1/(3*2) = 0.17
  OCCURRENCE_DIVIDER: 1.5,

  // Poids du nombre de courses depuis le dernier traçage
  COMPETITIONS_SINCE_LAST_TRACE_WEIGHT_ENABLED: true, // Si false, le poids sera toujours 1
  // Exposant utilisé pour calculer le poids selon le nombre de courses depuis le dernier traçage
  // Plus l'exposant est élevé, plus le poids augmente rapidement avec le temps
  // Ex: avec POWER = 2
  // - 2 courses depuis -> 2² = 4
  // - 3 courses depuis -> 3² = 9
  // - 4 courses depuis -> 4² = 16
  COMPETITIONS_SINCE_LAST_TRACE_POWER: 1.5,

  // Nombre minimum de courses avant d'augmenter le poids
  // Si une personne n'a pas tracé depuis 0 ou 1 course, son poids reste à 1
  // Le poids commence à augmenter à partir de 2 courses
  COMPETITIONS_SINCE_LAST_TRACE_MIN: 1,
};
