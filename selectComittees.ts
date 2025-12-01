import type { Page } from "puppeteer";
import {
  generateCommitteeResults,
  type CommitteeResults,
  type CommitteeEntry,
} from "./algoSelection";
import type { CommitteeCode } from "./constants";
import { EXTRA_COMMITTEES_COUNT, ALGO_WEIGHT_KNOBS, FILTERED_OUT_COMMITTEES } from "./constants";
import fs from "fs";
import path from "path";

export const countCompetitorsByCommittee = (committees: CommitteeCode[]) => {
  return committees.reduce((acc, committee) => {
    acc[committee] = (acc[committee] || 0) + 1;
    return acc;
  }, {} as Record<CommitteeCode, number>);
};

export const formatResultsForDisplay = (results: CommitteeResults) => {
  const allCommittees = new Set<CommitteeCode>();
  // Ne prendre que les propriétés qui sont des arrays
  (["manche1", "manche2", "manche3", "manche4"] as const).forEach((manche) =>
    results[manche].forEach((c) => allCommittees.add(c.committee))
  );

  const okSymbol = "OK";
  const emptySymbol = ".";

  return Array.from(allCommittees).map((committee) => {
    const entry = results.manche2.find((c) => c.committee === committee);

    return {
      Comité: committee,
      M1: results.manche1.find((c) => c.committee === committee)?.isPicked
        ? okSymbol
        : emptySymbol,
      M2: results.manche2.find((c) => c.committee === committee)?.isPicked
        ? okSymbol
        : emptySymbol,
      M3: results.manche3.find((c) => c.committee === committee)?.isPicked
        ? okSymbol
        : emptySymbol,
      M4: results.manche4.find((c) => c.committee === committee)?.isPicked
        ? okSymbol
        : emptySymbol,
      Nb: entry?.count || 0,
      "Courses depuis": entry?.competitionsSinceLastTrace || 0,
      Occurences: entry?.occurrences || 0,
      "%": entry?.percentage?.toFixed(1) || 0,
    };
  });
};

export const displayResults = (results: CommitteeResults) => {
  const formatMancheDetails = (manche: CommitteeEntry[], mancheNum: number) => {
    const selected = manche.find((c) => c.isPicked);
    if (!selected) return "";

    const totalCompetitors = manche.reduce((sum, c) => sum + c.count, 0);
    const basePercentage = (selected.count / totalCompetitors) * 100;
    const occurrenceWeight =
      1 / ((selected.occurrences || 1) * ALGO_WEIGHT_KNOBS.OCCURRENCE_DIVIDER);
    const competitionsWeight =
      Math.max(
        ALGO_WEIGHT_KNOBS.COMPETITIONS_SINCE_LAST_TRACE_MIN,
        selected.competitionsSinceLastTrace || 0
      ) ** ALGO_WEIGHT_KNOBS.COMPETITIONS_SINCE_LAST_TRACE_POWER;

    // Construction de l'explication en langage naturel
    const explanation = (() => {
      const occurrencesText =
        selected.occurrences === 0
          ? "n'a pas encore tracé cette saison"
          : `a tracé ${selected.occurrences} fois cette saison`;

      const coursesDepuisText =
        selected.competitionsSinceLastTrace === 0
          ? "vient de tracer à la dernière course"
          : selected.competitionsSinceLastTrace === 1
            ? "n'a pas tracé depuis 1 course"
            : `n'a pas tracé depuis ${selected.competitionsSinceLastTrace} courses`;

      const competitorsText = `représente ${basePercentage.toFixed(
        1
      )}% des coureurs (${selected.count}/${totalCompetitors})`;

      // Texte pour les occurrences
      const occurrenceImpactText =
        selected.occurrences === 0
          ? "n'est pas impacté par les occurrences car il n'a pas encore tracé"
          : occurrenceWeight < 1
            ? `est pénalisé par ses ${selected.occurrences} traçages cette saison`
            : "n'est pas pénalisé par ses occurrences";

      // Texte pour le temps d'attente
      const waitingImpactText =
        competitionsWeight <= 1
          ? "ne reçoit pas de bonus d'attente car il a tracé récemment"
          : `reçoit un bonus car il attend depuis ${selected.competitionsSinceLastTrace} courses`;

      return `Le comité ${selected.committee
        } ${competitorsText}. Il ${occurrencesText} et ${coursesDepuisText}.
      Son score initial de ${basePercentage.toFixed(
          1
        )}% ${occurrenceImpactText} (×${occurrenceWeight.toFixed(3)})
      et ${waitingImpactText} (×${competitionsWeight.toFixed(3)}),
      donnant un score final de ${selected.percentage?.toFixed(3)}%.`;
    })();

    return `
    ${explanation}

    Détails du calcul:
    • Nombre de coureurs: ${selected.count}
    • Nombre d'occurrences: ${selected.occurrences || 0}
    • Courses depuis dernier traçage: ${selected.competitionsSinceLastTrace || 0
      }
    • Calcul détaillé:
      - % base (coureurs): ${selected.count
      }/${totalCompetitors} = ${basePercentage.toFixed(2)}%
      - Poids occurrences: 1 / (${selected.occurrences || 1} × ${ALGO_WEIGHT_KNOBS.OCCURRENCE_DIVIDER
      }) = ${occurrenceWeight.toFixed(3)}
      - Poids courses: max(${ALGO_WEIGHT_KNOBS.COMPETITIONS_SINCE_LAST_TRACE_MIN
      }, ${selected.competitionsSinceLastTrace || 0})^${ALGO_WEIGHT_KNOBS.COMPETITIONS_SINCE_LAST_TRACE_POWER
      } = ${competitionsWeight.toFixed(3)}
      - % final: ${basePercentage.toFixed(2)}% × ${occurrenceWeight.toFixed(
        3
      )} × ${competitionsWeight.toFixed(3)} = ${selected.percentage?.toFixed(
        3
      )}%`;
  };

  // Afficher les infos de la compétition
  console.log(`
Résultats pour la compétition:
- Code: ${results.competitionCode}
- Date: ${results.date || "Non spécifiée"}
- Lieu: ${results.location || "Non spécifié"}
- Discipline: ${results.discipline || "Non spécifiée"}
- Comité organisateur: ${results.manche1[0].committee}

Comités sélectionnés:
- Manche 1: ${results.manche1[0].committee} (comité organisateur)
- Manche 2: ${results.manche2.find((c) => c.isPicked)?.committee
    }${formatMancheDetails(results.manche2, 2)}
- Manche 3: ${results.manche3[0].committee} (comité organisateur)
- Manche 4: ${results.manche4.find((c) => c.isPicked)?.committee
    }${formatMancheDetails(results.manche4, 4)}
`);
  console.table(formatResultsForDisplay(results));
};

export const selectCommittees = async (
  page: Page,
  comiteCode: CommitteeCode,
  competitionCode: string
) => {
  const pageInfo = await page.evaluate(() => {
    const allH2 = Array.from(document.querySelectorAll("h2")).map(el => el.textContent?.trim());
    const allH4 = Array.from(document.querySelectorAll("h4")).map(el => el.textContent?.trim());
    return { titre: allH2[0] || "", sousTitre: allH4[0] || "" };
  });

  const titre = pageInfo.titre;
  const sousTitre = pageInfo.sousTitre;

  // Extraire la date: "du 29/11/2025"
  const dateMatch = titre.match(/du\s+(\d{2}\/\d{2}\/\d{4})/);
  const date = dateMatch ? dateMatch[1] : "";

  // Extraire la discipline: "(-SL)" -> "SL"
  const disciplineMatch = titre.match(/\(-?([A-Z]+)\)/);
  const discipline = disciplineMatch ? disciplineMatch[1] : "";

  // Le lieu est dans le h4
  const location = sousTitre;

  const metadata = { discipline, date, location };

  const committeesData = (await page.evaluate(() => {
    // Colonne 8 = CS (comité) dans les lignes du tbody
    // Structure: delete(1), code(2), nom(3), prénom(4), sexe(5), année(6), club(7), CS(8)
    const rows = document.querySelectorAll("table tbody tr[data-code_coureur]");
    return Array.from(rows)
      .map((row) => {
        const cells = row.querySelectorAll("td");
        return cells[7]?.textContent?.trim() || "";
      })
      .filter((code) => code !== "");
  })) as CommitteeCode[];

  const committeeCounts = countCompetitorsByCommittee(committeesData);

  // Filtre les comités qui ne traceront jamais
  const filteredCommitteeCounts = Object.fromEntries(
    Object.entries(committeeCounts).filter(
      ([committee]) => !FILTERED_OUT_COMMITTEES.includes(committee as CommitteeCode)
    )
  ) as Record<CommitteeCode, number>;

  // Ajout des comités artificiels
  Object.entries(EXTRA_COMMITTEES_COUNT).forEach(([committee, count]) => {
    filteredCommitteeCounts[committee as CommitteeCode] =
      (filteredCommitteeCounts[committee as CommitteeCode] || 0) + count;
  });

  const historyFileContent = fs.readFileSync(
    path.join(__dirname, "results", "results_history.json"),
    "utf8"
  );
  const historyData = historyFileContent.trim() ? JSON.parse(historyFileContent) : [];

  const results = generateCommitteeResults(
    filteredCommitteeCounts,
    comiteCode,
    historyData,
    competitionCode
  );
  return {
    ...results,
    ...metadata,
    competitionCode,
  };
};
