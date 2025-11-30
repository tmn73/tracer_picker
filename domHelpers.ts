import type { Page } from "puppeteer";
import { log, spinner } from "@clack/prompts";
import { delay } from "./lib";
import { retry } from "./src/utils/retry";
import { COMMITTEE_CODES, type CommitteeCode } from "./constants";

export const accessTheSite = async (page: Page) => {
  const s = spinner();
  try {
    s.start("Accès au site des inscriptions");
    await page.goto("https://inscription.ffs.fr/v2/inscription_ffs/index.php");
    s.stop("Accès au site des inscriptions ✅");
  } catch (error) {
    s.stop("Erreur lors de l'accès au site ❌", 1);
    throw error;
  }
};

export const login = async (page: Page, email: string, password: string) => {
  const s = spinner();
  try {
    s.start("Connexion...");
    await fillTheLoginForm(page, email, password);
    await clickTheValidateButton(page);
    await page.waitForNetworkIdle();
    s.stop("Connecté en tant que " + email + " ✅");
  } catch (error) {
    s.stop("Erreur lors de la connexion au site ❌", 1);
    throw error;
  }
};

export const fillTheLoginForm = async (
  page: Page,
  email: string,
  password: string
) => {
  await page.waitForSelector("#email");
  await page.waitForSelector("#password");
  await page.type("#email", email);
  await page.type("#password", password);
};

export const clickTheValidateButton = async (page: Page) => {
  await page.waitForSelector('button[type="submit"]', { visible: true });
  await page.click('button[type="submit"]');
};

export async function accessTheCompetitionPage(
  page: Page,
  competitionCode: string
) {
  const s = spinner();
  try {
    s.start("Recherche de la compétition...");

    await page.waitForNetworkIdle();
    await page.waitForSelector("#num_evenement", { visible: true });
    await page.type("#num_evenement", competitionCode, { delay: 100 });

    // click the search button dans #form_competition et attendre la navigation
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      page.click("#form_competition button[type='submit']"),
    ]);

    // Wait for results table
    await page.waitForSelector("#table_competition", { visible: true });

    // Check number of competitions found via .pagination-count badge
    const competitionsCount = await page.evaluate(() => {
      const countBadge = document.querySelector(".pagination-count");
      return countBadge ? parseInt(countBadge.textContent || "0") : 0;
    });

    if (competitionsCount === 0) {
      log.error("Aucune compétition trouvée pour le code " + competitionCode);
      throw new Error(
        "Aucune compétition trouvée pour le code " + competitionCode
      );
    }

    if (competitionsCount > 1) {
      log.error(
        "Plusieurs compétitions trouvées pour le code " + competitionCode
      );
      throw new Error(
        `${competitionsCount} compétitions trouvées au lieu de 1`
      );
    }

    log.success("Compétition trouvée ✅");

    // Get committee code from the last column of the first data row
    const commiteeCode = await page.evaluate(() => {
      const row = document.querySelector("#table_competition tbody tr[data-code]");
      if (!row) return null;
      const cells = row.querySelectorAll("td");
      // Le code comité est dans la dernière cellule
      const lastCell = cells[cells.length - 1];
      return lastCell?.textContent?.trim();
    });

    if (!commiteeCode) {
      throw new Error("Aucun comité trouvé pour la compétition");
    }

    if (!COMMITTEE_CODES[commiteeCode as keyof typeof COMMITTEE_CODES]) {
      throw new Error("Comité non supporté : " + commiteeCode);
    }

    log.info(
      "Comité : " +
        COMMITTEE_CODES[commiteeCode as keyof typeof COMMITTEE_CODES]
    );

    // Click on the competition button to access details
    await page.click("#table_competition tbody tr[data-code] button.participant");
    await page.waitForNetworkIdle();

    s.stop("Compétition trouvée ✅");
    return {
      committeeCode: commiteeCode as CommitteeCode,
    };
  } catch (error) {
    s.stop("Erreur lors de la recherche ❌");
    throw error;
  }
}
