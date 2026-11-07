import type { CommitteeCode } from "./constants";
import { ALGO_WEIGHT_KNOBS } from "./constants";

export type CommitteeEntry = {
  committee: CommitteeCode;
  percentage: number;
  count: number;
  isHomeCommittee?: boolean;
  isPicked?: boolean;
  isHandpicked?: boolean;
  lastDate?: Date;
  occurrences?: number;
  competitionsSinceLastTrace?: number;
  weight?: number;
  baseWeight?: number;
};

export type CommitteeResults = {
  manche1: CommitteeEntry[];
  manche2: CommitteeEntry[];
  manche3: CommitteeEntry[];
  manche4: CommitteeEntry[];
  date?: string;
  location?: string; // nom de la course
  station?: string; // lieu de la course (station)
  discipline?: string;
  competitionCode: string;
  // Détail des effectifs utilisés pour le tirage (affichage uniquement)
  effectifs?: Effectifs;
};

export type Effectifs = {
  organisateur: { committee: CommitteeCode; count: number };
  totalPage: number; // inscrits sur la page, tous comités confondus
  sansComite: number; // inscrits sans code comité
  exclus: Partial<Record<string, number>>; // comités filtrés (jamais traceurs)
  retenus: number; // coureurs retenus, hors organisateur et hors exclus
  artificiels: Partial<Record<string, number>>; // comités ajoutés artificiellement
  base: number; // base de calcul des pourcentages (retenus + artificiels)
};

export type HistoricalEntry = {
  traceurs: {
    manche1: CommitteeCode;
    manche2: CommitteeCode;
    manche3: CommitteeCode;
    manche4: CommitteeCode;
  };
};

type HistoricalKey = `${string}_${string}_${string}_${string}`;

export type SelectionHistory = Record<HistoricalKey, HistoricalEntry>;

// Poids lié au nombre de traçages passés : plus un comité a tracé, moins il pèse.
// Un comité qui n'a jamais tracé (0) a donc le poids le plus élevé.
export const computeOccurrenceWeight = (occurrences: number): number =>
  ALGO_WEIGHT_KNOBS.OCCURRENCE_WEIGHT_ENABLED
    ? 1 / ((occurrences + 1) * ALGO_WEIGHT_KNOBS.OCCURRENCE_DIVIDER)
    : 1;

// Poids lié à l'attente : plus un comité n'a pas tracé depuis longtemps, plus il pèse.
export const computeWaitWeight = (competitionsSinceLastTrace: number): number =>
  ALGO_WEIGHT_KNOBS.COMPETITIONS_SINCE_LAST_TRACE_WEIGHT_ENABLED
    ? Math.max(
        ALGO_WEIGHT_KNOBS.COMPETITIONS_SINCE_LAST_TRACE_MIN,
        competitionsSinceLastTrace
      ) ** ALGO_WEIGHT_KNOBS.COMPETITIONS_SINCE_LAST_TRACE_POWER
    : 1;

// Helper functions to calculate weights based on history
const calculateHistoricalWeights = (
  committees: CommitteeEntry[],
  history: SelectionHistory,
  excludeCommittee?: CommitteeCode
): CommitteeEntry[] => {
  const occurrences = new Map<CommitteeCode, number>();
  const competitionsSinceLastTrace = new Map<CommitteeCode, number>();
  const historyEntries = Object.entries(history);

  // First pass: count total occurrences for each committee
  historyEntries.forEach(([, data]) => {
    Object.values(data.traceurs).forEach((committee) => {
      occurrences.set(committee, (occurrences.get(committee) || 0) + 1);
    });
  });

  // Second pass: count competitions since last trace for each committee
  committees.forEach(({ committee }) => {
    let count = 0;
    let found = false;

    // Iterate through history in reverse to count competitions since last trace
    for (let i = historyEntries.length - 1; i >= 0; i--) {
      const [, data] = historyEntries[i];
      if (!found) {
        if (Object.values(data.traceurs).includes(committee)) {
          found = true;
        }
        count++;
      }
    }

    competitionsSinceLastTrace.set(committee, found ? count - 1 : count);
  });

  return committees.map((entry) => {
    if (excludeCommittee && entry.committee === excludeCommittee) {
      return { ...entry, percentage: 0 };
    }

    const basePercentage =
      entry.percentage * ALGO_WEIGHT_KNOBS.BASE_PERCENTAGE_WEIGHT;

    // Calcul du poids des occurrences
    const occurrenceWeight = computeOccurrenceWeight(
      occurrences.get(entry.committee) || 0
    );

    // Calcul du poids du nombre de courses depuis le dernier traçage
    const competitionsWeight = computeWaitWeight(
      competitionsSinceLastTrace.get(entry.committee) || 0
    );

    const baseWeight = occurrenceWeight * competitionsWeight;
    const newPercentage = basePercentage * baseWeight;

    // Ne logger que si le comité est sélectionné
    if (entry.isPicked) {
      console.log(`
      Comité ${entry.committee}:
      - Base %: ${basePercentage}%
      - Occurrences: ${
        occurrences.get(entry.committee) || 0
      } fois (weight: ${occurrenceWeight.toFixed(2)})
      - Compétitions depuis dernier tracé: ${competitionsSinceLastTrace.get(
        entry.committee
      )} (weight: ${competitionsWeight.toFixed(2)})
      - Nouveau %: ${newPercentage.toFixed(2)}%
    `);
    }

    return {
      ...entry,
      percentage: newPercentage,
      competitionsSinceLastTrace: competitionsSinceLastTrace.get(
        entry.committee
      ),
      occurrences: occurrences.get(entry.committee) || 0,
      weight: newPercentage,
      baseWeight,
    };
  });
};

export const generateCommitteeResults = (
  committeeCounts: Record<CommitteeCode, number>,
  comiteCode: CommitteeCode,
  history: SelectionHistory,
  competitionCode: string
): CommitteeResults => {
  const nonHomeCommittees = Object.entries(committeeCounts).filter(
    ([c, count]) => c && c !== comiteCode && count > 0
  );

  const totalNonHome = nonHomeCommittees.reduce(
    (sum, [, count]) => sum + count,
    0
  );

  // Calcul des probabilités pour manche 2 et 4
  const weightedProbabilities = nonHomeCommittees.map(([committee, count]) => ({
    committee: committee as CommitteeCode,
    // Pas d'arrondi : un petit comité (< 0,5 %) ne doit pas tomber à 0 et être exclu du tirage
    percentage: (count / totalNonHome) * 100 || 0,
    count,
  }));

  const homeCount = committeeCounts[comiteCode] || 0;

  const results = performRandomDraw(
    {
      manche1: [
        {
          committee: comiteCode,
          isHomeCommittee: true,
          count: homeCount,
          percentage: 100,
          isPicked: true,
        },
      ],
      manche2: weightedProbabilities,
      manche3: [
        {
          committee: comiteCode,
          isHomeCommittee: true,
          count: homeCount,
          percentage: 100,
          isPicked: true,
        },
      ],
      manche4: weightedProbabilities,
    },
    history
  );

  return {
    ...results,
    competitionCode,
  };
};

export const performRandomDraw = <
  T extends Pick<CommitteeResults, "manche1" | "manche2" | "manche3" | "manche4">
>(
  results: T,
  history: SelectionHistory
): T => {
  const pickFromWeightedList = (
    choices: CommitteeEntry[],
    excludeCommittee?: CommitteeCode
  ) => {
    const weightedChoices = calculateHistoricalWeights(
      choices,
      history,
      excludeCommittee
    );
    const totalPercentage = weightedChoices.reduce(
      (sum, { percentage }) => sum + percentage,
      0
    );

    // Aucun poids exploitable (ex: seul comité restant exclu, poids tous à 0) :
    // on retombe sur un tirage uniforme parmi les comités non exclus,
    // puis parmi tous si nécessaire.
    if (!(totalPercentage > 0)) {
      let pool = weightedChoices
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => c.committee !== excludeCommittee);
      if (pool.length === 0) {
        pool = weightedChoices.map((c, i) => ({ c, i }));
      }
      if (pool.length === 0) {
        return { selectedIndex: -1, weightedChoices };
      }
      const selectedIndex = pool[Math.floor(Math.random() * pool.length)].i;
      const share = 100 / pool.length;
      return {
        selectedIndex,
        weightedChoices: weightedChoices.map((c) => ({
          ...c,
          percentage: pool.some((p) => p.c === c) ? share : 0,
        })),
      };
    }

    const normalizedChoices = weightedChoices.map((choice) => ({
      ...choice,
      percentage: (choice.percentage / totalPercentage) * 100,
    }));

    let random = Math.random() * 100;
    let selectedIndex = normalizedChoices.findIndex(({ percentage }) => {
      random -= percentage;
      return random < 0;
    });

    // Garde-fou contre les erreurs d'arrondi flottant : dernier choix à poids > 0
    if (selectedIndex === -1) {
      for (let i = normalizedChoices.length - 1; i >= 0; i--) {
        if (normalizedChoices[i].percentage > 0) {
          selectedIndex = i;
          break;
        }
      }
    }

    return { selectedIndex, weightedChoices: normalizedChoices };
  };

  // Tire d'abord pour la manche 2
  const { selectedIndex: manche2Index, weightedChoices: manche2Weighted } =
    pickFromWeightedList(results.manche2);
  const manche2Committee = results.manche2[manche2Index]?.committee;

  // Tire pour la manche 4 en excluant le comité de la manche 2
  const { selectedIndex: manche4Index, weightedChoices: manche4Weighted } =
    pickFromWeightedList(results.manche4, manche2Committee);

  return {
    ...results,
    manche2: results.manche2.map((entry, index) => {
      const weightedEntry = manche2Weighted[index];
      return {
        ...entry,
        ...weightedEntry,
        isPicked: index === manche2Index,
      };
    }),
    manche4: results.manche4.map((entry, index) => {
      const weightedEntry = manche4Weighted[index];
      return {
        ...entry,
        ...weightedEntry,
        isPicked: index === manche4Index,
      };
    }),
  };
};
