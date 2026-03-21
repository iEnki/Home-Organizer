-- ============================================================
-- Home Organizer Demo-Daten für Demo-User
-- User: demo@demo.com | ID: 982d334b-9604-4363-8a6b-e0ab45234ada
--
-- Szenario: Familie Müller, frisch eingezogen in Wiener Wohnung.
-- Befüllt alle Home-Organizer-Features mit realistischen Beispielen.
-- Budget-Posten: 12 Monate (April 2025 – März 2026) mit
-- monatlichen, vierteljährlichen und einmaligen Ausgaben.
--
-- HINWEIS: Nur Home-Organizer-Tabellen werden befüllt.
-- Umzugsplaner-Daten bleiben unverändert.
--
-- IDEMPOTENT: Kann mehrfach ausgeführt werden – löscht vorher
-- alle vorhandenen Home-Daten des Demo-Users.
-- ============================================================

DO $$
DECLARE
  v_user_id UUID := 'bc6c7d52-59de-4a7c-a60b-a25434ae9a2a';
  v_household_id UUID;

  -- home_bewohner
  v_bewohner_anna UUID;
  v_bewohner_max  UUID;

  -- home_orte
  v_ort_wohnung UUID;
  v_ort_keller  UUID;
  v_ort_garage  UUID;

  -- home_lagerorte
  v_lager_wohnzimmer      UUID;
  v_lager_buecher         UUID;
  v_lager_vorrat_kueche   UUID;
  v_lager_kleiderschrank  UUID;
  v_lager_arbeits         UUID;
  v_lager_keller_regal    UUID;
  v_lager_werkzeugkiste   UUID;
  v_lager_reifen          UUID;
  v_lager_werkzeugschrank UUID;

  -- home_geraete
  v_geraet_waschmaschine   UUID;
  v_geraet_geschirrspueler UUID;
  v_geraet_heizung         UUID;
  v_geraet_auto            UUID;
  v_geraet_staubsauger     UUID;
  v_geraet_kaffeemaschine  UUID;
  v_geraet_rauchmelder     UUID;

  -- home_vorraete (für Einkaufliste FK)
  v_vorrat_klopapier        UUID;
  v_vorrat_kaffee           UUID;
  v_vorrat_geschirrspueltabs UUID;
  v_vorrat_shampoo          UUID;

  -- home_projekte
  v_projekt_balkon UUID;
  v_projekt_bad    UUID;
  v_projekt_winter UUID;

BEGIN

  -- ============================================================
  -- 0a. Haushalt für Demo-User ermitteln oder anlegen (idempotent)
  -- ============================================================
  SELECT household_id INTO v_household_id
    FROM public.household_members
    WHERE user_id = v_user_id
    LIMIT 1;

  IF v_household_id IS NULL THEN
    INSERT INTO public.households (id, name, created_by)
      VALUES (gen_random_uuid(), 'Demo-Haushalt', v_user_id)
      RETURNING id INTO v_household_id;

    INSERT INTO public.household_members (household_id, user_id, role)
      VALUES (v_household_id, v_user_id, 'admin');
  END IF;

  -- App-Modus auf 'home' setzen
  INSERT INTO public.household_settings (household_id, app_modus)
    VALUES (v_household_id, 'home')
    ON CONFLICT (household_id) DO UPDATE SET app_modus = 'home';

  -- user_profile ebenfalls aktualisieren (Abwärtskompatibilität)
  UPDATE public.user_profile SET app_modus = 'home' WHERE id = v_user_id;


  -- ============================================================
  -- 0b. Bestehende Demo-Home-Daten löschen (idempotent)
  -- home_orte-Cascade löscht: home_lagerorte → ort_id
  -- home_objekte.lagerort_id / ort_id werden auf NULL gesetzt
  -- ============================================================
  DELETE FROM public.home_sparziele     WHERE user_id = v_user_id;
  DELETE FROM public.home_budget_limits WHERE user_id = v_user_id;
  DELETE FROM public.home_wissen        WHERE user_id = v_user_id;
  DELETE FROM public.home_verlauf       WHERE user_id = v_user_id;
  DELETE FROM public.home_projekte      WHERE user_id = v_user_id;
  DELETE FROM public.home_geraete       WHERE user_id = v_user_id;
  DELETE FROM public.home_einkaufliste  WHERE user_id = v_user_id;
  DELETE FROM public.home_vorraete      WHERE user_id = v_user_id;
  DELETE FROM public.home_objekte       WHERE user_id = v_user_id;
  DELETE FROM public.home_orte          WHERE user_id = v_user_id;
  DELETE FROM public.home_bewohner      WHERE user_id = v_user_id;
  DELETE FROM public.budget_posten      WHERE user_id = v_user_id AND app_modus = 'home';
  DELETE FROM public.todo_aufgaben      WHERE user_id = v_user_id AND app_modus = 'home';


  -- ============================================================
  -- 1. home_orte — 3 Standorte
  -- ============================================================
  v_ort_wohnung := gen_random_uuid();
  v_ort_keller  := gen_random_uuid();
  v_ort_garage  := gen_random_uuid();

  INSERT INTO public.home_orte (id, user_id, household_id, name, typ, adresse, notizen, farbe, symbol) VALUES
    (v_ort_wohnung, v_user_id, v_household_id,
     'Hauptwohnung', 'Wohnung', 'Musterstraße 5, 1010 Wien',
     '1. Etage, Tür 8 – Schlüssel beim Hausmeister Hofmann',
     '#10B981', '🏠'),

    (v_ort_keller, v_user_id, v_household_id,
     'Kellerraum K12', 'Keller', NULL,
     'Kellerabteil K12 im Untergeschoss – Schlüssel am Schlüsselbund',
     '#6366F1', '📦'),

    (v_ort_garage, v_user_id, v_household_id,
     'Tiefgarage', 'Garage', NULL,
     'Stellplatz Nr. 24 – Chipkarte für Einfahrt am Schlüsselbund',
     '#F97316', '🚗');


  -- ============================================================
  -- 2. home_lagerorte — 9 Lagerorte verteilt auf die 3 Orte
  -- ============================================================
  v_lager_wohnzimmer      := gen_random_uuid();
  v_lager_buecher         := gen_random_uuid();
  v_lager_vorrat_kueche   := gen_random_uuid();
  v_lager_kleiderschrank  := gen_random_uuid();
  v_lager_arbeits         := gen_random_uuid();
  v_lager_keller_regal    := gen_random_uuid();
  v_lager_werkzeugkiste   := gen_random_uuid();
  v_lager_reifen          := gen_random_uuid();
  v_lager_werkzeugschrank := gen_random_uuid();

  INSERT INTO public.home_lagerorte
    (id, user_id, household_id, ort_id, name, typ, beschreibung, position) VALUES

    -- Wohnung
    (v_lager_wohnzimmer,     v_user_id, v_household_id, v_ort_wohnung,
     'Wohnzimmer-Regal', 'Regal', 'TV-Möbel mit 4 Ablagefächern', 1),

    (v_lager_buecher,        v_user_id, v_household_id, v_ort_wohnung,
     'Bücherregal', 'Regal', 'IKEA Kallax 4×4, Wohnzimmer rechts', 2),

    (v_lager_vorrat_kueche,  v_user_id, v_household_id, v_ort_wohnung,
     'Vorratschrank Küche', 'Schrank', 'Hoher Schrank neben dem Kühlschrank', 3),

    (v_lager_kleiderschrank, v_user_id, v_household_id, v_ort_wohnung,
     'Kleiderschrank Schlafzimmer', 'Schrank', 'IKEA PAX, 3-türig, Schiebetüren', 4),

    (v_lager_arbeits,        v_user_id, v_household_id, v_ort_wohnung,
     'Arbeitszimmer-Regal', 'Regal', 'Standregal neben dem Schreibtisch, 5 Böden', 5),

    -- Keller
    (v_lager_keller_regal,   v_user_id, v_household_id, v_ort_keller,
     'Kellerregal A', 'Regal', 'Metall-Steckregal, 5 Böden à 80cm Tiefe', 1),

    (v_lager_werkzeugkiste,  v_user_id, v_household_id, v_ort_keller,
     'Werkzeugkiste', 'Kiste', 'Rote Metall-Werkzeugbox, abschließbar', 2),

    -- Garage
    (v_lager_reifen,          v_user_id, v_household_id, v_ort_garage,
     'Reifenregal', 'Regal', 'Wandmontiertes Stahlregal für 4 Reifen', 1),

    (v_lager_werkzeugschrank, v_user_id, v_household_id, v_ort_garage,
     'Werkzeugschrank', 'Schrank', 'Blauer Metall-Werkzeugschrank, 3 Schubladen', 2);


  -- ============================================================
  -- 3. home_bewohner — 2 Bewohner
  -- ============================================================
  v_bewohner_anna := gen_random_uuid();
  v_bewohner_max  := gen_random_uuid();

  INSERT INTO public.home_bewohner (id, user_id, household_id, name, farbe, emoji) VALUES
    (v_bewohner_anna, v_user_id, v_household_id, 'Anna', '#10B981', '👩'),
    (v_bewohner_max,  v_user_id, v_household_id, 'Max',  '#6366F1', '👨');


  -- ============================================================
  -- 4. home_objekte — 18 Objekte (alle Status + Kategorien)
  -- ============================================================
  INSERT INTO public.home_objekte
    (id, user_id, household_id, ort_id, lagerort_id, bewohner_id, name, beschreibung, kategorie, status,
     menge, tags, kaufdatum, kaufpreis, garantie_bis, zugriffshaeufigkeit) VALUES

    -- Elektronik → in_verwendung
    (gen_random_uuid(), v_user_id, v_household_id, v_ort_wohnung, v_lager_wohnzimmer, NULL,
     'Samsung QLED TV 55"', '55 Zoll 4K QLED Fernseher, HDR10+',
     'Elektronik', 'in_verwendung', 1,
     ARRAY['TV', 'Samsung', 'Wohnzimmer', '4K'],
     '2024-11-15', 799.00, '2027-11-15', 'taeglich'),

    (gen_random_uuid(), v_user_id, v_household_id, v_ort_wohnung, v_lager_arbeits, v_bewohner_max,
     'MacBook Pro 14"', '14 Zoll, M3 Pro Chip, Space Grey, 18 GB RAM',
     'Elektronik', 'in_verwendung', 1,
     ARRAY['Laptop', 'Apple', 'Arbeit', 'M3'],
     '2024-01-20', 2199.00, '2026-01-20', 'taeglich'),

    (gen_random_uuid(), v_user_id, v_household_id, v_ort_wohnung, v_lager_wohnzimmer, NULL,
     'FRITZ!Box 7590 AX', 'WLAN-Router, Wi-Fi 6, Dual-Band',
     'Elektronik', 'in_verwendung', 1,
     ARRAY['Router', 'WLAN', 'Internet', 'FRITZ!Box'],
     '2023-05-10', 189.00, '2026-05-10', 'selten'),

    (gen_random_uuid(), v_user_id, v_household_id, v_ort_wohnung, v_lager_arbeits, NULL,
     'Canon PIXMA Drucker', 'Farb-Tintenstrahldrucker, WLAN – Druckkopf defekt',
     'Elektronik', 'defekt', 1,
     ARRAY['Drucker', 'Canon', 'defekt'],
     '2021-03-01', 89.00, NULL, 'selten'),

    -- Werkzeug → eingelagert im Keller
    (gen_random_uuid(), v_user_id, v_household_id, v_ort_keller, v_lager_werkzeugkiste, NULL,
     'Bosch Schlagbohrmaschine', 'GSB 18V-55 Akku, 2 Akkus + Ladegerät im Koffer',
     'Werkzeug', 'eingelagert', 1,
     ARRAY['Bosch', 'Akku', 'Bohren', '18V'],
     '2023-08-14', 149.00, '2026-08-14', 'monatlich'),

    (gen_random_uuid(), v_user_id, v_household_id, v_ort_keller, v_lager_werkzeugkiste, NULL,
     'Makita Stichsäge', 'JV0600K im Koffer, 500W',
     'Werkzeug', 'eingelagert', 1,
     ARRAY['Makita', 'Säge', 'Holz'],
     '2022-04-05', 89.00, '2025-04-05', 'selten'),

    (gen_random_uuid(), v_user_id, v_household_id, v_ort_keller, v_lager_keller_regal, NULL,
     'Standpumpe Fahrrad', 'Mit Manometer, Schrader + Presta',
     'Werkzeug', 'eingelagert', 1,
     ARRAY['Fahrrad', 'Pumpe'],
     '2022-07-01', 35.00, NULL, 'monatlich'),

    -- Werkzeug → verliehen
    (gen_random_uuid(), v_user_id, v_household_id, v_ort_keller, v_lager_werkzeugkiste, NULL,
     'Bosch Winkelschleifer', 'PWS 700-115, 700W – derzeit verliehen',
     'Werkzeug', 'verliehen', 1,
     ARRAY['Bosch', 'Schleifen', 'verliehen'],
     '2022-06-20', 55.00, NULL, 'monatlich'),

    -- Küche → eingelagert (Saisongeräte)
    (gen_random_uuid(), v_user_id, v_household_id, v_ort_keller, v_lager_keller_regal, NULL,
     'Raclette-Set 8 Personen', 'Elektrisches Raclette, 8 Pfännchen, Grill',
     'Küche', 'eingelagert', 1,
     ARRAY['Raclette', 'Winter', 'Gäste', 'Grill'],
     '2022-12-10', 69.00, NULL, 'selten'),

    (gen_random_uuid(), v_user_id, v_household_id, v_ort_keller, v_lager_keller_regal, NULL,
     'Belgisches Doppel-Waffeleisen', '1200W, antihaft, herausnehmbare Platten',
     'Küche', 'eingelagert', 1,
     ARRAY['Waffeln', 'Frühstück', 'Belgisch'],
     '2021-12-24', 39.00, NULL, 'selten'),

    -- Kleidung → eingelagert (Saisonal)
    (gen_random_uuid(), v_user_id, v_household_id, v_ort_wohnung, v_lager_kleiderschrank, v_bewohner_max,
     'Canada Goose Winterjacke', 'Herren Expedition Parka, Größe L, Schwarz',
     'Kleidung', 'eingelagert', 1,
     ARRAY['Winter', 'Jacke', 'Canada Goose', 'Outdoor'],
     '2023-10-28', 699.00, NULL, 'selten'),

    (gen_random_uuid(), v_user_id, v_household_id, v_ort_wohnung, v_lager_kleiderschrank, v_bewohner_anna,
     'Ski-Set Salomon', 'Skijacke + Skihose, Rot/Schwarz, Gr. M/L',
     'Kleidung', 'eingelagert', 1,
     ARRAY['Ski', 'Winter', 'Salomon', 'Sport'],
     '2022-01-15', 320.00, NULL, 'selten'),

    -- Bücher
    (gen_random_uuid(), v_user_id, v_household_id, v_ort_wohnung, v_lager_buecher, NULL,
     'Fachbücher Informatik', 'ca. 15 Bücher: Clean Code, DDD, Algorithms...',
     'Bücher', 'in_verwendung', 15,
     ARRAY['Informatik', 'Fachbuch', 'Programmierung'],
     NULL, 120.00, NULL, 'woechentlich'),

    (gen_random_uuid(), v_user_id, v_household_id, v_ort_wohnung, v_lager_buecher, NULL,
     'Romane & Belletristik', 'ca. 30 Bücher: Klassiker, Thriller, Fantasy',
     'Bücher', 'in_verwendung', 30,
     ARRAY['Roman', 'Lesen', 'Unterhaltung', 'Klassiker'],
     NULL, 180.00, NULL, 'woechentlich'),

    -- Sport
    (gen_random_uuid(), v_user_id, v_household_id, v_ort_keller, v_lager_keller_regal, v_bewohner_anna,
     'Lululemon Yoga-Matte', '5mm, Lila, 183cm × 61cm, mit Trageband',
     'Sport', 'eingelagert', 1,
     ARRAY['Yoga', 'Sport', 'Fitness', 'Lululemon'],
     '2023-01-10', 88.00, NULL, 'woechentlich'),

    -- Deko
    (gen_random_uuid(), v_user_id, v_household_id, v_ort_keller, v_lager_keller_regal, NULL,
     'Weihnachtsdeko-Kiste', 'Lichterketten (3x), Kugeln, Adventskranz, Stern',
     'Deko', 'eingelagert', 1,
     ARRAY['Weihnachten', 'Deko', 'Advent', 'Saisonal'],
     NULL, 85.00, NULL, 'selten'),

    -- Dokumente
    (gen_random_uuid(), v_user_id, v_household_id, v_ort_wohnung, v_lager_arbeits, NULL,
     'Dokumentenmappe', 'Pässe, Mietvertrag, Versicherungen, Garantiebelege',
     'Dokumente', 'in_verwendung', 1,
     ARRAY['Dokumente', 'Wichtig', 'Versicherung', 'Verträge'],
     NULL, NULL, NULL, 'monatlich'),

    -- Garage / Reifen
    (gen_random_uuid(), v_user_id, v_household_id, v_ort_garage, v_lager_reifen, NULL,
     'Winterreifen auf Felgen 4×', 'Michelin Alpin 6, 205/55 R16, Bj. 2022',
     'Sonstiges', 'eingelagert', 4,
     ARRAY['Auto', 'Reifen', 'Winter', 'Michelin'],
     '2022-10-20', 520.00, NULL, 'selten');

  -- Verliehen-Details nachpflegen
  UPDATE public.home_objekte
    SET verliehen_an = 'Nachbar Peter Schwarz (EG links)',
        verliehen_am = '2026-02-28'
  WHERE user_id = v_user_id AND name = 'Bosch Winkelschleifer';


  -- ============================================================
  -- 5. home_vorraete — 12 Einträge (4 unter Mindestmenge!)
  -- ============================================================
  v_vorrat_klopapier         := gen_random_uuid();
  v_vorrat_kaffee            := gen_random_uuid();
  v_vorrat_geschirrspueltabs := gen_random_uuid();
  v_vorrat_shampoo           := gen_random_uuid();

  INSERT INTO public.home_vorraete
    (id, user_id, household_id, lagerort_id, name, kategorie, einheit,
     bestand, mindestmenge, ablaufdatum, notizen) VALUES

    -- UNTER Mindestmenge → rote Warnanzeige
    (v_vorrat_klopapier, v_user_id, v_household_id, v_lager_vorrat_kueche,
     'Klopapier', 'Haushalt', 'Rolle',
     2, 6, NULL, '3-lagig, bevorzugt Zewa Plus'),

    (v_vorrat_kaffee, v_user_id, v_household_id, v_lager_vorrat_kueche,
     'Kaffeebohnen', 'Lebensmittel', 'kg',
     0.2, 0.5, '2026-09-01', 'Jacobs Crema, ganze Bohne – Vollautomaten-Einstellung Stufe 4'),

    (v_vorrat_geschirrspueltabs, v_user_id, v_household_id, v_lager_vorrat_kueche,
     'Geschirrspültabs', 'Reinigung', 'Stück',
     3, 10, '2027-06-01', 'Finish All in 1 Powerball'),

    (v_vorrat_shampoo, v_user_id, v_household_id, v_lager_vorrat_kueche,
     'Shampoo', 'Hygiene', 'Flasche',
     1, 2, NULL, 'Head & Shoulders Classic'),

    -- Ausreichend vorrätig
    (gen_random_uuid(), v_user_id, v_household_id, v_lager_vorrat_kueche,
     'Olivenöl', 'Lebensmittel', 'Liter',
     1.5, 0.5, '2027-03-01', 'Kaltgepresst extra vergine, spanisch'),

    (gen_random_uuid(), v_user_id, v_household_id, v_lager_vorrat_kueche,
     'Nudeln (verschiedene)', 'Lebensmittel', 'Packung',
     5, 2, '2028-01-01', 'Spaghetti, Penne, Rigatoni'),

    (gen_random_uuid(), v_user_id, v_household_id, v_lager_vorrat_kueche,
     'Tomaten (Dose)', 'Lebensmittel', 'Dose',
     8, 4, '2027-12-01', 'Mutti Polpa di Pomodoro 400g'),

    (gen_random_uuid(), v_user_id, v_household_id, v_lager_vorrat_kueche,
     'Waschmittel Persil', 'Reinigung', 'Packung',
     2, 1, NULL, 'Persil Color Pulver 30 WL'),

    (gen_random_uuid(), v_user_id, v_household_id, v_lager_vorrat_kueche,
     'Zahnpasta', 'Hygiene', 'Tube',
     3, 2, NULL, 'Elmex Sensitive Plus'),

    (gen_random_uuid(), v_user_id, v_household_id, v_lager_vorrat_kueche,
     'Batterien AA', 'Technik', 'Stück',
     8, 4, NULL, 'Duracell Plus Alkaline'),

    (gen_random_uuid(), v_user_id, v_household_id, v_lager_vorrat_kueche,
     'Müllbeutel 35L', 'Haushalt', 'Rolle',
     3, 2, NULL, 'Schwarz, 25 Stück pro Rolle'),

    (gen_random_uuid(), v_user_id, v_household_id, v_lager_vorrat_kueche,
     'Desinfektionsmittel', 'Hygiene', 'Flasche',
     2, 1, '2026-08-01', 'Sagrotan 2in1 Desinfektions-Spray 500ml');


  -- ============================================================
  -- 6. home_einkaufliste — 8 Einträge (5 offen, 3 erledigt)
  -- ============================================================
  INSERT INTO public.home_einkaufliste
    (id, user_id, household_id, vorrat_id, name, menge, einheit, kategorie,
     erledigt, erledigt_am, notizen) VALUES

    -- Offen (3 verknüpft mit unterkritischen Vorräten)
    (gen_random_uuid(), v_user_id, v_household_id, v_vorrat_klopapier,
     'Klopapier', 8, 'Rolle', 'Haushalt',
     false, NULL, '3-lagig, am besten Zewa Plus'),

    (gen_random_uuid(), v_user_id, v_household_id, v_vorrat_kaffee,
     'Kaffeebohnen', 1, 'kg', 'Lebensmittel',
     false, NULL, 'Jacobs Crema ganze Bohne – nicht gemahlen!'),

    (gen_random_uuid(), v_user_id, v_household_id, v_vorrat_geschirrspueltabs,
     'Geschirrspültabs', 40, 'Stück', 'Reinigung',
     false, NULL, 'Finish All in 1 Mega-Pack wenn möglich'),

    -- Offen (manuell hinzugefügt)
    (gen_random_uuid(), v_user_id, v_household_id, NULL,
     'Avocados', 3, 'Stück', 'Lebensmittel',
     false, NULL, 'Reif kaufen oder 2 Tage bei Raumtemperatur nachreifen lassen'),

    (gen_random_uuid(), v_user_id, v_household_id, NULL,
     'Tonic Water', 6, 'Flasche', 'Lebensmittel',
     false, NULL, 'Schweppes oder Fever Tree Premium'),

    -- Erledigt
    (gen_random_uuid(), v_user_id, v_household_id, NULL,
     'Vollmilch 3,5%', 2, 'Liter', 'Lebensmittel',
     true, NOW() - INTERVAL '1 day', NULL),

    (gen_random_uuid(), v_user_id, v_household_id, NULL,
     'Vollkornbrot', 1, 'Stück', 'Lebensmittel',
     true, NOW() - INTERVAL '1 day', 'Beim Bäcker, nicht vom Supermarkt'),

    (gen_random_uuid(), v_user_id, v_household_id, v_vorrat_shampoo,
     'Shampoo', 2, 'Flasche', 'Hygiene',
     true, NOW() - INTERVAL '3 days', NULL);


  -- ============================================================
  -- 7. home_geraete — 7 Geräte (1 Wartung überfällig!)
  -- ============================================================
  v_geraet_waschmaschine   := gen_random_uuid();
  v_geraet_geschirrspueler := gen_random_uuid();
  v_geraet_heizung         := gen_random_uuid();
  v_geraet_auto            := gen_random_uuid();
  v_geraet_staubsauger     := gen_random_uuid();
  v_geraet_kaffeemaschine  := gen_random_uuid();
  v_geraet_rauchmelder     := gen_random_uuid();

  INSERT INTO public.home_geraete
    (id, user_id, household_id, lagerort_id, name, hersteller, modell, seriennummer,
     kaufdatum, kaufpreis, garantie_bis,
     naechste_wartung, wartungsintervall_monate, notizen) VALUES

    (v_geraet_waschmaschine, v_user_id, v_household_id, NULL,
     'Waschmaschine', 'Bosch', 'Serie 6 WAU28S40', 'WM-BOS-2023-4421',
     '2023-09-01', 699.00, '2026-09-01',
     CURRENT_DATE + 60, 12,
     'Flusensieb monatlich reinigen. Trommel-Hygienespülung monatlich bei 90°C.'),

    -- ÜBERFÄLLIG: naechste_wartung in der Vergangenheit!
    (v_geraet_geschirrspueler, v_user_id, v_household_id, NULL,
     'Geschirrspüler', 'Siemens', 'iQ500 SN65ZX10AE', 'GS-SIE-2022-7788',
     '2022-06-15', 579.00, '2025-06-15',
     CURRENT_DATE - 30, 12,
     '⚠️ ÜBERFÄLLIG! Salz + Klarspüler nachfüllen, Filter unten reinigen, Sprüharme prüfen.'),

    (v_geraet_heizung, v_user_id, v_household_id, NULL,
     'Gasheizung', 'Vaillant', 'ecoTEC plus VHR 20/5-5', 'HZ-VAI-2020-1122',
     '2020-10-01', 2800.00, '2023-10-01',
     CURRENT_DATE + 240, 12,
     'Jährliche Wartung durch Installateur Maier GmbH, Tel: 01 234 5678. Letzte Wartung: Oktober 2025.'),

    (v_geraet_auto, v_user_id, v_household_id, v_lager_reifen,
     'VW Golf 8 GTI', 'Volkswagen', 'Golf 8 2.0 TSI DSG', 'WVWZZZ1KZMW123456',
     '2021-04-20', 38500.00, '2024-04-20',
     CURRENT_DATE + 30, 12,
     'Nächster Service bei 80.000 km. Serviceheft im Handschuhfach. Autohaus Müller, Tel: 01 987 6543.'),

    (v_geraet_staubsauger, v_user_id, v_household_id, NULL,
     'Akkusauger', 'Dyson', 'V15 Detect Absolute', 'DY-V15-2024-3311',
     '2024-03-10', 649.00, '2026-03-10',
     NULL, NULL,
     'Vor-/Nachfilter alle 3 Monate unter Wasser reinigen und 24h trocknen lassen.'),

    (v_geraet_kaffeemaschine, v_user_id, v_household_id, NULL,
     'Kaffeevollautomat', 'De''Longhi', 'Magnifica Evo ECAM290.51.B', 'DL-MAG-2025-5544',
     '2025-12-24', 449.00, '2027-12-24',
     NULL, NULL,
     'Entkalkung ca. alle 2 Monate (Anzeige beachten). EcoDecalk 500ml verwenden. Reinigungstabs im Vorratschrank.'),

    (v_geraet_rauchmelder, v_user_id, v_household_id, NULL,
     'Rauchmelder (4 Stück)', 'Hekatron', 'Genius Plus', 'RD-HEK-2024-0011',
     '2024-02-01', 79.00, NULL,
     CURRENT_DATE + 335, 12,
     '4 Stück montiert: Wohnzimmer, Schlafzimmer, Flur, Küche. Monatlich testen. Batterien 10-Jahres-Typ.');


  -- ============================================================
  -- 8. home_wartungen — 6 vergangene Wartungsprotokolle
  -- ============================================================
  INSERT INTO public.home_wartungen
    (id, user_id, household_id, geraet_id, datum, typ, beschreibung,
     kosten, durchgefuehrt_von, naechste_faelligkeit) VALUES

    (gen_random_uuid(), v_user_id, v_household_id, v_geraet_waschmaschine,
     '2025-03-10', 'Reinigung',
     'Flusensieb gereinigt, Dichtgummi Türe mit Sanitärspray behandelt, Trommel-Hygienespülung bei 90°C durchgeführt.',
     0.00, 'Selbst durchgeführt',
     '2026-03-10'),

    (gen_random_uuid(), v_user_id, v_household_id, v_geraet_heizung,
     '2025-10-15', 'Wartung',
     'Jährliche Gasheizungswartung: Brenner gereinigt, Wärmetauscher geprüft, Abgasmessung, Sicherheitsventil getestet, Druckausgleichsgefäß geprüft.',
     189.00, 'Maier Installationen GmbH',
     '2026-10-15'),

    (gen_random_uuid(), v_user_id, v_household_id, v_geraet_auto,
     '2025-09-05', 'Inspektion',
     'Großer Service bei 60.000 km: Motoröl + Filter gewechselt, Bremsbeläge vorne + hinten geprüft (vorne erneuert), Luftfilter gewechselt, Reifenwechsel auf Winterbereifung, HU + AU bestanden.',
     680.00, 'VW Autohaus Müller, 1140 Wien',
     '2026-09-05'),

    (gen_random_uuid(), v_user_id, v_household_id, v_geraet_geschirrspueler,
     '2025-02-20', 'Reparatur',
     'Umwälzpumpe durch Fremdkörper (Flaschenverschluss) blockiert – gereinigt. Türdichtung links erneuert. Sprüharm oben neu justiert.',
     120.00, 'Siemens Kundendienst Wien',
     '2026-02-20'),

    (gen_random_uuid(), v_user_id, v_household_id, v_geraet_auto,
     '2025-04-08', 'Reifenwechsel',
     'Winterreifen auf Sommerreifen gewechselt. Reifendruck eingestellt: 2,3 bar vorne, 2,1 bar hinten.',
     45.00, 'VW Autohaus Müller, 1140 Wien',
     '2025-10-15'),

    (gen_random_uuid(), v_user_id, v_household_id, v_geraet_waschmaschine,
     '2025-09-12', 'Reinigung',
     'Halbjahres-Reinigung: Flusensieb, Einspülschublade und Tür-Dichtung gereinigt. Hygienespülung durchgeführt.',
     0.00, 'Selbst durchgeführt',
     '2026-03-10');


  -- ============================================================
  -- 9. home_projekte — 3 Projekte
  -- ============================================================
  v_projekt_balkon := gen_random_uuid();
  v_projekt_bad    := gen_random_uuid();
  v_projekt_winter := gen_random_uuid();

  INSERT INTO public.home_projekte
    (id, user_id, household_id, name, typ, status, beschreibung,
     startdatum, zieldatum, budget, farbe, notizen) VALUES

    (v_projekt_balkon, v_user_id, v_household_id,
     'Balkon bepflanzen & gestalten', 'Dekoration', 'in_bearbeitung',
     'Balkon mit Hochbeeten, Kräutergarten und Outdoor-Sitzecke verschönern. Bistrotisch + 2 Stühle geplant.',
     '2026-03-01', '2026-05-15', 350.00, '#10B981',
     'Tomaten (2x), Basilikum, Petersilie, Minze, Schnittlauch. Bistrotisch bei IKEA bestellt – Lieferung KW 13.'),

    (v_projekt_bad, v_user_id, v_household_id,
     'Badezimmer renovieren', 'Renovierung', 'geplant',
     'Alte Fliesen streichen, neue Armaturen (Waschtisch + Dusche), Spiegel mit LED-Beleuchtung.',
     '2026-06-01', '2026-07-31', 2500.00, '#6366F1',
     'Angebote von 3 Handwerkern einholen. Fliesenlack Farbe: Weiß Matt. Armaturen: Grohe oder Hansgrohe.'),

    (v_projekt_winter, v_user_id, v_household_id,
     'Winterklamotten einlagern', 'Saisonwechsel', 'abgeschlossen',
     'Winterkleidung, Skisachen und Weihnachtsdeko in den Keller eingelagert. Sommersachen rausgeholt.',
     '2026-02-15', '2026-02-28', 0.00, '#F97316',
     'Erledigt am 28.02.! Vakuumbeutel für Daunenjacken verwendet. Mottenkugeln in den Kleiderbeutel.');


  -- ============================================================
  -- 10. budget_posten (app_modus = 'home')
  --     12 Monate (April 2025 – März 2026)
  --     Kategorien: Lebensmittel, Haushalt, Reparaturen, Abonnements,
  --                Versicherungen, Einrichtung, Rücklagen, Sonstiges
  -- ============================================================

  -- ──────────────────────────────────────────────────────────────
  -- APRIL 2025
  -- ──────────────────────────────────────────────────────────────
  INSERT INTO public.budget_posten
    (id, user_id, household_id, app_modus, beschreibung, betrag, datum, kategorie, wiederholen, intervall, naechstes_datum) VALUES
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Miete inkl. Betriebskosten', -1100.00, '2025-04-01', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Fitnessstudio FitInn', -39.00, '2025-04-01', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Netflix', -12.99, '2025-04-05', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Spotify Family', -9.99, '2025-04-05', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Handyvertrag A1 (15 GB Flat)', -25.00, '2025-04-08', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Amazon Prime Jahresmitglied', -89.90, '2025-04-10', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Strom & Gas Wien Energie', -75.00, '2025-04-10', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Kfz-Haftpflicht Zurich', -180.00, '2025-04-01', 'Versicherungen', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Haushaltsversicherung Generali', -210.00, '2025-04-15', 'Versicherungen', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Supermarkt Billa', -395.00, '2025-04-15', 'Lebensmittel', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Drogerie dm', -48.00, '2025-04-22', 'Lebensmittel', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'IKEA – Balkon Bistrotisch + 2 Stühle', -119.00, '2025-04-20', 'Einrichtung', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Reifenwechsel Winter→Sommer (Autohaus)', -45.00, '2025-04-08', 'Reparaturen', false, NULL, NULL);

  -- ──────────────────────────────────────────────────────────────
  -- MAI 2025
  -- ──────────────────────────────────────────────────────────────
  INSERT INTO public.budget_posten
    (id, user_id, household_id, app_modus, beschreibung, betrag, datum, kategorie, wiederholen, intervall, naechstes_datum) VALUES
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Miete inkl. Betriebskosten', -1100.00, '2025-05-01', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Fitnessstudio FitInn', -39.00, '2025-05-01', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Netflix', -12.99, '2025-05-05', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Spotify Family', -9.99, '2025-05-05', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Handyvertrag A1 (15 GB Flat)', -25.00, '2025-05-08', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Strom & Gas Wien Energie', -70.00, '2025-05-10', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Supermarkt Billa', -380.00, '2025-05-15', 'Lebensmittel', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Drogerie dm', -42.00, '2025-05-20', 'Lebensmittel', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Restaurant Gasthof Pötzleinsdorf (Geburtstag)', -68.00, '2025-05-24', 'Sonstiges', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Blumenpflanzen Balkongarten', -55.00, '2025-05-10', 'Einrichtung', false, NULL, NULL);

  -- ──────────────────────────────────────────────────────────────
  -- JUNI 2025
  -- ──────────────────────────────────────────────────────────────
  INSERT INTO public.budget_posten
    (id, user_id, household_id, app_modus, beschreibung, betrag, datum, kategorie, wiederholen, intervall, naechstes_datum) VALUES
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Miete inkl. Betriebskosten', -1100.00, '2025-06-01', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Fitnessstudio FitInn', -39.00, '2025-06-01', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Netflix', -12.99, '2025-06-05', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Spotify Family', -9.99, '2025-06-05', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Handyvertrag A1 (15 GB Flat)', -25.00, '2025-06-08', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Strom & Gas Wien Energie', -65.00, '2025-06-10', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Supermarkt Billa', -405.00, '2025-06-14', 'Lebensmittel', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Drogerie dm', -55.00, '2025-06-20', 'Lebensmittel', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Kleidung Sommer (Zara, H&M)', -89.00, '2025-06-15', 'Sonstiges', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Arztrechnung Allgemeinmedizin', -35.00, '2025-06-18', 'Sonstiges', false, NULL, NULL);

  -- ──────────────────────────────────────────────────────────────
  -- JULI 2025
  -- ──────────────────────────────────────────────────────────────
  INSERT INTO public.budget_posten
    (id, user_id, household_id, app_modus, beschreibung, betrag, datum, kategorie, wiederholen, intervall, naechstes_datum) VALUES
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Miete inkl. Betriebskosten', -1100.00, '2025-07-01', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Fitnessstudio FitInn', -39.00, '2025-07-01', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Netflix', -12.99, '2025-07-05', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Spotify Family', -9.99, '2025-07-05', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Handyvertrag A1 (15 GB Flat)', -25.00, '2025-07-08', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Strom & Gas Wien Energie', -68.00, '2025-07-10', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Kfz-Haftpflicht Zurich', -180.00, '2025-07-01', 'Versicherungen', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Haushaltsversicherung Generali', -210.00, '2025-07-15', 'Versicherungen', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Supermarkt Billa (Vorräte vor Urlaub)', -450.00, '2025-07-10', 'Lebensmittel', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Drogerie dm (Sonnencreme + Reiseapotheke)', -65.00, '2025-07-18', 'Lebensmittel', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Urlaub Griechenland – Hotel + Flug', -850.00, '2025-07-20', 'Sonstiges', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Mietwagen Griechenland', -180.00, '2025-07-22', 'Sonstiges', false, NULL, NULL);

  -- ──────────────────────────────────────────────────────────────
  -- AUGUST 2025
  -- ──────────────────────────────────────────────────────────────
  INSERT INTO public.budget_posten
    (id, user_id, household_id, app_modus, beschreibung, betrag, datum, kategorie, wiederholen, intervall, naechstes_datum) VALUES
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Miete inkl. Betriebskosten', -1100.00, '2025-08-01', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Fitnessstudio FitInn', -39.00, '2025-08-01', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Netflix', -12.99, '2025-08-05', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Spotify Family', -9.99, '2025-08-05', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Handyvertrag A1 (15 GB Flat)', -25.00, '2025-08-08', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Strom & Gas Wien Energie', -70.00, '2025-08-10', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Supermarkt Billa', -410.00, '2025-08-15', 'Lebensmittel', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Drogerie dm', -38.00, '2025-08-22', 'Lebensmittel', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'IKEA – Wandregal Arbeitszimmer', -149.00, '2025-08-10', 'Einrichtung', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Fahrradreparatur (Reifenpanne)', -28.00, '2025-08-17', 'Reparaturen', false, NULL, NULL);

  -- ──────────────────────────────────────────────────────────────
  -- SEPTEMBER 2025
  -- ──────────────────────────────────────────────────────────────
  INSERT INTO public.budget_posten
    (id, user_id, household_id, app_modus, beschreibung, betrag, datum, kategorie, wiederholen, intervall, naechstes_datum) VALUES
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Miete inkl. Betriebskosten', -1100.00, '2025-09-01', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Fitnessstudio FitInn', -39.00, '2025-09-01', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Netflix', -12.99, '2025-09-05', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Spotify Family', -9.99, '2025-09-05', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Handyvertrag A1 (15 GB Flat)', -25.00, '2025-09-08', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Strom & Gas Wien Energie', -78.00, '2025-09-10', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Supermarkt Billa', -390.00, '2025-09-15', 'Lebensmittel', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Drogerie dm', -52.00, '2025-09-22', 'Lebensmittel', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'KFZ-Inspektion großer Service 60.000 km', -680.00, '2025-09-05', 'Reparaturen', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Apotheke', -35.00, '2025-09-18', 'Sonstiges', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Neue Sportschuhe (Laufen)', -89.00, '2025-09-28', 'Sonstiges', false, NULL, NULL);

  -- ──────────────────────────────────────────────────────────────
  -- OKTOBER 2025
  -- ──────────────────────────────────────────────────────────────
  INSERT INTO public.budget_posten
    (id, user_id, household_id, app_modus, beschreibung, betrag, datum, kategorie, wiederholen, intervall, naechstes_datum) VALUES
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Miete inkl. Betriebskosten', -1100.00, '2025-10-01', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Fitnessstudio FitInn', -39.00, '2025-10-01', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Netflix', -12.99, '2025-10-05', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Spotify Family', -9.99, '2025-10-05', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Handyvertrag A1 (15 GB Flat)', -25.00, '2025-10-08', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Strom & Gas Wien Energie', -92.00, '2025-10-10', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Kfz-Haftpflicht Zurich', -180.00, '2025-10-01', 'Versicherungen', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Haushaltsversicherung Generali', -210.00, '2025-10-15', 'Versicherungen', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Supermarkt Billa', -405.00, '2025-10-15', 'Lebensmittel', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Drogerie dm', -45.00, '2025-10-22', 'Lebensmittel', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Jährliche Gasheizungswartung', -189.00, '2025-10-15', 'Reparaturen', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Winterjacke Columbia (Sale)', -69.00, '2025-10-20', 'Sonstiges', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Reifenwechsel Sommer→Winter', -45.00, '2025-10-18', 'Reparaturen', false, NULL, NULL);

  -- ──────────────────────────────────────────────────────────────
  -- NOVEMBER 2025
  -- ──────────────────────────────────────────────────────────────
  INSERT INTO public.budget_posten
    (id, user_id, household_id, app_modus, beschreibung, betrag, datum, kategorie, wiederholen, intervall, naechstes_datum) VALUES
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Miete inkl. Betriebskosten', -1100.00, '2025-11-01', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Fitnessstudio FitInn', -39.00, '2025-11-01', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Netflix', -12.99, '2025-11-05', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Spotify Family', -9.99, '2025-11-05', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Handyvertrag A1 (15 GB Flat)', -25.00, '2025-11-08', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Strom & Gas Wien Energie', -110.00, '2025-11-10', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Supermarkt Billa', -430.00, '2025-11-15', 'Lebensmittel', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Drogerie dm', -58.00, '2025-11-20', 'Lebensmittel', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Black Friday – Dyson Staubsauger Zubehör', -89.00, '2025-11-28', 'Einrichtung', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Black Friday – Kleidung Online-Shop', -150.00, '2025-11-28', 'Sonstiges', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Restaurant Figlmüller (Abendessen)', -85.00, '2025-11-15', 'Sonstiges', false, NULL, NULL);

  -- ──────────────────────────────────────────────────────────────
  -- DEZEMBER 2025
  -- ──────────────────────────────────────────────────────────────
  INSERT INTO public.budget_posten
    (id, user_id, household_id, app_modus, beschreibung, betrag, datum, kategorie, wiederholen, intervall, naechstes_datum) VALUES
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Miete inkl. Betriebskosten', -1100.00, '2025-12-01', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Fitnessstudio FitInn', -39.00, '2025-12-01', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Netflix', -12.99, '2025-12-05', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Spotify Family', -9.99, '2025-12-05', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Handyvertrag A1 (15 GB Flat)', -25.00, '2025-12-08', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Strom & Gas Wien Energie', -135.00, '2025-12-10', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Supermarkt Billa (inkl. Weihnachten)', -520.00, '2025-12-15', 'Lebensmittel', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Drogerie dm (Weihnachtsgeschenke)', -65.00, '2025-12-20', 'Lebensmittel', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'De''Longhi Kaffeevollautomat (Weihnachten)', -449.00, '2025-12-24', 'Einrichtung', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Weihnachtsgeschenke Familie', -280.00, '2025-12-20', 'Sonstiges', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Restaurant Weihnachtsessen', -95.00, '2025-12-23', 'Sonstiges', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Silvesterfest – Lebensmittel & Getränke', -120.00, '2025-12-30', 'Lebensmittel', false, NULL, NULL);

  -- ──────────────────────────────────────────────────────────────
  -- JANUAR 2026
  -- ──────────────────────────────────────────────────────────────
  INSERT INTO public.budget_posten
    (id, user_id, household_id, app_modus, beschreibung, betrag, datum, kategorie, wiederholen, intervall, naechstes_datum) VALUES
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Miete inkl. Betriebskosten', -1100.00, '2026-01-01', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Fitnessstudio FitInn', -39.00, '2026-01-01', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Netflix', -12.99, '2026-01-05', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Spotify Family', -9.99, '2026-01-05', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Handyvertrag A1 (15 GB Flat)', -25.00, '2026-01-08', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Strom & Gas Wien Energie', -142.00, '2026-01-10', 'Haushalt', false, NULL, NULL),
    -- Vierteljährliche Zahlungen (letztes Q1-Zahlung, naechstes_datum auf April 2026 für Dashboard-Preview)
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Kfz-Haftpflicht Zurich', -180.00, '2026-01-01', 'Versicherungen',
     true, 'Vierteljährlich', '2026-04-01'),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Haushaltsversicherung Generali', -210.00, '2026-01-15', 'Versicherungen',
     true, 'Vierteljährlich', '2026-04-15'),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Supermarkt Billa', -375.00, '2026-01-15', 'Lebensmittel', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Drogerie dm', -48.00, '2026-01-20', 'Lebensmittel', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Skiurlaub Tirol – Unterkunft + Skischulbus', -420.00, '2026-01-18', 'Sonstiges', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Arztrechnung Allgemeinmedizin', -45.00, '2026-01-22', 'Sonstiges', false, NULL, NULL);

  -- ──────────────────────────────────────────────────────────────
  -- FEBRUAR 2026
  -- ──────────────────────────────────────────────────────────────
  INSERT INTO public.budget_posten
    (id, user_id, household_id, app_modus, beschreibung, betrag, datum, kategorie, wiederholen, intervall, naechstes_datum) VALUES
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Miete inkl. Betriebskosten', -1100.00, '2026-02-01', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Fitnessstudio FitInn', -39.00, '2026-02-01', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Netflix', -12.99, '2026-02-05', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Spotify Family', -9.99, '2026-02-05', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Handyvertrag A1 (15 GB Flat)', -25.00, '2026-02-08', 'Abonnements', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Strom & Gas Wien Energie', -128.00, '2026-02-10', 'Haushalt', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Supermarkt Billa', -360.00, '2026-02-15', 'Lebensmittel', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Drogerie dm', -42.00, '2026-02-20', 'Lebensmittel', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'IKEA – Kallax Regal + Einsätze', -89.00, '2026-02-10', 'Einrichtung', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Geschirrspüler Reparatur (Siemens Kundendienst)', -120.00, '2026-02-20', 'Reparaturen', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Valentinstag – Restaurant', -75.00, '2026-02-14', 'Sonstiges', false, NULL, NULL);

  -- ──────────────────────────────────────────────────────────────
  -- MÄRZ 2026 (aktueller Monat – wiederkehrende Posten aktiv)
  -- ──────────────────────────────────────────────────────────────
  INSERT INTO public.budget_posten
    (id, user_id, household_id, app_modus, beschreibung, betrag, datum, kategorie, wiederholen, intervall, naechstes_datum) VALUES
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Miete inkl. Betriebskosten', -1100.00, '2026-03-01', 'Haushalt',
     true, 'Monatlich', '2026-04-01'),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Fitnessstudio FitInn', -39.00, '2026-03-01', 'Haushalt',
     true, 'Monatlich', '2026-04-01'),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Netflix', -12.99, '2026-03-05', 'Abonnements',
     true, 'Monatlich', '2026-04-05'),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Spotify Family', -9.99, '2026-03-05', 'Abonnements',
     true, 'Monatlich', '2026-04-05'),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Handyvertrag A1 (15 GB Flat)', -25.00, '2026-03-08', 'Abonnements',
     true, 'Monatlich', '2026-04-08'),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Strom & Gas Wien Energie', -105.00, '2026-03-10', 'Haushalt',
     true, 'Monatlich', '2026-04-10'),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Supermarkt Billa', -395.00, '2026-03-14', 'Lebensmittel',
     true, 'Monatlich', '2026-04-14'),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Drogerie dm', -52.00, '2026-03-20', 'Lebensmittel', false, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Arztrechnung Allgemeinmedizin', -45.00, '2026-03-05', 'Sonstiges', false, NULL, NULL),
    -- Amazon Prime Jahresbeitrag (jährlich, nächste Fälligkeit April 2026!)
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Amazon Prime Jahresmitglied', -89.90, '2025-04-10', 'Abonnements',
     true, 'Jährlich', '2026-04-10'),
    (gen_random_uuid(), v_user_id, v_household_id, 'home', 'Balkongarten Pflanzen & Erde', -78.00, '2026-03-14', 'Einrichtung', false, NULL, NULL);


  -- ============================================================
  -- 11. todo_aufgaben (app_modus = 'home') — 12 Aufgaben
  -- ============================================================
  INSERT INTO public.todo_aufgaben
    (id, user_id, household_id, app_modus, beschreibung, kategorie, prioritaet,
     erledigt, faelligkeitsdatum, wiederholung_typ, home_projekt_id, bewohner_id) VALUES

    -- Hoch + dringlich
    (gen_random_uuid(), v_user_id, v_household_id, 'home',
     'Kellerraum aufräumen und neu organisieren', 'Organisation', 'Hoch',
     false, CURRENT_DATE + 3, 'Keine', NULL, NULL),

    (gen_random_uuid(), v_user_id, v_household_id, 'home',
     'Reifenwechsel Winter→Sommer beauftragen (Autohaus Müller)', 'Wartung', 'Hoch',
     false, CURRENT_DATE + 7, 'Keine', NULL, v_bewohner_max),

    -- Mittel + fällig
    (gen_random_uuid(), v_user_id, v_household_id, 'home',
     'Rauchmelder testen – alle 4 Stück prüfen', 'Wartung', 'Mittel',
     false, CURRENT_DATE + 2, 'Monatlich', NULL, NULL),

    (gen_random_uuid(), v_user_id, v_household_id, 'home',
     'Geschirrspüler: Filter reinigen + Salz + Klarspüler nachfüllen', 'Reparatur', 'Mittel',
     false, CURRENT_DATE + 1, 'Monatlich', NULL, NULL),

    (gen_random_uuid(), v_user_id, v_household_id, 'home',
     'Pflanzen für Balkon-Hochbeet besorgen (Tomaten, Kräuter)', 'Einkauf', 'Mittel',
     false, CURRENT_DATE + 14, 'Keine', v_projekt_balkon, v_bewohner_anna),

    (gen_random_uuid(), v_user_id, v_household_id, 'home',
     'Mind. 3 Handwerker-Angebote für Badrenovierung einholen', 'Reparatur', 'Mittel',
     false, CURRENT_DATE + 21, 'Keine', v_projekt_bad, NULL),

    (gen_random_uuid(), v_user_id, v_household_id, 'home',
     'Kfz-Versicherung Kündigung prüfen – Ablauf April 2026', 'Verwaltung', 'Mittel',
     false, CURRENT_DATE + 10, 'Keine', NULL, NULL),

    -- Niedrig
    (gen_random_uuid(), v_user_id, v_household_id, 'home',
     'Garderobe ausmisten – Kleidung für Caritas-Sammlung April', 'Organisation', 'Niedrig',
     false, NULL, 'Keine', NULL, NULL),

    -- Erledigt
    (gen_random_uuid(), v_user_id, v_household_id, 'home',
     'Winterklamotten + Skisachen in Keller einlagern', 'Organisation', 'Mittel',
     true, '2026-02-28', 'Keine', v_projekt_winter, NULL),

    (gen_random_uuid(), v_user_id, v_household_id, 'home',
     'Neue Kaffeemaschine einrichten + erste Tasse machen', 'Haushalt', 'Niedrig',
     true, '2025-12-26', 'Keine', NULL, NULL),

    (gen_random_uuid(), v_user_id, v_household_id, 'home',
     'Wocheneinkauf planen und Einkaufsliste erstellen', 'Einkauf', 'Niedrig',
     true, CURRENT_DATE - 1, 'Wöchentlich', NULL, NULL),

    (gen_random_uuid(), v_user_id, v_household_id, 'home',
     'Gasheizung Jahreswartung terminieren', 'Wartung', 'Hoch',
     true, '2025-10-01', 'Keine', NULL, NULL);


  -- ============================================================
  -- 12. home_verlauf — 12 Aktivitätseinträge (letzte 14 Tage)
  -- ============================================================
  INSERT INTO public.home_verlauf
    (id, user_id, household_id, tabelle, datensatz_name, aktion, created_at) VALUES

    (gen_random_uuid(), v_user_id, v_household_id,
     'home_objekte',   'Samsung QLED TV 55"',          'erstellt',  NOW() - INTERVAL '14 days'),

    (gen_random_uuid(), v_user_id, v_household_id,
     'home_geraete',   'Waschmaschine',                 'erstellt',  NOW() - INTERVAL '12 days'),

    (gen_random_uuid(), v_user_id, v_household_id,
     'home_geraete',   'VW Golf 8 GTI',                 'erstellt',  NOW() - INTERVAL '12 days'),

    (gen_random_uuid(), v_user_id, v_household_id,
     'home_vorraete',  'Kaffeebohnen',                  'erstellt',  NOW() - INTERVAL '10 days'),

    (gen_random_uuid(), v_user_id, v_household_id,
     'home_projekte',  'Balkon bepflanzen & gestalten', 'erstellt',  NOW() - INTERVAL '8 days'),

    (gen_random_uuid(), v_user_id, v_household_id,
     'budget_posten',  'Miete März 2026',               'erstellt',  NOW() - INTERVAL '7 days'),

    (gen_random_uuid(), v_user_id, v_household_id,
     'home_wissen',    'Wandfarben Wohnung',            'erstellt',  NOW() - INTERVAL '6 days'),

    (gen_random_uuid(), v_user_id, v_household_id,
     'home_objekte',   'Bosch Winkelschleifer',         'geaendert', NOW() - INTERVAL '5 days'),

    (gen_random_uuid(), v_user_id, v_household_id,
     'home_projekte',  'Winterklamotten einlagern',     'geaendert', NOW() - INTERVAL '3 days'),

    (gen_random_uuid(), v_user_id, v_household_id,
     'home_einkaufliste', 'Vollmilch 3,5%',            'geaendert', NOW() - INTERVAL '1 day'),

    (gen_random_uuid(), v_user_id, v_household_id,
     'budget_posten',  'Balkongarten Pflanzen & Erde',  'erstellt',  NOW() - INTERVAL '12 hours'),

    (gen_random_uuid(), v_user_id, v_household_id,
     'home_objekte',   'Canon PIXMA Drucker',           'geaendert', NOW() - INTERVAL '6 hours');


  -- ============================================================
  -- 13. home_wissen — 6 Einträge (alle Kategorien)
  -- ============================================================
  INSERT INTO public.home_wissen
    (id, user_id, household_id, titel, inhalt, kategorie, tags) VALUES

    (gen_random_uuid(), v_user_id, v_household_id,
     'Wandfarben der Wohnung',
     $w1$Wohnzimmer: Alpina "Stilles Wasser" (Graubeige) – Farbcode ALF-2317
Schlafzimmer: Alpina "Sanfter Abend" (Hellgrau) – Farbcode ALF-1089
Küche & Bad: Caparol "Weiß 100" (Reinweiß)
Flur: Alpina "Stilles Wasser" wie Wohnzimmer

Pinselgröße: Roller 18 cm, Pinsel 5 cm für Ecken
Restfarbe: Im Kellerregal A (halbe Dosen als Reserve)$w1$,
     'Farben & Oberflächen',
     ARRAY['Wandfarbe', 'Alpina', 'Wohnzimmer', 'Renovierung']),

    (gen_random_uuid(), v_user_id, v_household_id,
     'Wohnungsmaße',
     $w2$Gesamtfläche: 78 m²

Wohnzimmer:   6,2 m × 4,8 m ≈ 30 m²
Schlafzimmer: 4,5 m × 3,8 m ≈ 17 m²
Arbeitszimmer: 3,5 m × 3,2 m ≈ 11 m²
Küche:        3,8 m × 3,0 m ≈ 11 m²
Bad:          2,5 m × 2,2 m ≈  5 m²
Flur:         4,5 m × 1,5 m ≈  7 m²
Balkon:       4,0 m × 1,8 m ≈  7 m²

Deckenhöhe: 2,70 m durchgehend$w2$,
     'Maße & Abmessungen',
     ARRAY['Grundriss', 'Zimmermaße', 'Wohnung', 'm²']),

    (gen_random_uuid(), v_user_id, v_household_id,
     'WLAN & Router',
     $w3$Router: FRITZ!Box 7590 AX (Wi-Fi 6)
WLAN 2,4 GHz: Muellerhaus_2G
WLAN 5 GHz:   Muellerhaus_5G
Passwort: → im Router-Handbuch (Rückseite)

Admin-Oberfläche: http://fritz.box
Admin-Passwort: → Aufkleber Unterseite Router

Internetanbieter: Magenta Zuhause XL (250 Mbit/s)
Kundennummer: MA-4477-2021
Support: 0800 201 012 0 (kostenlos, Mo–So)$w3$,
     'Geräte-Info',
     ARRAY['WLAN', 'Router', 'Internet', 'FRITZ!Box', 'Passwort']),

    (gen_random_uuid(), v_user_id, v_household_id,
     'Wichtige Kontakte – Wohnung & Haus',
     $w4$Hausmeister: Rudolf Hofmann, Tel: 0664 123 45 67
Hausverwaltung: Immobilien Bauer GmbH, Tel: 01 234 56 78
Installateur (Heizung): Maier Installationen, Tel: 01 987 65 43
Elektriker: Blitz-Elektro Wien, Tel: 0676 543 21 00
Schlüsseldienst Notfall: 0800 700 600 (24h kostenlos)

Müllabfuhr (MA 48 Wien):
  – Restmüll: Dienstag + Freitag
  – Altpapier (Blaue Tonne): Mittwoch
  – Altglas: Container im Hof$w4$,
     'Kontakte & Dienste',
     ARRAY['Hausmeister', 'Notfall', 'Wien', 'Kontakt', 'Müll']),

    (gen_random_uuid(), v_user_id, v_household_id,
     'Kaffeevollautomat De''Longhi – Pflege & Einstellungen',
     $w5$Modell: Magnifica Evo ECAM290.51.B

EINSTELLUNGEN:
  Mahlgrad: Stufe 4 (von 7)
  Kaffeemenge pro Tasse: 8g
  Brühtemperatur: Mittel

TÄGLICHE PFLEGE:
  → Drehriegler auf RINSE vor dem Ausschalten
  → Tropfschale wöchentlich leeren

ENTKALKUNG (ca. alle 2 Monate, bei Anzeige):
  → DeLonghi EcoDecalk 500 ml (= 2 Entkalkungen)
  → Prozess dauert ca. 30 Min – Maschine nicht verlassen
  → Reinigungstabs: DeLonghi DLSC301 (im Vorratschrank)$w5$,
     'Anleitungen',
     ARRAY['DeLonghi', 'Kaffeemaschine', 'Pflege', 'Entkalkung', 'Espresso']),

    (gen_random_uuid(), v_user_id, v_household_id,
     'Lasagne al forno – Familienrezept',
     $w6$Für 4 Personen | Zubereitungszeit: ca. 90 Min

ZUTATEN:
  500 g Hackfleisch (Rind/Schwein gemischt)
  1 Dose Tomaten gestückelt (400 g, Mutti)
  1 Zwiebel, 2 Knoblauchzehen
  250 g Lasagneplatten (keine Vorkochzeit)
  500 ml Béchamelsauce (fertig oder selbst)
  200 g geriebener Gouda oder Mozzarella
  Olivenöl, Salz, Pfeffer, Oregano, Basilikum

ZUBEREITUNG:
  1. Bolognese: Zwiebel + Knoblauch anschwitzen, Hack braun braten,
     Tomaten + Gewürze zugeben, 20 Min köcheln lassen
  2. Auflaufform fetten: Nudelplatten → Bolognese → Béchamel → Käse
     (3–4 Lagen), mit Käse abschließen
  3. 180°C Heißluft, 40 Min backen – letzte 10 Min Oberhitze für Kruste

TIPP: Einen Tag vorher machen – schmeckt aufgewärmt noch besser!$w6$,
     'Rezepte',
     ARRAY['Lasagne', 'Pasta', 'Familienrezept', 'Hackfleisch', 'Lieblingsessen']);


  -- ============================================================
  -- 14. home_budget_limits — 6 Kategorie-Limits
  -- ============================================================
  INSERT INTO public.home_budget_limits
    (id, user_id, household_id, kategorie, limit_euro) VALUES
    (gen_random_uuid(), v_user_id, v_household_id, 'Lebensmittel',   500.00),
    (gen_random_uuid(), v_user_id, v_household_id, 'Haushalt',      1300.00),
    (gen_random_uuid(), v_user_id, v_household_id, 'Abonnements',     90.00),
    (gen_random_uuid(), v_user_id, v_household_id, 'Versicherungen', 200.00),
    (gen_random_uuid(), v_user_id, v_household_id, 'Reparaturen',    150.00),
    (gen_random_uuid(), v_user_id, v_household_id, 'Sonstiges',      200.00);


  -- ============================================================
  -- 15. home_sparziele — 2 Sparziele
  -- ============================================================
  INSERT INTO public.home_sparziele
    (id, user_id, household_id, name, ziel_betrag, aktueller_betrag, zieldatum, farbe, emoji) VALUES
    (gen_random_uuid(), v_user_id, v_household_id,
     'Urlaub Sommer 2026', 3000.00, 850.00, '2026-07-01', '#10B981', '✈️'),
    (gen_random_uuid(), v_user_id, v_household_id,
     'Badrenovierung', 2500.00, 400.00, '2026-06-01', '#6366F1', '🛁');


  RAISE NOTICE '✅ Demo-Daten erfolgreich eingefügt für User: %', v_user_id;
  RAISE NOTICE '   Haushalt-ID: %', v_household_id;
  RAISE NOTICE '   → 3 Orte, 9 Lagerorte';
  RAISE NOTICE '   → 2 Bewohner (Anna, Max)';
  RAISE NOTICE '   → 18 Objekte (alle Status + Kategorien)';
  RAISE NOTICE '   → 12 Vorräte (4 unter Mindestmenge), 8 Einkaufszettel';
  RAISE NOTICE '   → 7 Geräte (1 Wartung überfällig), 6 Wartungsprotokolle';
  RAISE NOTICE '   → 3 Projekte, 12 Aufgaben (4 erledigt)';
  RAISE NOTICE '   → 140+ Budget-Posten (April 2025 – März 2026, 12 Monate)';
  RAISE NOTICE '     Monatlich: Miete, Strom, Fitness, Abos, Lebensmittel';
  RAISE NOTICE '     Vierteljährlich: Kfz + Haushaltsversicherung (nächste: April 2026!)';
  RAISE NOTICE '     Jährlich: Amazon Prime (nächste: April 2026!)';
  RAISE NOTICE '     Einmalig: KFZ-Inspektion, Urlaub, Kaffeemaschine, uvm.';
  RAISE NOTICE '   → 6 Budget-Limits, 2 Sparziele';
  RAISE NOTICE '   → 12 Verlaufeinträge, 6 Wissenseinträge';

END $$;
