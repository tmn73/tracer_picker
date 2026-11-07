import type { CommitteeCode } from "../constants";

interface CommitteeEntry {
  committee: CommitteeCode;
  percentage: number;
  count: number;
  isHomeCommittee?: boolean;
  isPicked?: boolean;
  isHandpicked?: boolean;
}

interface CommitteeResults {
  manche1: CommitteeEntry[];
  manche2: CommitteeEntry[];
  manche3: CommitteeEntry[];
  manche4: CommitteeEntry[];
}

interface CompetitionMetadata {
  date: string;
  discipline: string;
  location: string; // nom de la course
  station?: string; // lieu de la course
  homeCommittee: CommitteeCode;
}

export const generateHtml = (
  results: CommitteeResults,
  competitionMetadata: CompetitionMetadata
) => {
  // Determine header color based on discipline
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
        return "blue"; // Default color
    }
  })();

  // Get all committees with their stats for each round
  const getRoundStats = (manche: CommitteeEntry[]) => {
    const selected = manche.filter((r) => r.isPicked);
    const notSelected = manche.filter((r) => !r.isPicked);
    return { selected, notSelected };
  };

  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Résultats Traceurs</title>
        <link rel="stylesheet" href="style.css">
        <style>
          .header {
            background-color: ${headerColor};
          }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🎿 Attribution des Manches</h1>
            <div class="competition-info">
                <p>${[
                  competitionMetadata.discipline,
                  competitionMetadata.date,
                  competitionMetadata.station,
                  competitionMetadata.location,
                ]
                  .filter(Boolean)
                  .join(" - ")}</p>
            </div>
            <p>Généré le ${new Date().toLocaleString("fr-FR")}</p>
        </div>

        <div class="manches-grid">
            ${[
      results.manche1,
      results.manche2,
      results.manche3,
      results.manche4,
    ]
      .map((manche, index) => {
        const { selected, notSelected } = getRoundStats(manche);
        return `
                <div class="manche-column">
                    <h2>Manche ${index + 1} </h2>
                    <div class="selected-committees">
                        ${selected
            .map(
              (r) => `
                            <div class="committee-card">
                                <div class="committee-name">${r.committee}</div>
                                <div class="stats">
                                    <span>${r.count} coureurs</span>
                                    <span>${r.percentage.toFixed(0)}%</span>
                                </div>
                            </div>
                        `
            )
            .join("")}
                    </div>

                    <button class="toggle-button" onclick="toggleNotSelected(${index})">
                        Voir les comités non sélectionnés
                    </button>

                    <div id="not-selected-${index}" class="not-selected-committees hidden">
                        <h3>Comités non sélectionnés</h3>
                        ${notSelected
            .sort((a, b) => b.percentage - a.percentage)
            .map(
              (r) => `
                            <div class="committee-card not-selected">
                                <div class="committee-name">${r.committee}</div>
                                <div class="stats">
                                    <span>${r.count} coureurs
                                    </span>
                                    <span>${r.percentage.toFixed(0)}%</span>
                                </div>
                            </div>
                        `
            )
            .join("")}
                    </div>
                </div>
                `;
      })
      .join("")}
        </div>

        <div class="timestamp">
            <p>Martin Construction - ${new Date().getFullYear()}</p>
        </div>

        <script>
            function toggleNotSelected(mancheIndex) {
                const element = document.getElementById('not-selected-' + mancheIndex);
                const button = element.previousElementSibling;
                if (element.classList.contains('hidden')) {
                    element.classList.remove('hidden');
                    button.textContent = 'Masquer les comités non sélectionnés';
                } else {
                    element.classList.add('hidden');
                    button.textContent = 'Voir les comités non sélectionnés';
                }
            }
        </script>
    </body>
    </html>
  `;
};
