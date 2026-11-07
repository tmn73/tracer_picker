import { afterEach, describe, expect, spyOn, test } from "bun:test";
import {
  generateCommitteeResults,
  performRandomDraw,
  type CommitteeEntry,
  type SelectionHistory,
} from "./algoSelection";

const NO_HISTORY: SelectionHistory = {};

const entry = (
  committee: CommitteeEntry["committee"],
  count: number,
  percentage: number
): CommitteeEntry => ({ committee, count, percentage });

const draw = (
  manche2: CommitteeEntry[],
  manche4: CommitteeEntry[] = manche2,
  history: SelectionHistory = NO_HISTORY
) =>
  performRandomDraw(
    { manche1: [], manche2, manche3: [], manche4 },
    history
  );

const picked = (list: CommitteeEntry[]) => list.filter((e) => e.isPicked);
const sum = (list: CommitteeEntry[]) =>
  list.reduce((s, e) => s + e.percentage, 0);

let randomSpy: ReturnType<typeof spyOn> | undefined;
const mockRandom = (...values: number[]) => {
  let i = 0;
  randomSpy = spyOn(Math, "random").mockImplementation(
    () => values[Math.min(i++, values.length - 1)]
  );
};

afterEach(() => {
  randomSpy?.mockRestore();
  randomSpy = undefined;
});

describe("generateCommitteeResults", () => {
  const counts = { EQ: 30, SA: 20, MB: 10, AP: 40 } as any;

  test("manches 1 et 3 : comité organisateur, toujours choisi", () => {
    const r = generateCommitteeResults(counts, "EQ", NO_HISTORY, "12345");
    for (const m of [r.manche1, r.manche3]) {
      expect(m).toHaveLength(1);
      expect(m[0]).toMatchObject({
        committee: "EQ",
        isHomeCommittee: true,
        isPicked: true,
        count: 30,
      });
    }
  });

  test("manches 2 et 4 : exactement un comité choisi, jamais le comité organisateur", () => {
    for (let i = 0; i < 50; i++) {
      const r = generateCommitteeResults(counts, "EQ", NO_HISTORY, "12345");
      for (const m of [r.manche2, r.manche4]) {
        expect(picked(m)).toHaveLength(1);
        expect(m.map((e) => e.committee)).not.toContain("EQ");
      }
    }
  });

  test("manche 4 ne choisit jamais le comité de la manche 2", () => {
    for (let i = 0; i < 100; i++) {
      const r = generateCommitteeResults(counts, "EQ", NO_HISTORY, "12345");
      expect(picked(r.manche4)[0].committee).not.toBe(
        picked(r.manche2)[0].committee
      );
    }
  });

  test("conserve le code de compétition", () => {
    const r = generateCommitteeResults(counts, "EQ", NO_HISTORY, "99999");
    expect(r.competitionCode).toBe("99999");
  });

  test("ignore les comités à 0 coureur", () => {
    const r = generateCommitteeResults(
      { EQ: 10, SA: 0, MB: 5 } as any,
      "EQ",
      NO_HISTORY,
      "1"
    );
    expect(r.manche2.map((e) => e.committee)).toEqual(["MB"]);
  });

  test("un seul autre comité : pas de crash, il est choisi", () => {
    const r = generateCommitteeResults(
      { EQ: 10, SA: 5 } as any,
      "EQ",
      NO_HISTORY,
      "1"
    );
    expect(picked(r.manche2)[0].committee).toBe("SA");
    // manche 4 : le seul comité est exclu, repli sur tirage uniforme
    expect(picked(r.manche4)).toHaveLength(1);
  });

  test("aucun autre comité : pas de crash, aucun choix", () => {
    const r = generateCommitteeResults(
      { EQ: 10 } as any,
      "EQ",
      NO_HISTORY,
      "1"
    );
    expect(r.manche2).toEqual([]);
    expect(r.manche4).toEqual([]);
  });
});

describe("performRandomDraw : tirage pondéré", () => {
  test("les pourcentages normalisés somment à 100", () => {
    const r = draw([entry("SA", 1, 20), entry("MB", 1, 30), entry("AP", 1, 50)]);
    expect(sum(r.manche2)).toBeCloseTo(100);
  });

  test("random bas -> premier comité, random haut -> dernier", () => {
    const list = [entry("SA", 1, 50), entry("MB", 1, 50)];

    mockRandom(0, 0);
    expect(picked(draw(list).manche2)[0].committee).toBe("SA");
    randomSpy!.mockRestore();

    mockRandom(0.999, 0.999);
    expect(picked(draw(list).manche2)[0].committee).toBe("MB");
  });

  test("le tirage suit les poids (frontière à 75 %)", () => {
    const list = [entry("SA", 1, 75), entry("MB", 1, 25)];

    mockRandom(0.74, 0.74);
    expect(picked(draw(list).manche2)[0].committee).toBe("SA");
    randomSpy!.mockRestore();

    mockRandom(0.76, 0.76);
    expect(picked(draw(list).manche2)[0].committee).toBe("MB");
  });

  test("manche 4 : le comité de la manche 2 a un poids de 0 et n'est jamais choisi", () => {
    const list = [entry("SA", 1, 34), entry("MB", 1, 33), entry("AP", 1, 33)];
    for (const rnd of [0, 0.2, 0.5, 0.8, 0.999]) {
      randomSpy?.mockRestore();
      mockRandom(0, rnd); // manche 2 -> SA
      const r = draw(list);
      expect(picked(r.manche2)[0].committee).toBe("SA");
      const sa = r.manche4.find((e) => e.committee === "SA")!;
      expect(sa.percentage).toBe(0);
      expect(picked(r.manche4)[0].committee).not.toBe("SA");
    }
  });

  test("poids totaux nuls : repli uniforme sans NaN ni crash", () => {
    const list = [entry("SA", 0, 0), entry("MB", 0, 0)];
    mockRandom(0.1, 0.1);
    const r = draw(list);
    expect(picked(r.manche2)).toHaveLength(1);
    expect(r.manche2.every((e) => !Number.isNaN(e.percentage))).toBe(true);
  });

  test("liste vide : aucun choix, pas d'exception", () => {
    const r = draw([], []);
    expect(r.manche2).toEqual([]);
    expect(r.manche4).toEqual([]);
  });

  test("erreur d'arrondi (random ~ 1) : choisit quand même un comité", () => {
    mockRandom(1, 1);
    const r = draw([entry("SA", 1, 33.3), entry("MB", 1, 33.3)]);
    expect(picked(r.manche2)).toHaveLength(1);
  });
});

describe("performRandomDraw : pondération par l'historique", () => {
  const history = {
    "01/01/2026_a_sl": { traceurs: { manche1: "EQ", manche2: "MB", manche3: "EQ", manche4: "MB" } },
    "08/01/2026_b_sl": { traceurs: { manche1: "EQ", manche2: "MB", manche3: "EQ", manche4: "MB" } },
    "15/01/2026_c_sl": { traceurs: { manche1: "EQ", manche2: "MB", manche3: "EQ", manche4: "MB" } },
  } as unknown as SelectionHistory;

  test("un comité qui n'a pas tracé depuis longtemps est favorisé", () => {
    // Même part de coureurs : SA n'a jamais tracé, MB a tracé à chaque course
    const list = [entry("SA", 10, 50), entry("MB", 10, 50)];
    const r = draw(list, list, history);
    const sa = r.manche2.find((e) => e.committee === "SA")!;
    const mb = r.manche2.find((e) => e.committee === "MB")!;
    expect(sa.percentage).toBeGreaterThan(mb.percentage);
    expect(sa.competitionsSinceLastTrace).toBe(3);
    expect(mb.competitionsSinceLastTrace).toBe(0);
    expect(mb.occurrences).toBe(6);
  });

  test("sans historique, des parts égales donnent des poids égaux", () => {
    const list = [entry("SA", 10, 50), entry("MB", 10, 50)];
    const r = draw(list);
    expect(r.manche2[0].percentage).toBeCloseTo(r.manche2[1].percentage);
  });

  test("le comité le plus représenté pèse plus, à historique égal", () => {
    const list = [entry("SA", 30, 75), entry("MB", 10, 25)];
    const r = draw(list);
    expect(r.manche2[0].percentage).toBeGreaterThan(r.manche2[1].percentage);
  });
});
