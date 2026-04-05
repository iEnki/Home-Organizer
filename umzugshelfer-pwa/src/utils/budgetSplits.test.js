import {
  berechneNettoSalden,
  buildEqualShares,
  haushaltsHatSettlements,
  istSplitGleich,
  splitAmountInCents,
} from "./budgetSplits";

describe("budgetSplits", () => {
  test("equal split includes payer in denominator but returns only debtors", () => {
    const shares = buildEqualShares(30, ["robert", "anna"], "robert");
    expect(shares).toEqual([{ member_id: "anna", amount_owed: 15 }]);
  });

  test("rest cents stay exact across all participants", () => {
    const shares = buildEqualShares(10, ["a", "b", "c"], "a");
    expect(shares).toEqual([
      { member_id: "b", amount_owed: 3.34 },
      { member_id: "c", amount_owed: 3.33 },
    ]);
    const schuldnerSumme = shares.reduce((sum, entry) => sum + entry.amount_owed, 0);
    expect(Number((schuldnerSumme + 3.33).toFixed(2))).toBe(10);
  });

  test("dedupliziert teilnehmer", () => {
    const shares = buildEqualShares(10, ["a", "a", "b"], "a");
    expect(shares).toEqual([{ member_id: "b", amount_owed: 5 }]);
  });

  test("berechnet netto salden mit settlements", () => {
    const salden = berechneNettoSalden(
      [
        {
          payer_member_id: "robert",
          budget_split_shares: [
            { member_id: "anna", amount_owed: 15 },
            { member_id: "ben", amount_owed: 15 },
          ],
        },
      ],
      [{ from_member_id: "anna", to_member_id: "robert", amount: 5 }],
    );

    expect(salden).toEqual({
      anna: -10,
      ben: -15,
      robert: 25,
    });
  });

  test("settlement helper und split vergleich arbeiten stabil", () => {
    expect(haushaltsHatSettlements([{ id: 1 }])).toBe(true);
    expect(haushaltsHatSettlements([])).toBe(false);
    expect(
      istSplitGleich(
        { aktiv: true, payerMemberId: "a", teilnehmer: ["a", "b"] },
        { aktiv: true, payerMemberId: "a", teilnehmer: ["b", "a"] },
      ),
    ).toBe(true);
    expect(
      istSplitGleich(
        { aktiv: true, payerMemberId: "a", teilnehmer: ["a", "b"] },
        { aktiv: true, payerMemberId: "b", teilnehmer: ["a", "b"] },
      ),
    ).toBe(false);
    expect(splitAmountInCents({ betrag: 12.34 })).toBe(1234);
  });
});
