import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { performRandomDraw, type CommitteeEntry, type SelectionHistory } from "./algoSelection";
import { buildDrawRows, drawRowsForTable, explainPick } from "./selectComittees";

let randomSpy: ReturnType<typeof spyOn> | undefined;
afterEach(() => {
  randomSpy?.mockRestore();
  randomSpy = undefined;
});

const history = {
  "01/01/2026_a_sl": { traceurs: { manche1: "EQ", manche2: "MB", manche3: "EQ", manche4: "MB" } },
  "08/01/2026_b_sl": { traceurs: { manche1: "EQ", manche2: "MB", manche3: "EQ", manche4: "MB" } },
} as unknown as SelectionHistory;

const candidates: CommitteeEntry[] = [
  { committee: "SA", count: 30, percentage: 60 },
  { committee: "MB", count: 15, percentage: 30 },
  { committee: "PE", count: 5, percentage: 10 },
];

const draw = (r2: number, r4: number) => {
  const values = [r2, r4];
  let i = 0;
  randomSpy = spyOn(Math, "random").mockImplementation(() => values[Math.min(i++, 1)]);
  return performRandomDraw(
    {
      manche1: [],
      manche2: candidates.map((c) => ({ ...c })),
      manche3: [],
      manche4: candidates.map((c) => ({ ...c })),
    },
    history
  );
};

describe("buildDrawRows", () => {
  test("trie par chance décroissante, avec un rang, et marque le comité tiré", () => {
    const rows = buildDrawRows(draw(0, 0).manche2);
    const chances = rows.map((r) => r.chance);
    expect(chances).toEqual([...chances].sort((a, b) => b - a));
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rows.filter((r) => r.status === "tire")).toHaveLength(1);
  });

  test("le poids affiché = part × × traçages × × attente", () => {
    for (const r of buildDrawRows(draw(0, 0).manche2)) {
      expect(r.weight).toBeCloseTo(r.share * r.occWeight! * r.waitWeight!, 6);
    }
  });

  test("manche 4 : le comité de la manche 2 est exclu, placé en dernier, sans rang", () => {
    const result = draw(0, 0.5);
    const picked2 = result.manche2.find((c) => c.isPicked)!.committee;
    const rows = buildDrawRows(result.manche4);
    const last = rows[rows.length - 1];
    expect(last.committee).toBe(picked2);
    expect(last.status).toBe("exclu");
    expect(last.rank).toBeUndefined();
    expect(rows.filter((r) => r.status === "tire")[0].committee).not.toBe(picked2);
  });

  test("un choix manuel est signalé comme tel", () => {
    const manche = draw(0, 0).manche2.map((c, i) => ({
      ...c,
      isPicked: i === 1,
      isHandpicked: i === 1,
    }));
    const rows = buildDrawRows(manche);
    expect(rows.filter((r) => r.status === "manuel")).toHaveLength(1);
    expect(explainPick(rows, "M2")).toContain("choisi manuellement");
  });
});

describe("drawRowsForTable", () => {
  test("affiche les colonnes de calcul et le résultat", () => {
    const table = drawRowsForTable(buildDrawRows(draw(0, 0).manche2), "exclu");
    expect(Object.keys(table[0])).toEqual([
      "#", "Comité", "Coureurs", "Part %", "Déjà tracé", "Courses sans tracer",
      "× traçages", "× attente", "Poids", "Chance %", "Résultat",
    ]);
    expect(table.filter((r) => r.Résultat === "◀ TIRÉ")).toHaveLength(1);
  });

  test("décimales à la française (virgule)", () => {
    const table = drawRowsForTable(buildDrawRows(draw(0, 0).manche2), "exclu");
    expect(table.every((r) => !r["Part %"].includes("."))).toBe(true);
  });
});

describe("explainPick", () => {
  test("indique le favori quand le premier du classement est tiré", () => {
    const result = draw(0, 0.5);
    const rows = buildDrawRows(result.manche2);
    const picked = rows.find((r) => r.status === "tire")!;
    const text = explainPick(rows, "M2");
    expect(text).toContain(picked.committee);
    if (picked.rank === 1) expect(text).toContain("favori");
  });

  test("précise quand le comité tiré n'était pas le favori", () => {
    // random à 0.999 : tombe sur le dernier comité du tirage (pas le favori)
    const rows = buildDrawRows(draw(0.999, 0.999).manche2);
    const picked = rows.find((r) => r.status === "tire")!;
    expect(picked.rank).toBeGreaterThan(1);
    expect(explainPick(rows, "M2")).toContain("tirage au sort");
  });

  test("manche vide : message sans erreur", () => {
    expect(explainPick([], "M2")).toContain("aucun comité");
  });
});
