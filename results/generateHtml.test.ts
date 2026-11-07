import { describe, expect, test } from "bun:test";
import { generateCommitteeResults } from "../algoSelection";
import { generateHtml } from "./generateHtml";

const counts: any = { DA: 12, SA: 30, MB: 12, PE: 5, PO: 1 };
const meta = {
  date: "19/03/2026",
  discipline: "SL",
  location: "Ski Chrono Samse Tour",
  station: "Chamrousse",
  homeCommittee: "DA" as any,
};
const html = () =>
  generateHtml(generateCommitteeResults(counts, "DA", {}, "10439"), meta);

describe("generateHtml", () => {
  test("en-tête : discipline, date, lieu et nom de la course", () => {
    expect(html()).toContain("SL - 19/03/2026 - Chamrousse - Ski Chrono Samse Tour");
  });

  test("page autonome : feuille de style intégrée, pas de lien externe", () => {
    const page = html();
    expect(page).not.toContain('href="style.css"');
    expect(page).toContain(".manche-column");
  });

  test("récapitulatif : 4 manches, organisateur d'office et tirage", () => {
    const page = html();
    expect(page.match(/<div class="tile[ "]/g)!.length).toBe(4);
    expect(page).toContain("Comité organisateur (d'office)");
    expect(page).toContain("Tirage au sort");
  });

  test("manches 1 et 3 : pas de classement, manches 2 et 4 : un comité tiré chacune", () => {
    const page = html();
    expect(page.match(/class="home-card"/g)!.length).toBe(2);
    expect(page.match(/class="rank-item picked"/g)!.length).toBe(2);
    expect(page.match(/Pourquoi /g)!.length).toBe(2);
  });

  test("manche 4 : le comité de la manche 2 est signalé comme exclu", () => {
    expect(html()).toContain("est exclu de cette manche");
  });

  test("singulier : « 1 coureur », jamais « 1 coureurs »", () => {
    const page = html();
    expect(page).toContain("1 coureur<");
    expect(page).not.toContain("1 coureurs");
  });

  test("les textes venant du site sont échappés", () => {
    const page = generateHtml(
      generateCommitteeResults(counts, "DA", {}, "1"),
      { ...meta, location: '<script>alert("x")</script>' }
    );
    expect(page).not.toContain('<script>alert("x")</script>');
    expect(page).toContain("&lt;script&gt;");
  });
});
