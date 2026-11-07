import { isCancel, select } from "@clack/prompts";
import type { CommitteeEntry, CommitteeResults } from "./algoSelection";
import { COMMITTEE_CODES, type CommitteeCode } from "./constants";
import { displayResults, pct } from "./selectComittees";

export type MancheKey = "manche1" | "manche2" | "manche3" | "manche4";

// M1 et M3 : comité organisateur d'office ; M2 et M4 : tirage au sort
const isFixedManche = (manche: MancheKey) =>
  manche === "manche1" || manche === "manche3";

// Cherche les infos d'un comité : d'abord dans la manche concernée, puis dans les listes tirées
// (qui connaissent tous les comités candidats avec leurs effectifs et leurs poids), puis M1/M3.
const findCommittee = (
  results: CommitteeResults,
  committee: CommitteeCode,
  preferred: MancheKey
): CommitteeEntry | undefined => {
  const order: MancheKey[] = [preferred, "manche2", "manche4", "manche1", "manche3"];
  for (const key of order) {
    const entry = results[key].find((c) => c.committee === committee);
    if (entry) return entry;
  }
  return undefined;
};

export type CommitteeOption = { value: CommitteeCode; label: string };

// Liste proposée pour un choix manuel : effectif et chance de sortir de chaque comité.
export const buildCommitteeOptions = (
  results: CommitteeResults,
  manche: MancheKey
): CommitteeOption[] => {
  // Pour M1/M3 (pas de tirage), on s'appuie sur la liste de M2 : mêmes comités, mêmes poids
  const reference = results[isFixedManche(manche) ? "manche2" : manche];
  const current = results[manche].find((c) => c.isPicked)?.committee;
  const organizer = results.manche1.find((c) => c.isHomeCommittee)?.committee;

  // Comités connus + ceux du tirage (certains, comme PO, ne sont pas dans COMMITTEE_CODES)
  const codes = Array.from(
    new Set<CommitteeCode>([
      ...(Object.keys(COMMITTEE_CODES) as CommitteeCode[]),
      ...(["manche1", "manche2", "manche3", "manche4"] as MancheKey[]).flatMap((k) =>
        results[k].map((c) => c.committee)
      ),
    ])
  );

  const rows = codes.map((code) => {
    const entry = reference.find((c) => c.committee === code);
    const known = findCommittee(results, code, manche);
    const count = known?.count ?? 0;
    const coureurs = `${count} coureur${count > 1 ? "s" : ""}`;
    const excluded =
      !!entry && entry.weight === undefined && !entry.isPicked && !entry.isHandpicked;
    const chance = entry && !excluded ? entry.percentage : undefined;
    return { code, count, coureurs, chance, excluded, isOrganizer: code === organizer };
  });

  // Les plus probables d'abord, puis l'organisateur, puis les comités hors tirage
  const rank = (r: (typeof rows)[number]) =>
    r.chance !== undefined ? 0 : r.isOrganizer ? 1 : r.excluded ? 2 : 3;
  rows.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (b.chance ?? 0) - (a.chance ?? 0) ||
      b.count - a.count ||
      a.code.localeCompare(b.code)
  );

  return rows.map((r) => {
    const info = r.isOrganizer
      ? `${r.coureurs} · organisateur`
      : r.excluded
        ? `${r.coureurs} · exclu de cette manche (déjà tiré en M2)`
        : r.chance !== undefined
          ? `${r.coureurs} · ${pct(r.chance)} % de chances`
          : "hors tirage";
    return {
      value: r.code,
      label: `${r.code.padEnd(5)} ${info}${r.code === current ? "  ◀ actuel" : ""}`,
    };
  });
};

// Applique un choix manuel : le comité choisi passe en tête de la manche, marqué « choix manuel ».
// Il garde ses effectifs et ses facteurs de calcul pour que les tableaux restent lisibles.
export const applyManualPick = (
  results: CommitteeResults,
  manche: MancheKey,
  committee: CommitteeCode
): CommitteeResults => {
  const known = findCommittee(results, committee, manche);
  const picked: CommitteeEntry = {
    ...(known ?? { committee, count: 0, percentage: 0 }),
    committee,
    isPicked: true,
    isHandpicked: true,
  };

  return {
    ...results,
    [manche]: [
      picked,
      ...results[manche]
        .filter((c) => c.committee !== committee)
        .map((c) => ({ ...c, isPicked: false })),
    ],
  };
};

export const updateManche = async (results: CommitteeResults) => {
  const mancheToChange = await select({
    message: "Quel manche doit être changée ?",
    options: [
      { value: "manche1", label: "M1" },
      { value: "manche2", label: "M2" },
      { value: "manche3", label: "M3" },
      { value: "manche4", label: "M4" },
    ],
  });
  if (isCancel(mancheToChange)) return { updatedResults: results };

  const newCommitteeCode = await select({
    message: "Quel comité doit être choisi ?",
    options: buildCommitteeOptions(results, mancheToChange as MancheKey),
    maxItems: 15,
  });
  if (isCancel(newCommitteeCode)) return { updatedResults: results };

  const updatedResults = applyManualPick(
    results,
    mancheToChange as MancheKey,
    newCommitteeCode as CommitteeCode
  );

  displayResults(updatedResults);

  return { updatedResults };
};
