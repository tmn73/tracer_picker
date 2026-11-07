import { select } from "@clack/prompts";
import type { CommitteeResults } from "./algoSelection";
import { COMMITTEE_CODES, type CommitteeCode } from "./constants";
import { displayResults } from "./selectComittees";

export const updateManche = async (results: CommitteeResults) => {
  const mancheToChange = await select({
    message: "Quel manche doit être changée ?",
    options: [
      { value: "manche1", label: "M1" },
      { value: "manche2", label: "M2" },
      { value: "manche3", label: "M3" },
      { value: "manche4", label: "M4" },
    ],
  });

  const newCommitteeCode = await select({
    message: "Quel comité doit être choisi ?",
    options: Object.keys(COMMITTEE_CODES).map((code) => ({
      value: code,
      label: code,
    })),
  });

  const updatedResults: CommitteeResults = {
    ...results,
    manche1:
      mancheToChange === "manche1"
        ? [
            {
              committee: newCommitteeCode as CommitteeCode,
              count:
                results.manche1.find(
                  (c) => c.committee === newCommitteeCode && c.isHomeCommittee
                )?.count ||
                results.manche1.find((c) => c.committee === newCommitteeCode)
                  ?.count ||
                0,
              percentage:
                results.manche1.find(
                  (c) => c.committee === newCommitteeCode && c.isHomeCommittee
                )?.percentage ||
                results.manche1.find((c) => c.committee === newCommitteeCode)
                  ?.percentage ||
                0,
              isHomeCommittee:
                results.manche1.find((c) => c.committee === newCommitteeCode)
                  ?.isHomeCommittee || false,
              isPicked: true,
              isHandpicked: true,
            },
            ...results.manche1
              .filter((c) => c.committee !== newCommitteeCode)
              .map((c) => ({
                ...c,
                isPicked: false,
              })),
          ]
        : results.manche1,
    manche2:
      mancheToChange === "manche2"
        ? [
            {
              committee: newCommitteeCode as CommitteeCode,
              count:
                results.manche2.find(
                  (c) => c.committee === newCommitteeCode && c.isHomeCommittee
                )?.count ||
                results.manche2.find((c) => c.committee === newCommitteeCode)
                  ?.count ||
                0,
              percentage:
                results.manche2.find(
                  (c) => c.committee === newCommitteeCode && c.isHomeCommittee
                )?.percentage ||
                results.manche2.find((c) => c.committee === newCommitteeCode)
                  ?.percentage ||
                0,
              isHomeCommittee:
                results.manche2.find((c) => c.committee === newCommitteeCode)
                  ?.isHomeCommittee || false,
              isPicked: true,
              isHandpicked: true,
            },
            ...results.manche2
              .filter((c) => c.committee !== newCommitteeCode)
              .map((c) => ({
                ...c,
                isPicked: false,
              })),
          ]
        : results.manche2,
    manche3:
      mancheToChange === "manche3"
        ? [
            {
              committee: newCommitteeCode as CommitteeCode,
              count:
                results.manche3.find(
                  (c) => c.committee === newCommitteeCode && c.isHomeCommittee
                )?.count ||
                results.manche3.find((c) => c.committee === newCommitteeCode)
                  ?.count ||
                0,
              percentage:
                results.manche3.find(
                  (c) => c.committee === newCommitteeCode && c.isHomeCommittee
                )?.percentage ||
                results.manche3.find((c) => c.committee === newCommitteeCode)
                  ?.percentage ||
                0,
              isHomeCommittee:
                results.manche3.find((c) => c.committee === newCommitteeCode)
                  ?.isHomeCommittee || false,
              isPicked: true,
              isHandpicked: true,
            },
            ...results.manche3
              .filter((c) => c.committee !== newCommitteeCode)
              .map((c) => ({
                ...c,
                isPicked: false,
              })),
          ]
        : results.manche3,
    manche4:
      mancheToChange === "manche4"
        ? [
            {
              committee: newCommitteeCode as CommitteeCode,
              count:
                results.manche4.find(
                  (c) => c.committee === newCommitteeCode && c.isHomeCommittee
                )?.count ||
                results.manche4.find((c) => c.committee === newCommitteeCode)
                  ?.count ||
                0,
              percentage:
                results.manche4.find(
                  (c) => c.committee === newCommitteeCode && c.isHomeCommittee
                )?.percentage ||
                results.manche4.find((c) => c.committee === newCommitteeCode)
                  ?.percentage ||
                0,
              isHomeCommittee:
                results.manche4.find((c) => c.committee === newCommitteeCode)
                  ?.isHomeCommittee || false,
              isPicked: true,
              isHandpicked: true,
            },
            ...results.manche4
              .filter((c) => c.committee !== newCommitteeCode)
              .map((c) => ({
                ...c,
                isPicked: false,
              })),
          ]
        : results.manche4,
  };

  displayResults(updatedResults);

  return { updatedResults };
};
