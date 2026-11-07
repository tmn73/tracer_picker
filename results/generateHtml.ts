import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { CommitteeCode } from "../constants";
import type { CommitteeResults } from "../algoSelection";
import { buildDrawRows, type DrawRow } from "../selectComittees";

// La feuille de style est intégrée à la page : un seul fichier, facile à envoyer sur un téléphone
const BASE_CSS = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "style.css"),
  "utf-8"
);

interface CompetitionMetadata {
  date: string;
  discipline: string;
  location: string; // nom de la course
  station?: string; // lieu de la course
  homeCommittee: CommitteeCode;
}

const esc = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

const pct = (n: number) =>
  (n >= 10 ? n.toFixed(0) : n.toFixed(1)).replace(".", ",") + " %";

const pickedOf = (rows: DrawRow[]) =>
  rows.find((r) => r.status === "tire" || r.status === "manuel");

// Une manche tirée au sort : comité organisateur (d'office) ou tirage ?
const isHomeManche = (manche: CommitteeResults["manche1"]) =>
  manche.length > 0 && manche.every((e) => e.isHomeCommittee);

export const generateHtml = (
  results: CommitteeResults,
  competitionMetadata: CompetitionMetadata
) => {
  const headerColor = (() => {
    switch (competitionMetadata.discipline) {
      case "GS":
        return "#f06eec";
      case "SL":
        return "#6e9cf0";
      case "SG":
        return "#35f138";
      case "DH":
        return "yellow";
      default:
        return "blue";
    }
  })();

  const manches = [
    results.manche1,
    results.manche2,
    results.manche3,
    results.manche4,
  ];

  const drawn = manches.map((m) => (isHomeManche(m) ? null : buildDrawRows(m)));

  // --- Récapitulatif : le traceur de chaque manche et la raison en une ligne ---
  const summaryTiles = manches
    .map((manche, i) => {
      const rows = drawn[i];
      let committee: string;
      let reason: string;
      let tileClass = "tile";

      if (!rows) {
        committee = manche[0]?.committee ?? "–";
        reason = "Comité organisateur (d'office)";
        tileClass += " tile-home";
      } else {
        const picked = pickedOf(rows);
        committee = picked?.committee ?? "–";
        const candidates = rows.filter((r) => r.status !== "exclu").length;
        reason = !picked
          ? "Aucun comité disponible"
          : picked.status === "manuel"
            ? "Choix manuel"
            : `Tirage au sort · ${pct(picked.chance)} de chances (n°${picked.rank} sur ${candidates})`;
      }

      return `
        <div class="${tileClass}">
          <span class="tile-label">Manche ${i + 1}</span>
          <span class="tile-committee">${esc(committee)}</span>
          <span class="tile-reason">${esc(reason)}</span>
        </div>`;
    })
    .join("");

  // --- Une colonne par manche ---
  const columns = manches
    .map((manche, i) => {
      const rows = drawn[i];

      // Manches 1 et 3 : pas de tirage
      if (!rows) {
        const home = manche[0];
        return `
        <div class="manche-column">
          <h2>Manche ${i + 1}</h2>
          <div class="home-card">
            <div class="home-name">${esc(home.committee)}</div>
            <div class="home-meta">${plural(home.count, "coureur")}</div>
            <p class="home-why">Comité organisateur : trace d'office, sans tirage au sort.</p>
          </div>
        </div>`;
      }

      const picked = pickedOf(rows);
      const candidates = rows.filter((r) => r.status !== "exclu").length;
      const maxChance = Math.max(...rows.map((r) => r.chance), 1);

      const items = rows
        .map((r) => {
          const state =
            r.status === "tire" || r.status === "manuel"
              ? " picked"
              : r.status === "exclu"
                ? " excluded"
                : "";
          const badge =
            r.status === "tire"
              ? '<span class="badge">✔ Tiré</span>'
              : r.status === "manuel"
                ? '<span class="badge">✔ Choix manuel</span>'
                : r.status === "exclu"
                  ? '<span class="badge badge-muted">Exclu</span>'
                  : "";
          const bar =
            r.status === "exclu"
              ? ""
              : `<div class="bar"><i style="width:${Math.max(
                  (r.chance / maxChance) * 100,
                  2
                ).toFixed(1)}%"></i></div>`;
          return `
          <li class="rank-item${state}">
            <span class="rank">${r.rank ?? "–"}</span>
            <span class="name">${esc(r.committee)}</span>
            <span class="count">${plural(r.count, "coureur")}</span>
            <span class="pct">${r.status === "exclu" ? "–" : pct(r.chance)}</span>
            ${bar}
            ${badge}
          </li>`;
        })
        .join("");

      // Pourquoi ce comité ?
      let why = "";
      if (picked && picked.status === "tire") {
        const verdict =
          picked.rank === 1
            ? "C'était le favori du tirage."
            : `Il n'était que n°${picked.rank} sur ${candidates} : le tirage au sort peut désigner un comité moins favori, c'est le principe.`;
        const occurrences = picked.occurrences ?? 0;
        const wait = picked.wait ?? 0;
        const detail = `${
          occurrences === 0
            ? "N'a encore jamais tracé"
            : `A déjà tracé ${occurrences} fois`
        } · ${wait === 0 ? "a tracé à la dernière course" : `${plural(wait, "course")} sans tracer`}.`;
        why = `<p class="why"><strong>Pourquoi ${esc(picked.committee)} ?</strong> ${verdict}<span class="detail">${detail}</span></p>`;
      } else if (picked && picked.status === "manuel") {
        why = `<p class="why"><strong>${esc(picked.committee)}</strong> a été choisi manuellement.</p>`;
      }

      const excluded = rows.find((r) => r.status === "exclu");
      const note = excluded
        ? `<p class="note">${esc(excluded.committee)} est exclu de cette manche : il a déjà été tiré en manche 2.</p>`
        : "";

      return `
        <div class="manche-column">
          <h2>Manche ${i + 1}</h2>
          <details class="ranking-box" open>
            <summary>Classement · chance de sortir au tirage</summary>
            <ul class="ranking">${items}
            </ul>
          </details>
          ${why}
          ${note}
        </div>`;
    })
    .join("");

  // --- Comment ça marche ---
  const e = results.effectifs;
  const list = (counts: Partial<Record<string, number>>) =>
    Object.entries(counts)
      .map(([c, n]) => `${c} ${n}`)
      .join(", ") || "aucun";
  const effectifs = e
    ? `<p><strong>Base de calcul de cette compétition :</strong> ${plural(
        e.retenus,
        "coureur"
      )} retenus (hors organisateur ${esc(e.organisateur.committee)} et comités exclus : ${esc(
        list(e.exclus)
      )}), plus des comités ajoutés : ${esc(list(e.artificiels))}. Total : ${e.base}.</p>`
    : "";

  const location = [competitionMetadata.station, competitionMetadata.location]
    .filter(Boolean)
    .join(" - ");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Résultats Traceurs</title>
  <style>${BASE_CSS}</style>
  <style>.header { background-color: ${headerColor}; }</style>
</head>
<body>
  <div class="header">
    <h1>🎿 Attribution des Manches</h1>
    <div class="competition-info">
      <p>${esc(
        [competitionMetadata.discipline, competitionMetadata.date, location]
          .filter(Boolean)
          .join(" - ")
      )}</p>
    </div>
    <p class="generated">Généré le ${new Date().toLocaleString("fr-FR")}</p>
  </div>

  <section class="summary">
    <h2>Les traceurs</h2>
    <div class="summary-grid">${summaryTiles}
    </div>
  </section>

  <div class="manches-grid">${columns}
  </div>

  <details class="howto">
    <summary>Comment ça marche ?</summary>
    <p>Manches 1 et 3 : le comité organisateur trace d'office. Manches 2 et 4 : tirage au sort entre les autres comités.</p>
    <p>Le pourcentage est la <strong>chance de sortir</strong> au tirage. Il dépend du nombre de coureurs du comité, de ses traçages passés (moins il a tracé, plus il pèse) et du temps écoulé depuis son dernier traçage. Un comité à faible pourcentage peut donc sortir : c'est le principe d'un tirage.</p>
    <p>Le comité tiré en manche 2 ne peut pas l'être en manche 4.</p>
    ${effectifs}
  </details>

  <div class="timestamp">
    <p>Martin Construction - ${new Date().getFullYear()}</p>
  </div>

  <script>
    // Sur téléphone, les classements démarrent repliés pour ne pas allonger la page
    if (window.innerWidth < 768) {
      document.querySelectorAll('details.ranking-box').forEach(function (d) { d.open = false; });
    }
  </script>
</body>
</html>
`;
};
