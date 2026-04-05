import {
  computeAccountSpend,
  getBudgetAccountMeta,
  getScopeKontoHinweis,
  groupSpendByAccount,
  resolveKontoIdFromAiResult,
  selectDefaultKontoForEntry,
} from "./budgetAccounts";

describe("budgetAccounts", () => {
  const bewohner = [
    { id: "bew-1", name: "Robert" },
    { id: "bew-2", name: "Anna" },
  ];

  const konten = [
    {
      id: "konto-1",
      name: "Haushaltskonto",
      konto_typ: "haushaltskonto",
      inhaber_typ: "household",
      farbe: "#10B981",
      aktiv: true,
    },
    {
      id: "konto-2",
      name: "Roberts Privatkonto",
      konto_typ: "privatkonto",
      inhaber_typ: "bewohner",
      inhaber_bewohner_id: "bew-1",
      farbe: "#3B82F6",
      aktiv: true,
    },
    {
      id: "konto-3",
      name: "Sparkonto",
      konto_typ: "sparkonto",
      inhaber_typ: "household",
      farbe: "#F59E0B",
      aktiv: true,
    },
  ];

  test("liefert Konto-Meta inklusive Inhaber", () => {
    const meta = getBudgetAccountMeta(
      { zahlungskonto_id: "konto-2" },
      Object.fromEntries(konten.map((konto) => [konto.id, konto])),
      Object.fromEntries(bewohner.map((eintrag) => [eintrag.id, eintrag])),
    );

    expect(meta.kontoName).toBe("Roberts Privatkonto");
    expect(meta.inhaberName).toBe("Robert");
    expect(meta.isPrivateAccount).toBe(true);
  });

  test("waehlt sinnvolle Defaultkonten ohne Sparkonto-Bevorzugung", () => {
    expect(
      selectDefaultKontoForEntry({ budgetScope: "haushalt", konten })?.id,
    ).toBe("konto-1");
    expect(
      selectDefaultKontoForEntry({ budgetScope: "privat", bewohnerId: "bew-1", konten })?.id,
    ).toBe("konto-2");
    expect(
      selectDefaultKontoForEntry({
        budgetScope: "haushalt",
        konten: [{ ...konten[2] }],
      })?.id,
    ).toBe("konto-3");
  });

  test("liefert nur Hinweise bei Scope-Konto-Widerspruechen", () => {
    expect(
      getScopeKontoHinweis({
        budgetScope: "haushalt",
        konto: konten[1],
        bewohnerById: Object.fromEntries(bewohner.map((eintrag) => [eintrag.id, eintrag])),
      }),
    ).toContain("Privatkonto");
    expect(
      getScopeKontoHinweis({
        budgetScope: "privat",
        konto: konten[0],
        bewohnerById: {},
      }),
    ).toContain("Haushaltskonto");
  });

  test("mappt KI-Konten ueber Namen und Typ+Inhaber", () => {
    expect(
      resolveKontoIdFromAiResult({ zahlungskonto_name: "Haushaltskonto" }, konten, bewohner),
    ).toBe("konto-1");
    expect(
      resolveKontoIdFromAiResult(
        { zahlungskonto_typ: "privatkonto", bewohner_name: "Robert" },
        konten,
        bewohner,
      ),
    ).toBe("konto-2");
    expect(
      resolveKontoIdFromAiResult({ zahlungskonto_name: "Unbekannt" }, konten, bewohner),
    ).toBeNull();
  });

  test("gruppiert und summiert Ausgaben nach Konto", () => {
    const entries = [
      { id: "1", zahlungskonto_id: "konto-1", betrag: -50, typ: "ausgabe" },
      { id: "2", zahlungskonto_id: "konto-1", betrag: -20, typ: "ausgabe" },
      { id: "3", zahlungskonto_id: "konto-2", betrag: -10, typ: "ausgabe" },
      { id: "4", zahlungskonto_id: "konto-2", betrag: 300, typ: "einnahme" },
      { id: "5", zahlungskonto_id: null, betrag: -99, typ: "ausgabe" },
    ];

    const grouped = groupSpendByAccount(entries, konten);
    expect(grouped.map((item) => ({ id: item.id, buchungen: item.buchungen, summe: item.summe }))).toEqual([
      { id: "konto-1", buchungen: 2, summe: 70 },
      { id: "konto-2", buchungen: 1, summe: 10 },
    ]);
    expect(computeAccountSpend(entries, konten)).toBe(80);
  });
});
