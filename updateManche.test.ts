import { describe, expect, spyOn, test } from "bun:test";
import { generateCommitteeResults } from "./algoSelection";
import { displayResults } from "./selectComittees";
import { applyManualPick, buildCommitteeOptions } from "./updateManche";

const counts: any = { DA: 12, SA: 30, MB: 12, PE: 5, CNE: 11, PO: 1 };
const draw = () => generateCommitteeResults(counts, "DA", {}, "10439");

describe("buildCommitteeOptions", () => {
  test("M3 : chaque comité affiche son effectif et sa chance, les plus probables d'abord", () => {
    const options = buildCommitteeOptions(draw(), "manche3");
    const sa = options.find((o) => o.value === "SA")!;
    expect(sa.label).toContain("30 coureurs");
    expect(sa.label).toMatch(/\d+,\d % de chances/);

    // tri par chance décroissante parmi les comités du tirage
    const chances = options
      .filter((o) => /de chances/.test(o.label))
      .map((o) => Number(o.label.match(/(\d+),(\d) %/)!.slice(1, 3).join(".")));
    expect(chances).toEqual([...chances].sort((a, b) => b - a));
  });

  test("l'organisateur est signalé, et les comités hors tirage aussi", () => {
    const options = buildCommitteeOptions(draw(), "manche3");
    expect(options.find((o) => o.value === "DA")!.label).toContain("organisateur");
    expect(options.find((o) => o.value === "EQ")!.label).toContain("hors tirage");
  });

  test("M4 : le comité tiré en M2 est signalé comme exclu", () => {
    const results = draw();
    const picked2 = results.manche2.find((c) => c.isPicked)!.committee;
    const label = buildCommitteeOptions(results, "manche4").find(
      (o) => o.value === picked2
    )!.label;
    expect(label).toContain("exclu");
  });

  test("le choix actuel est marqué", () => {
    const results = draw();
    const current = results.manche2.find((c) => c.isPicked)!.committee;
    const label = buildCommitteeOptions(results, "manche2").find(
      (o) => o.value === current
    )!.label;
    expect(label).toContain("◀ actuel");
  });

  test("toutes les valeurs sont proposées, sans doublon, y compris un comité hors COMMITTEE_CODES (PO)", () => {
    const values = buildCommitteeOptions(draw(), "manche2").map((o) => o.value as string);
    expect(new Set(values).size).toBe(values.length);
    expect(values).toContain("EQ");
    expect(values).toContain("PO");
  });

  test("singulier : « 1 coureur », jamais « 1 coureurs »", () => {
    const po = buildCommitteeOptions(draw(), "manche2").find((o) => (o.value as string) === "PO")!;
    expect(po.label).toContain("1 coureur ");
    expect(po.label).not.toContain("1 coureurs");
  });
});

describe("applyManualPick", () => {
  test("M3 -> CNE : CNE passe en tête, marqué choix manuel, avec son vrai effectif", () => {
    const updated = applyManualPick(draw(), "manche3", "CNE");
    const [first, ...rest] = updated.manche3;
    expect(first).toMatchObject({ committee: "CNE", isPicked: true, isHandpicked: true });
    expect(first.count).toBe(11); // et non 0
    expect(rest.every((c) => !c.isPicked)).toBe(true);
    expect(rest.map((c) => c.committee)).toContain("DA");
  });

  test("M2 : le choix manuel garde ses facteurs de calcul", () => {
    const updated = applyManualPick(draw(), "manche2", "PE");
    const first = updated.manche2[0];
    expect(first.committee).toBe("PE");
    expect(first.weight).toBeDefined();
    expect(updated.manche2.filter((c) => c.isPicked)).toHaveLength(1);
  });

  test("ne modifie pas les autres manches ni les résultats d'origine", () => {
    const original = draw();
    const before = JSON.stringify(original);
    const updated = applyManualPick(original, "manche3", "CNE");
    expect(JSON.stringify(original)).toBe(before);
    expect(updated.manche1).toEqual(original.manche1);
    expect(updated.manche2).toEqual(original.manche2);
  });

  test("un comité absent du tirage (EQ) est accepté, effectif 0", () => {
    const updated = applyManualPick(draw(), "manche3", "EQ");
    expect(updated.manche3[0]).toMatchObject({ committee: "EQ", count: 0, isHandpicked: true });
  });

  test("le récapitulatif affiche CNE en M3 après le choix", () => {
    const logs: string[] = [];
    const spy = spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      logs.push(a.join(" "));
    });
    try {
      displayResults(applyManualPick(draw(), "manche3", "CNE"));
    } finally {
      spy.mockRestore();
    }
    const m3 = logs.join("\n").split("\n").find((l) => l.includes("│ M3"))!;
    expect(m3).toContain("CNE");
    expect(m3).toContain("Choix manuel");
  });
});
