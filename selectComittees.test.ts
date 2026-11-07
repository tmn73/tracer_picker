import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { performRandomDraw, type CommitteeEntry, type SelectionHistory } from "./algoSelection";
import { buildDrawRows, displayResults, drawRowsForTable, explainPick, formatTable } from "./selectComittees";
import { generateHtml } from "./results/generateHtml";

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

describe("formatTable", () => {
  const rows = [
    { Comité: "PE", Coureurs: 5, "Chance %": "63,5" },
    { Comité: "SA", Coureurs: 30, "Chance %": "9,0" },
  ];

  test("pas d'apostrophes ni de colonne d'index", () => {
    const out = formatTable(rows);
    expect(out).not.toContain("'");
    expect(out).not.toContain("(index)");
    expect(out).toContain("PE");
  });

  test("toutes les lignes ont la même largeur (tableau aligné)", () => {
    const widths = new Set(formatTable(rows).split("\n").map((l) => [...l].length));
    expect(widths.size).toBe(1);
  });

  test("tableau vide : chaîne vide", () => {
    expect(formatTable([])).toBe("");
  });
});

describe("choix manuel d'une manche d'office (M3)", () => {
  const base = () => {
    const r = performRandomDraw(
      {
        manche1: [{ committee: "DA", count: 12, percentage: 100, isHomeCommittee: true, isPicked: true }],
        manche2: candidates.map((c) => ({ ...c })),
        manche3: [{ committee: "DA", count: 12, percentage: 100, isHomeCommittee: true, isPicked: true }],
        manche4: candidates.map((c) => ({ ...c })),
      },
      history
    );
    // Ce que fait updateManche pour M3 -> EQ
    return {
      ...r,
      competitionCode: "10439",
      manche3: [
        { committee: "EQ", count: 0, percentage: 0, isPicked: true, isHandpicked: true },
        { committee: "DA", count: 12, percentage: 100, isHomeCommittee: true, isPicked: false },
      ],
    } as any;
  };

  test("le récapitulatif du terminal affiche EQ en M3, en choix manuel", () => {
    const logs: string[] = [];
    const spy = spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      logs.push(a.join(" "));
    });
    try {
      displayResults(base());
    } finally {
      spy.mockRestore();
    }
    const m3 = logs.join("\n").split("\n").find((l) => l.includes("│ M3"))!;
    expect(m3).toContain("EQ");
    expect(m3).toContain("Choix manuel");
    expect(m3).not.toContain("DA");
  });

  test("la page HTML affiche EQ en M3, sans classement ni « Exclu »", () => {
    const html = generateHtml(base(), {
      date: "19/03/2026", discipline: "SL", location: "x", homeCommittee: "DA" as any,
    });
    // Colonne de la manche 3 uniquement : « Exclu » est normal en manche 4
    const m3 = html.split("<h2>Manche 3</h2>")[1].split('<div class="manche-column">')[0];
    expect(m3).toContain("EQ");
    expect(m3).toContain("Choix manuel pour cette manche.");
    expect(m3).not.toContain("rank-item");
    expect(m3).not.toContain("DA");
    expect(html.match(/class="home-card/g)!.length).toBe(2);
  });
});
