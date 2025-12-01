import {
  intro,
  outro,
  text,
  log,
  isCancel,
  cancel,
  confirm,
} from "@clack/prompts";
import puppeteer from "puppeteer";
import { accessTheSite, login, accessTheCompetitionPage } from "./domHelpers";
import { displayResults, selectCommittees } from "./selectComittees";
import open from "open";
import { generateHtml } from "./results/generateHtml";
import fs from "fs";
import { updateManche } from "./updateManche";


// Add this type near the top of the file
type ResultsHistory = Record<
  string,
  {
    traceurs: {
      manche1?: string;
      manche2?: string;
      manche3?: string;
      manche4?: string;
    };
  }
>;

async function main() {
  if (!process.env.EMAIL) {
    throw new Error(
      "EMAIL n'est pas défini dans les variables d'environnement"
    );
  }

  if (!process.env.PASSWORD) {
    throw new Error(
      "PASSWORD n'est pas défini dans les variables d'environnement"
    );
  }

  intro(`Tracer picker v1 ⛷️`);
  // Get user inputs
  const competitionCode = (await text({
    message: "Quel est le code de la competition ?",
    placeholder: "0000",
    validate: (value) => {
      if (!value) return "Veuillez entrer un code";
      if (isNaN(Number(value)))
        return "Le code doit contenir uniquement des chiffres";
      if (value.length !== 4) return "Le code doit contenir 4 chiffres";
    },
  })) as string;

  if (isCancel(competitionCode)) {
    cancel("Opération annulée.");
    outro("Martin Construction vous remercie pour votre confiance.");
    process.exit(0);
  }

  const customOptions: any = {};

  if (process.env.USE_SLOMO) {
    customOptions.slowMo = 15;
  }

  // Launch browser
  const browser = await puppeteer.launch({
    headless: true,
    ...customOptions,
    defaultViewport: {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
    },
    args: ["--window-size=1920,1080"],
  });

  const page = await browser.newPage();

  try {
    await accessTheSite(page);
    await login(page, process.env.EMAIL, process.env.PASSWORD);
    const { committeeCode } = await accessTheCompetitionPage(
      page,
      competitionCode
    );

    const fullResults = await selectCommittees(
      page,
      committeeCode,
      competitionCode
    );
    const { discipline, date, location, ...results } = fullResults;
    displayResults(fullResults);

    let finalResults = results;
    let isResultOk = false;

    while (!isResultOk) {
      isResultOk = (await confirm({
        message: `Proposition validé ?`,
      })) as boolean;

      if (isResultOk) {
        // Create sanitized key
        const sanitizedLocation = location.toLowerCase().replace(/\s+/g, "_");
        const sanitizedDiscipline = discipline
          .toLowerCase()
          .replace(/\s+/g, "_");
        const historyKey = `${date}_${sanitizedLocation}_${sanitizedDiscipline}`;

        // Load existing history
        let history: ResultsHistory = {};
        try {
          const existingHistory = fs.readFileSync(
            "./results/results_history.json",
            "utf-8"
          );
          history = JSON.parse(existingHistory);
        } catch (error) {
          // File doesn't exist or is invalid, start with empty history
        }

        // Add new results
        history[historyKey] = {
          traceurs: {
            manche1: finalResults.manche1.find((r) => r.isPicked)?.committee,
            manche2: finalResults.manche2.find((r) => r.isPicked)?.committee,
            manche3: finalResults.manche3.find((r) => r.isPicked)?.committee,
            manche4: finalResults.manche4.find((r) => r.isPicked)?.committee,
          },
        };

        // Sort history by date
        const sortedHistory = Object.fromEntries(
          Object.entries(history).sort(([dateA], [dateB]) => {
            const [dayA, monthA, yearA] = dateA.split("_")[0].split("/");
            const [dayB, monthB, yearB] = dateB.split("_")[0].split("/");
            return (
              new Date(`${yearA}-${monthA}-${dayA}`).getTime() -
              new Date(`${yearB}-${monthB}-${dayB}`).getTime()
            );
          })
        );

        // Save updated history
        fs.writeFileSync(
          "./results/results_history.json",
          JSON.stringify(sortedHistory, null, 2)
        );
      } else {
        const { updatedResults } = await updateManche(finalResults);
        finalResults = updatedResults;
        // displayResults(finalResults);
      }
    }

    if (isCancel(isResultOk)) {
      cancel("Opération annulée.");
      outro("Martin Construction vous remercie pour votre confiance.");
      process.exit(0);
    }

    const html = generateHtml(finalResults, {
      date,
      discipline,
      location,
      homeCommittee: committeeCode,
    });

    fs.writeFileSync("./results/results.html", html);
    await open("./results/results.html");

    outro("Martin Construction vous remercie pour votre confiance.");
  } catch (error) {
    console.error("Erreur lors du processus :", error);
    log.error("Erreur lors de la recherche de la compétition");
    outro("Martin Construction s'excuse pour la gêne occasionnée.");
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
