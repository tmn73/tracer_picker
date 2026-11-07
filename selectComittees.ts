import type { Page } from "puppeteer";
import {
  generateCommitteeResults,
  type CommitteeResults,
  type CommitteeEntry,
} from "./algoSelection";
import type { CommitteeCode } from "./constants";
import { computeOccurrenceWeight, computeWaitWeight } from "./algoSelection";
import { EXTRA_COMMITTEES_COUNT, ALGO_WEIGHT_KNOBS, FILTERED_OUT_COMMITTEES } from "./constants";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// __dirname n'existe pas en ESM sous Node (Bun le fournit) : on le recalcule
const PROJECT_DIR = path.dirname(fileURLToPath(import.meta.url));

export const countCompetitorsByCommittee = (committees: CommitteeCode[]) => {
  return committees.reduce((acc, committee) => {
    acc[committee] = (acc[committee] || 0) + 1;
    return acc;
  }, {} as Record<CommitteeCode, number>);
};

const pct = (n: number, decimals = 1) => n.toFixed(decimals).replace(".", ",");

export type DrawRow = {
  committee: CommitteeCode;
  count: number;
  share: number; // part des coureurs parmi les comités candidats, en %
  occurrences?: number;
  wait?: number; // courses écoulées depuis le dernier traçage
  occWeight?: number;
  waitWeight?: number;
  weight?: number; // part × ×traçages × ×attente
  chance: number; // probabilité normalisée, en %
  status: "tire" | "manuel" | "exclu" | "";
  rank?: number;
};

// Transforme une manche tirée en lignes lisibles : tous les facteurs du calcul, triés par chance.
export const buildDrawRows = (manche: CommitteeEntry[]): DrawRow[] => {
  const total = manche.reduce((sum, c) => sum + c.count, 0);
  const rows: DrawRow[] = manche.map((e) => {
    const hasWeights = e.weight !== undefined;
    const excluded = !e.isPicked && !e.isHandpicked && !hasWeights;
    return {
      committee: e.committee,
      count: e.count,
      share: total ? (e.count / total) * 100 : 0,
      occurrences: e.occurrences,
      wait: e.competitionsSinceLastTrace,
      occWeight: hasWeights
        ? computeOccurrenceWeight(e.occurrences ?? 0)
        : undefined,
      waitWeight: hasWeights
        ? computeWaitWeight(e.competitionsSinceLastTrace ?? 0)
        : undefined,
      weight: e.weight,
      chance: e.percentage,
      status: e.isHandpicked
        ? "manuel"
        : e.isPicked
          ? "tire"
          : excluded
            ? "exclu"
            : "",
    };
  });

  // Exclus en dernier, puis par chance décroissante
  rows.sort(
    (a, b) =>
      Number(a.status === "exclu") - Number(b.status === "exclu") ||
      b.chance - a.chance
  );
  let rank = 0;
  rows.forEach((r) => {
    if (r.status !== "exclu") r.rank = ++rank;
  });
  return rows;
};

export const drawRowsForTable = (rows: DrawRow[], excludedLabel: string) =>
  rows.map((r) => ({
    "#": r.rank ?? "–",
    Comité: r.committee,
    Coureurs: r.count,
    "Part %": pct(r.share),
    "Déjà tracé": r.occurrences ?? "–",
    "Courses sans tracer": r.wait ?? "–",
    "× traçages": r.occWeight !== undefined ? pct(r.occWeight, 2) : "–",
    "× attente": r.waitWeight !== undefined ? pct(r.waitWeight, 2) : "–",
    Poids: r.weight !== undefined ? pct(r.weight) : "–",
    "Chance %": r.status === "exclu" ? "0" : pct(r.chance),
    Résultat:
      r.status === "tire"
        ? "◀ TIRÉ"
        : r.status === "manuel"
          ? "◀ CHOIX MANUEL"
          : r.status === "exclu"
            ? excludedLabel
            : "",
  }));

// Phrase qui explique pourquoi ce comité a été désigné pour la manche.
export const explainPick = (rows: DrawRow[], manche: string): string => {
  const picked = rows.find((r) => r.status === "tire" || r.status === "manuel");
  if (!picked) return `${manche} : aucun comité disponible.`;
  if (picked.status === "manuel") {
    return `${manche} : ${picked.committee} a été choisi manuellement.`;
  }

  const candidates = rows.filter((r) => r.status !== "exclu").length;
  const occurrences = picked.occurrences ?? 0;
  const wait = picked.wait ?? 0;

  const occurrencesText =
    occurrences === 0
      ? `n'a encore jamais tracé (×${pct(picked.occWeight ?? 1, 2)})`
      : `a déjà tracé ${occurrences} fois (×${pct(picked.occWeight ?? 1, 2)})`;
  const waitText =
    wait === 0
      ? occurrences === 0
        ? "n'a pas d'historique pour l'instant"
        : "a tracé à la dernière course (pas de bonus d'attente)"
      : `n'a pas tracé depuis ${wait} course${wait > 1 ? "s" : ""} (×${pct(
          picked.waitWeight ?? 1,
          2
        )})`;
  const verdict =
    picked.rank === 1
      ? "C'était le favori du tirage."
      : `Il n'était que n°${picked.rank} sur ${candidates} : c'est le tirage au sort qui l'a désigné.`;

  return `${manche} : ${picked.committee} représente ${pct(
    picked.share
  )} % des coureurs, ${occurrencesText} et ${waitText}. Poids ${pct(
    picked.weight ?? 0
  )} → ${pct(picked.chance)} % de chances. ${verdict}`;
};

const effectifLine = (label: string, value: string) =>
  `  ${label.padEnd(34, ".")} ${value}`;

const listCounts = (counts: Partial<Record<string, number>>) =>
  Object.entries(counts)
    .map(([committee, count]) => `${committee} ${count}`)
    .join(", ") || "aucun";

// Tableau texte aligné, sans apostrophes ni colonne d'index (console.table varie selon Node/Bun)
export const formatTable = (rows: Record<string, string | number>[]): string => {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => String(v ?? "");
  const widths = cols.map((c) =>
    Math.max(c.length, ...rows.map((r) => cell(r[c]).length))
  );
  const isNumeric = (v: string) => v !== "" && /^[–\d,.\s%×-]+$/.test(v);
  const line = (left: string, mid: string, right: string) =>
    left + widths.map((w) => "─".repeat(w + 2)).join(mid) + right;
  const fmt = (values: string[], align: boolean) =>
    "│" +
    values
      .map((v, i) =>
        " " + (align && isNumeric(v) ? v.padStart(widths[i]) : v.padEnd(widths[i])) + " "
      )
      .join("│") +
    "│";
  return [
    line("┌", "┬", "┐"),
    fmt(cols, false),
    line("├", "┼", "┤"),
    ...rows.map((r) => fmt(cols.map((c) => cell(r[c])), true)),
    line("└", "┴", "┘"),
  ].join("\n");
};

export const displayResults = (results: CommitteeResults) => {
  const organizer = results.effectifs?.organisateur.committee ?? results.manche1[0].committee;
  // M1 et M3 : le comité organisateur d'office, sauf choix manuel
  const fixedPick = (manche: CommitteeEntry[]) =>
    manche.find((c) => c.isPicked) ?? manche[0];
  const fixedRow = (label: string, manche: CommitteeEntry[]) => {
    const pick = fixedPick(manche);
    return {
      Manche: label,
      Traceur: pick?.committee ?? "–",
      Pourquoi: pick?.isHandpicked ? "Choix manuel" : "Comité organisateur (d'office)",
    };
  };
  const rows2 = buildDrawRows(results.manche2);
  const rows4 = buildDrawRows(results.manche4);
  const picked2 = rows2.find((r) => r.status === "tire" || r.status === "manuel");
  const picked4 = rows4.find((r) => r.status === "tire" || r.status === "manuel");
  const excluded4 = rows4.find((r) => r.status === "exclu");

  console.log(`
═══ Compétition ${results.competitionCode} ═══
  Date : ${results.date || "Non spécifiée"}   Lieu : ${[results.station, results.location].filter(Boolean).join(" – ") || "Non spécifié"}   Discipline : ${results.discipline || "Non spécifiée"}
  Comité organisateur : ${organizer}`);

  const e = results.effectifs;
  if (e) {
    console.log(`
─── Effectifs pris en compte ───
${effectifLine("Inscrits sur la page", `${e.totalPage}${e.sansComite ? ` (dont ${e.sansComite} sans comité)` : ""}`)}
${effectifLine(`Organisateur ${e.organisateur.committee}`, `${e.organisateur.count} coureurs → trace M1 et M3 d'office, hors tirage`)}
${effectifLine("Comités exclus du tirage", listCounts(e.exclus))}
${effectifLine("Coureurs retenus", String(e.retenus))}
${effectifLine("+ comités ajoutés (constants.ts)", listCounts(e.artificiels))}
${effectifLine("= Base de calcul des %", String(e.base))}`);
  }

  const drawReason = (row: DrawRow | undefined, rows: DrawRow[]) =>
    !row
      ? "Aucun comité disponible"
      : row.status === "manuel"
        ? "Choix manuel"
        : `Tirage au sort · ${pct(row.chance)} % de chances (n°${row.rank} sur ${
            rows.filter((r) => r.status !== "exclu").length
          })`;

  console.log("\n─── Récapitulatif ───");
  console.log(formatTable([
    fixedRow("M1", results.manche1),
    { Manche: "M2", Traceur: picked2?.committee ?? "–", Pourquoi: drawReason(picked2, rows2) },
    fixedRow("M3", results.manche3),
    { Manche: "M4", Traceur: picked4?.committee ?? "–", Pourquoi: drawReason(picked4, rows4) },
  ]));

  console.log(`
Comment lire les tableaux :
  Poids    = Part % × (× traçages) × (× attente)
  × traçages : baisse quand le comité a déjà tracé cette saison (le plus bas = le plus de traçages)
  × attente  : monte avec le nombre de courses écoulées depuis son dernier traçage
  Chance % = poids du comité ÷ somme des poids de la manche`);

  console.log("\n─── Manche 2 : tirage au sort ───");
  console.log(formatTable(drawRowsForTable(rows2, "exclu")));
  console.log(explainPick(rows2, "M2"));

  console.log("\n─── Manche 4 : tirage au sort ───");
  if (excluded4) {
    console.log(`  ${excluded4.committee} est exclu de cette manche (déjà désigné en manche 2).`);
  }
  console.log(formatTable(drawRowsForTable(rows4, "exclu (déjà tiré en M2)")));
  console.log(explainPick(rows4, "M4") + "\n");
};

export const selectCommittees = async (
  page: Page,
  comiteCode: CommitteeCode,
  competitionCode: string
) => {
  const pageInfo = await page.evaluate(() => {
    // Pas de fonction nommée ici : ce code est exécuté dans le navigateur, et tsx
    // y ajouterait un appel __name() qui n'y existe pas.
    // Le titre ("Compétition n° ... du jj/mm/aaaa ... (...-SL)") était dans un h2,
    // il est dans un h3 sur le nouveau site : on cherche celui qui contient la date.
    const candidates = Array.from(document.querySelectorAll("h1, h2, h3")).map(
      (el) => (el.textContent || "").replace(/\s+/g, " ").trim()
    );
    const titre =
      candidates.find((t) => /du\s+\d{2}\/\d{2}\/\d{4}/.test(t)) ||
      candidates[0] ||
      "";
    const sousTitre = (
      document.querySelector("h4")?.textContent || ""
    )
      .replace(/\s+/g, " ")
      .trim();
    return { titre, sousTitre };
  });

  const titre = pageInfo.titre;
  const sousTitre = pageInfo.sousTitre;

  // Extraire la date: "du 29/11/2025"
  const dateMatch = titre.match(/du\s+(\d{2}\/\d{2}\/\d{4})/);
  const date = dateMatch ? dateMatch[1] : "";

  // La date sert à trier l'historique : sans elle on s'arrête plutôt que de le fausser
  if (!date) {
    throw new Error(
      `Impossible de lire la date de la compétition dans le titre : « ${titre} »`
    );
  }

  // Extraire la discipline : "(-SL)" ou "(CHAMROUSSE S-SL)" -> "SL"
  const disciplineMatch = titre.match(/-\s*([A-Z]+)\s*\)/);
  const discipline = disciplineMatch ? disciplineMatch[1] : "";

  // Le nom de la course est dans le h4
  const location = sousTitre;

  // La station est dans le titre : "... (CHAMROUSSE S-SL)" -> "Chamrousse"
  const stationMatch = titre.match(/\(([^()]*?)\s+[A-Z]-[A-Z]+\)/);
  const station = stationMatch
    ? stationMatch[1]
        .toLowerCase()
        .replace(/(^|[\s'-])([a-zà-ÿ])/g, (_, sep, letter) => sep + letter.toUpperCase())
    : "";

  const metadata = { discipline, date, location, station };

  const allCommitteeCells = (await page.evaluate(() => {
    // Colonne 8 = CS (comité) dans les lignes du tbody
    // Structure: delete(1), code(2), nom(3), prénom(4), sexe(5), année(6), club(7), CS(8)
    const rows = document.querySelectorAll("table tbody tr[data-code_coureur]");
    return Array.from(rows).map((row) => {
      const cells = row.querySelectorAll("td");
      return cells[7]?.textContent?.trim() || "";
    });
  })) as string[];

  // Inscrits sans code comité : ignorés pour le tirage mais comptés pour l'affichage
  const sansComite = allCommitteeCells.filter((code) => code === "").length;
  const committeesData = allCommitteeCells.filter(
    (code) => code !== ""
  ) as CommitteeCode[];

  const committeeCounts = countCompetitorsByCommittee(committeesData);

  // Filtre les comités qui ne traceront jamais
  const filteredCommitteeCounts = Object.fromEntries(
    Object.entries(committeeCounts).filter(
      ([committee]) => !FILTERED_OUT_COMMITTEES.includes(committee as CommitteeCode)
    )
  ) as Record<CommitteeCode, number>;

  // Détail des effectifs, pour expliquer la base de calcul à l'affichage
  const exclus: Partial<Record<string, number>> = {};
  Object.entries(committeeCounts).forEach(([committee, count]) => {
    if (FILTERED_OUT_COMMITTEES.includes(committee as CommitteeCode)) {
      exclus[committee] = count;
    }
  });
  const retenus = Object.entries(filteredCommitteeCounts)
    .filter(([committee]) => committee !== comiteCode)
    .reduce((sum, [, count]) => sum + count, 0);
  const artificiels: Partial<Record<string, number>> = Object.fromEntries(
    Object.entries(EXTRA_COMMITTEES_COUNT).filter(
      ([committee]) => committee !== comiteCode
    )
  );
  const effectifs = {
    organisateur: {
      committee: comiteCode,
      count: committeeCounts[comiteCode] || 0,
    },
    totalPage: allCommitteeCells.length,
    sansComite,
    exclus,
    retenus,
    artificiels,
    base:
      retenus +
      Object.values(artificiels).reduce<number>(
        (sum, count) => sum + (count || 0),
        0
      ),
  };

  // Ajout des comités artificiels
  Object.entries(EXTRA_COMMITTEES_COUNT).forEach(([committee, count]) => {
    filteredCommitteeCounts[committee as CommitteeCode] =
      (filteredCommitteeCounts[committee as CommitteeCode] || 0) + count;
  });

  const historyFileContent = fs.readFileSync(
    path.join(PROJECT_DIR, "results", "results_history.json"),
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
    effectifs,
  };
};
