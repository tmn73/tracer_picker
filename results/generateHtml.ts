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

// Manches 1 et 3 : jamais de tirage (comité organisateur d'office, ou choix manuel)
const isFixedManche = (index: number) => index === 0 || index === 2;

const fixedPick = (manche: CommitteeResults["manche1"]) =>
  manche.find((e) => e.isPicked) ?? manche[0];

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

  const drawn = manches.map((m, i) => (isFixedManche(i) ? null : buildDrawRows(m)));

  // --- Récapitulatif : le traceur de chaque manche et la raison en une ligne ---
  const summaryTiles = manches
    .map((manche, i) => {
      const rows = drawn[i];
      let committee: string;
      let reason: string;
      let tileClass = "tile";

      if (!rows) {
        const pick = fixedPick(manche);
        committee = pick?.committee ?? "–";
        reason = pick?.isHandpicked ? "Choix manuel" : "Comité organisateur (d'office)";
        tileClass += pick?.isHandpicked ? "" : " tile-home";
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
        const pick = fixedPick(manche);
        const manual = !!pick?.isHandpicked;
        return `
        <div class="manche-column">
          <h2>Manche ${i + 1}</h2>
          <div class="home-card${manual ? " manual" : ""}">
            <div class="home-name">${esc(pick?.committee ?? "–")}</div>
            <div class="home-meta">${plural(pick?.count ?? 0, "coureur")}</div>
            <p class="home-why">${
              manual
                ? "Choix manuel pour cette manche."
                : "Comité organisateur : trace d'office, sans tirage au sort."
            }</p>
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
        } · ${
          wait === 0
            ? occurrences === 0
              ? "pas d'historique pour l'instant"
              : "a tracé à la dernière course"
            : `${plural(wait, "course")} sans tracer`
        }.`;
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
            <summary>Classement · part de billets (chance de sortir)</summary>
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

  // Exemple concret tiré de ce tirage (manche 2)
  const example = (() => {
    const rows = drawn[1];
    const picked = rows && pickedOf(rows);
    const top = rows?.find((r) => r.status !== "exclu");
    if (!rows || !picked || !top || picked.status !== "tire") return "";
    const text =
      picked.committee === top.committee
        ? `<strong>Ici, en manche 2 :</strong> ${esc(top.committee)} avait le plus de billets (${pct(top.chance)}) et c'est lui qui est sorti.`
        : `<strong>Ici, en manche 2 :</strong> ${esc(top.committee)} avait le plus de billets (${pct(top.chance)}), mais le hasard a désigné ${esc(picked.committee)} (${pct(picked.chance)}). C'est normal : avec un tirage, le favori n'est jamais sûr de sortir.`;
    return `<p class="howto-example">${text}</p>`;
  })();

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
    <summary>Pourquoi des pourcentages si c'est un tirage au sort ?</summary>
    <p class="howto-lead"><strong>C'est une loterie avec des billets.</strong> Chaque comité reçoit des billets dans un sac, puis on en tire un au hasard. Le pourcentage est la <strong>part de billets</strong> du comité : plus il en a, plus il a de chances de sortir, mais rien n'est joué d'avance.</p>
    ${example}
    <h3>Pourquoi les comités n'ont pas tous le même nombre de billets ?</h3>
    <ul>
      <li><strong>Plus de coureurs</strong> : plus de billets.</li>
      <li><strong>Moins il a déjà tracé cette saison</strong> : plus de billets.</li>
      <li><strong>Plus il attend depuis son dernier traçage</strong> : plus de billets.</li>
    </ul>
    <p>Le but : sur une saison, chaque comité trace à peu près à son tour, sans que personne ne choisisse à la main.</p>
    <h3>Pourquoi ne pas simplement prendre celui qui a le plus de billets ?</h3>
    <p>Ce seraient toujours les mêmes en tête, et le résultat serait prévisible et discutable. Avec un tirage, chacun a sa chance et personne ne peut dire que c'est arrangé.</p>
    <h3>Les règles</h3>
    <ul>
      <li>Manches 1 et 3 : le comité organisateur trace d'office, sans tirage.</li>
      <li>Manches 2 et 4 : tirage au sort entre les autres comités.</li>
      <li>Le comité tiré en manche 2 ne peut pas l'être en manche 4.</li>
    </ul>
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
