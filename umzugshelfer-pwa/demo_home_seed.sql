-- ============================================================
-- Home Organizer Demo-Daten für Demo-User
-- User: demo@demo.com | ID: bc6c7d52-59de-4a7c-a60b-a25434ae9a2a
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

  -- Neuere Home-Organizer-Module
  v_konto_haushalt UUID;
  v_konto_anna     UUID;
  v_budget_tanken  UUID;
  v_budget_service UUID;

  v_dokument_tanken      UUID;
  v_dokument_service     UUID;
  v_dokument_internet    UUID;
  v_dokument_versicherung UUID;
  v_rechnung_tanken      UUID;
  v_rechnung_service     UUID;
  v_vertrag_internet     UUID;
  v_polizze_kfz          UUID;

  v_rezept_lasagne UUID;
  v_rezept_curry   UUID;
  v_rezept_pancakes UUID;

  v_medikament_ibuprofen UUID;

  v_fahrzeug UUID;
  v_tankvorgang_import UUID;
  v_service UUID;
  v_kfz_aufgabe UUID;

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
  DELETE FROM public.home_rezepte      WHERE household_id = v_household_id;
  DELETE FROM public.home_medikamente  WHERE household_id = v_household_id;
  DELETE FROM public.home_fahrzeuge    WHERE household_id = v_household_id;
  DELETE FROM public.vertraege         WHERE household_id = v_household_id;
  DELETE FROM public.versicherungs_polizzen WHERE household_id = v_household_id;
  DELETE FROM public.rechnungen        WHERE household_id = v_household_id;
  DELETE FROM public.dokumente
    WHERE user_id = v_user_id
      AND household_id = v_household_id
      AND storage_pfad LIKE 'demo-seed/%';
  DELETE FROM public.home_budget_view_state WHERE user_id = v_user_id AND household_id = v_household_id;
  DELETE FROM public.home_budget_views      WHERE user_id = v_user_id AND household_id = v_household_id;
  DELETE FROM public.home_budget_categories WHERE household_id = v_household_id;
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
  DELETE FROM public.home_finanzkonten  WHERE household_id = v_household_id;
  DELETE FROM public.todo_aufgaben      WHERE user_id = v_user_id AND app_modus = 'home';

  -- Das Bücherregal wird in einigen Bestandsinstallationen über eine
  -- separate Migration bereitgestellt. Deshalb nur löschen, wenn die
  -- Tabelle tatsächlich vorhanden ist.
  IF to_regclass('public.home_buecher') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.home_buecher WHERE user_id = $1 AND household_id = $2'
      USING v_user_id, v_household_id;
  END IF;


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

  -- ============================================================
  -- 16. Erweiterter Finanzmanager
  -- ============================================================
  v_konto_haushalt := gen_random_uuid();
  v_konto_anna     := gen_random_uuid();

  INSERT INTO public.home_finanzkonten (
    id, household_id, user_id, created_by_user_id, name, konto_typ,
    inhaber_typ, inhaber_bewohner_id, aktiv, farbe, sortierung
  ) VALUES
    (v_konto_haushalt, v_household_id, v_user_id, v_user_id,
     'Gemeinsames Haushaltskonto', 'haushaltskonto', 'household', NULL, true, '#10B981', 10),
    (v_konto_anna, v_household_id, v_user_id, v_user_id,
     'Annas Privatkonto', 'privatkonto', 'bewohner', v_bewohner_anna, true, '#8B5CF6', 20),
    (gen_random_uuid(), v_household_id, v_user_id, v_user_id,
     'Gemeinsame Kreditkarte', 'kreditkarte', 'household', NULL, true, '#06B6D4', 30);

  INSERT INTO public.home_budget_categories (
    id, household_id, name, color, sort_order, is_system, is_active, created_by_user_id
  ) VALUES
    (gen_random_uuid(), v_household_id, 'Lebensmittel', '#10B981', 10, true, true, v_user_id),
    (gen_random_uuid(), v_household_id, 'Hygieneartikel', '#F97316', 20, true, true, v_user_id),
    (gen_random_uuid(), v_household_id, 'Reinigungsmittel', '#06B6D4', 30, true, true, v_user_id),
    (gen_random_uuid(), v_household_id, 'Haushalt', '#3B82F6', 40, true, true, v_user_id),
    (gen_random_uuid(), v_household_id, 'Reparaturen', '#F59E0B', 50, true, true, v_user_id),
    (gen_random_uuid(), v_household_id, 'Abonnements', '#A855F7', 60, true, true, v_user_id),
    (gen_random_uuid(), v_household_id, 'Versicherungen', '#EC4899', 70, true, true, v_user_id),
    (gen_random_uuid(), v_household_id, 'Einrichtung', '#14B8A6', 80, true, true, v_user_id),
    (gen_random_uuid(), v_household_id, 'Tanken', '#0EA5E9', 90, true, true, v_user_id),
    (gen_random_uuid(), v_household_id, 'Medikamente & Gesundheit', '#EF4444', 100, true, true, v_user_id),
    (gen_random_uuid(), v_household_id, 'Freizeit', '#22C55E', 110, true, true, v_user_id),
    (gen_random_uuid(), v_household_id, 'Sonstiges', '#6B7280', 999, true, true, v_user_id);

  INSERT INTO public.home_budget_views (
    id, user_id, household_id, name, is_default, filters
  ) VALUES (
    gen_random_uuid(), v_user_id, v_household_id,
    'Haushalt – laufender Monat', true,
    jsonb_build_object(
      'scope', 'haushalt',
      'period', 'current_month',
      'categories', jsonb_build_array('Lebensmittel', 'Haushalt', 'Tanken', 'Versicherungen')
    )
  );

  INSERT INTO public.home_budget_view_state (
    id, user_id, household_id, current_state
  ) VALUES (
    gen_random_uuid(), v_user_id, v_household_id,
    jsonb_build_object('period', 'current_month', 'scope', 'haushalt')
  );

  v_budget_tanken  := gen_random_uuid();
  v_budget_service := gen_random_uuid();

  INSERT INTO public.budget_posten (
    id, user_id, household_id, app_modus, typ, budget_scope,
    zahlungskonto_id, beschreibung, kategorie, betrag, datum, wiederholen
  ) VALUES
    (v_budget_tanken, v_user_id, v_household_id, 'home', 'ausgabe', 'haushalt',
     v_konto_haushalt, 'Einkauf bei SOCAR', 'Tanken', -54.40, CURRENT_DATE - 3, false),
    (v_budget_service, v_user_id, v_household_id, 'home', 'ausgabe', 'haushalt',
     v_konto_haushalt, 'Jahresservice FastBox', 'Reparaturen', -874.04, CURRENT_DATE - 45, false);

  -- ============================================================
  -- 17. Dokumentarchiv, Rechnungen, Verträge und Versicherungen
  -- Die Demo-Dokumente besitzen absichtlich nur Metadaten. Es wird
  -- keine nicht vorhandene Binärdatei in den Storage geschrieben.
  -- ============================================================
  v_dokument_tanken       := gen_random_uuid();
  v_dokument_service      := gen_random_uuid();
  v_dokument_internet     := gen_random_uuid();
  v_dokument_versicherung := gen_random_uuid();

  INSERT INTO public.dokumente (
    id, user_id, household_id, dateiname, datei_typ, storage_pfad,
    beschreibung, groesse_kb, kategorie, app_modus, dokument_typ,
    tags, meta, extrahierter_text
  ) VALUES
    (v_dokument_tanken, v_user_id, v_household_id,
     'rechnung_socar_demo.pdf', 'application/pdf',
     'demo-seed/rechnung_socar_demo.pdf',
     'Demo-Tankrechnung von SOCAR', 86, 'Rechnungen', 'home', 'invoice',
     ARRAY['Demo', 'Tanken', 'SOCAR'],
     '{"demo_seed":true,"storage_placeholder":true}'::jsonb,
     'SOCAR Tankstelle Wien, Super 95, 34,87 Liter, Gesamt EUR 54,40'),
    (v_dokument_service, v_user_id, v_household_id,
     'fastbox_service_demo.pdf', 'application/pdf',
     'demo-seed/fastbox_service_demo.pdf',
     'Demo-Servicebeleg mit KI-Analyse', 412, 'Kfz', 'home', 'invoice',
     ARRAY['Demo', 'Kfz', 'Service', 'KI-Analyse'],
     '{"demo_seed":true,"storage_placeholder":true}'::jsonb,
     'FastBox Jahresservice: Ölwechsel, Filter, Bremsflüssigkeit, §57a-Überprüfung'),
    (v_dokument_internet, v_user_id, v_household_id,
     'magenta_internetvertrag_demo.pdf', 'application/pdf',
     'demo-seed/magenta_internetvertrag_demo.pdf',
     'Demo-Vertrag für Internet und Festnetz', 220, 'Verträge', 'home', 'contract',
     ARRAY['Demo', 'Vertrag', 'Internet'],
     '{"demo_seed":true,"storage_placeholder":true}'::jsonb,
     'Magenta Zuhause XL, Mindestvertragsdauer 24 Monate, Kündigungsfrist 30 Tage'),
    (v_dokument_versicherung, v_user_id, v_household_id,
     'zurich_kfz_polizze_demo.pdf', 'application/pdf',
     'demo-seed/zurich_kfz_polizze_demo.pdf',
     'Demo-Kfz-Versicherungspolizze', 305, 'Versicherungen', 'home', 'insurance',
     ARRAY['Demo', 'Versicherung', 'Kfz'],
     '{"demo_seed":true,"storage_placeholder":true}'::jsonb,
     'Zurich Kfz-Haftpflicht und Kasko, Polizzennummer ZH-KFZ-2026-4711');

  v_rechnung_tanken  := gen_random_uuid();
  v_rechnung_service := gen_random_uuid();

  INSERT INTO public.rechnungen (
    id, household_id, dokument_id, lieferant_name, rechnungsnummer,
    rechnungsdatum, leistungsdatum, waehrung, netto, ust, brutto,
    confidence, extraktion, raw_text
  ) VALUES
    (v_rechnung_tanken, v_household_id, v_dokument_tanken,
     'SOCAR', 'SOCAR-DEMO-0602', CURRENT_DATE - 3, CURRENT_DATE - 3,
     'EUR', 45.33, 9.07, 54.40, 0.98,
     '{"quelle":"demo_seed","zahlungsart":"Bankomat"}'::jsonb,
     'Super 95 34,87 l x 1,560 EUR = 54,40 EUR'),
    (v_rechnung_service, v_household_id, v_dokument_service,
     'FastBox Wien', 'R7145450', CURRENT_DATE - 45, CURRENT_DATE - 45,
     'EUR', 728.37, 145.67, 874.04, 0.96,
     '{"quelle":"demo_seed","analyse":"kfz-service-analyze","zahlungsart":"Karte"}'::jsonb,
     'Jahresservice inklusive Ölwechsel, Filtern, Bremsflüssigkeit und §57a-Prüfung');

  INSERT INTO public.rechnungs_positionen (
    id, household_id, rechnung_id, pos_nr, beschreibung, menge, einheit,
    einzelpreis, gesamtpreis, ust_satz, klassifikation
  ) VALUES
    (gen_random_uuid(), v_household_id, v_rechnung_tanken, 1,
     'Super 95', 34.872, 'Liter', 1.560, 54.40, 20,
     '{"budget_kategorie":"Tanken","kategorie":"kraftstoff"}'::jsonb),
    (gen_random_uuid(), v_household_id, v_rechnung_service, 1,
     'Jahresservice Arbeitszeit', 2.5, 'Stunde', 96.00, 240.00, 20,
     '{"budget_kategorie":"Reparaturen","kategorie":"arbeit"}'::jsonb),
    (gen_random_uuid(), v_household_id, v_rechnung_service, 2,
     'Motoröl 5W-30', 4.5, 'Liter', 18.90, 85.05, 20,
     '{"budget_kategorie":"Reparaturen","kategorie":"fluessigkeit"}'::jsonb),
    (gen_random_uuid(), v_household_id, v_rechnung_service, 3,
     'Ölfilter und Innenraumfilter', 1, 'Paket', 74.50, 74.50, 20,
     '{"budget_kategorie":"Reparaturen","kategorie":"ersatzteil"}'::jsonb),
    (gen_random_uuid(), v_household_id, v_rechnung_service, 4,
     '§57a-Begutachtung', 1, 'Stück', 89.00, 89.00, 20,
     '{"budget_kategorie":"Reparaturen","kategorie":"pruefung"}'::jsonb),
    (gen_random_uuid(), v_household_id, v_rechnung_service, 5,
     'Bremsflüssigkeit wechseln, Material und weitere Arbeiten', 1, 'Paket',
     385.49, 385.49, 20,
     '{"budget_kategorie":"Reparaturen","kategorie":"arbeit"}'::jsonb);

  -- Rechnungen werden wie in der Anwendung über dokument_links mit
  -- Budgetposten verbunden. budget_posten besitzt bewusst keine
  -- rechnung_id-Spalte, da ein Posten mehrere Belege haben kann.
  INSERT INTO public.dokument_links (
    household_id, dokument_id, entity_type, entity_id, role
  ) VALUES
    (v_household_id, v_dokument_tanken, 'rechnung', v_rechnung_tanken, 'original'),
    (v_household_id, v_dokument_tanken, 'budget_posten', v_budget_tanken, 'receipt'),
    (v_household_id, v_dokument_service, 'rechnung', v_rechnung_service, 'original'),
    (v_household_id, v_dokument_service, 'budget_posten', v_budget_service, 'receipt');

  -- ============================================================
  -- 18. KFZ-Cockpit mit Tankungen, Service, Reifen und Aufgaben
  -- ============================================================
  v_fahrzeug := gen_random_uuid();

  INSERT INTO public.home_fahrzeuge (
    id, household_id, created_by_user_id, name, marke, modell, baujahr,
    kennzeichen, vin, kilometerstand, kraftstoffart, versicherung,
    polizzennummer, pickerl_termin, status, notizen
  ) VALUES (
    v_fahrzeug, v_household_id, v_user_id,
    'Rio – W91211D', 'KIA', 'Rio 1.4 CVVT', 2010,
    'W91211D', 'KNADH511AA6123456', 156100, 'Benzin',
    'Zurich', 'ZH-KFZ-2026-4711', CURRENT_DATE + 230, 'aktiv',
    'Demo-Fahrzeug mit vollständiger Kosten-, Tank- und Servicehistorie.'
  );

  INSERT INTO public.home_fahrzeug_kilometerstaende (
    id, household_id, fahrzeug_id, created_by_user_id, datum,
    kilometerstand, quelle, source_id, notizen
  ) VALUES
    (gen_random_uuid(), v_household_id, v_fahrzeug, v_user_id,
     CURRENT_DATE - 120, 154000, 'manuell', gen_random_uuid(), 'Stand bei erster Volltankung'),
    (gen_random_uuid(), v_household_id, v_fahrzeug, v_user_id,
     CURRENT_DATE - 45, 155300, 'manuell', gen_random_uuid(), 'Kilometerstand beim Jahresservice'),
    (gen_random_uuid(), v_household_id, v_fahrzeug, v_user_id,
     CURRENT_DATE - 3, 156100, 'manuell', gen_random_uuid(), 'Aktueller Kilometerstand');

  INSERT INTO public.home_fahrzeug_tankvorgaenge (
    id, household_id, fahrzeug_id, created_by_user_id, datum, betrag,
    tankstelle, liter, kilometerstand, preis_pro_liter, kraftstoffart,
    quelle, budget_posten_id, rechnung_id, dokument_id, notizen,
    vollgetankt, verbrauch_bestaetigt, tankstatus, tankstatus_quelle
  ) VALUES
    (gen_random_uuid(), v_household_id, v_fahrzeug, v_user_id,
     CURRENT_DATE - 120, 68.40, 'OMV', 45.000, 154000, 1.520, 'Super 95',
     'manuell', NULL, NULL, NULL, 'Erster bestätigter Volltankanker',
     true, true, 'voll', 'manuell'),
    (gen_random_uuid(), v_household_id, v_fahrzeug, v_user_id,
     CURRENT_DATE - 90, 46.50, 'Shell', 30.000, 154500, 1.550, 'Super 95',
     'manuell', NULL, NULL, NULL, 'Zwischentankung',
     false, true, 'teilweise', 'manuell'),
    (gen_random_uuid(), v_household_id, v_fahrzeug, v_user_id,
     CURRENT_DATE - 60, 43.40, 'BP', 28.000, 155050, 1.550, 'Super 95',
     'manuell', NULL, NULL, NULL, 'Volltankung beendet Verbrauchssegment',
     true, true, 'voll', 'manuell'),
    (gen_random_uuid(), v_household_id, v_fahrzeug, v_user_id,
     CURRENT_DATE - 30, 47.20, 'OMV', 30.000, 155650, 1.573, 'Super 95',
     'manuell', NULL, NULL, NULL, 'Bestätigte Volltankung',
     true, true, 'voll', 'manuell');

  v_tankvorgang_import := gen_random_uuid();
  INSERT INTO public.home_fahrzeug_tankvorgaenge (
    id, household_id, fahrzeug_id, created_by_user_id, datum, betrag,
    tankstelle, liter, kilometerstand, preis_pro_liter, kraftstoffart,
    quelle, budget_posten_id, rechnung_id, dokument_id, notizen,
    vollgetankt, verbrauch_bestaetigt, tankstatus, tankstatus_quelle
  ) VALUES (
    v_tankvorgang_import, v_household_id, v_fahrzeug, v_user_id,
    CURRENT_DATE - 3, 54.40, 'SOCAR', 34.872, 156100, 1.560, 'Super 95',
    'rechnung', v_budget_tanken, v_rechnung_tanken, v_dokument_tanken,
    'Automatisch aus dem Budget erkannt; Tankstatus muss noch bestätigt werden.',
    false, false, 'unbekannt', 'import'
  );

  INSERT INTO public.home_fahrzeug_tank_importe (
    id, household_id, budget_posten_id, rechnung_id, dokument_id,
    fahrzeug_id, tankvorgang_id, status, erkennungsgrund, confidence,
    quell_snapshot, resolved_at
  ) VALUES (
    gen_random_uuid(), v_household_id, v_budget_tanken, v_rechnung_tanken,
    v_dokument_tanken, v_fahrzeug, v_tankvorgang_import, 'imported',
    'Budgetkategorie Tanken, Händler SOCAR und Kraftstoffposition erkannt',
    0.99,
    jsonb_build_object(
      'lieferant', 'SOCAR',
      'betrag', 54.40,
      'liter', 34.872,
      'preis_pro_liter', 1.560,
      'datum', (CURRENT_DATE - 3)::text
    ),
    NOW() - INTERVAL '3 days'
  );

  v_service := gen_random_uuid();
  INSERT INTO public.home_fahrzeug_services (
    id, household_id, fahrzeug_id, created_by_user_id, typ, datum,
    leistungsdatum, kilometerstand, kosten, werkstatt, beschreibung,
    naechste_faelligkeit_datum, naechste_faelligkeit_km, dokument_id,
    rechnung_id, budget_posten_id, rechnungsnummer, zahlungsart,
    analyse_meta, notizen
  ) VALUES (
    v_service, v_household_id, v_fahrzeug, v_user_id,
    'Jahresservice und §57a', CURRENT_DATE - 45, CURRENT_DATE - 45,
    155300, 874.04, 'FastBox Wien',
    'Ölwechsel, Filter, Bremsflüssigkeit, Radkontrolle und §57a-Überprüfung.',
    CURRENT_DATE + 320, 170000, v_dokument_service,
    v_rechnung_service, v_budget_service, 'R7145450', 'Karte',
    '{"quelle":"ki_serviceanalyse","confidence":0.96,"warnings":[]}'::jsonb,
    'Räder nach 50 bis 100 km kontrollieren und Radmuttern nachziehen.'
  );

  INSERT INTO public.home_fahrzeug_service_positionen (
    id, household_id, service_id, sortierung, originaltext, beschreibung,
    kategorie, menge, einheit, einzelpreis, gesamtpreis, ust_satz,
    rabatt_betrag, kostenlos, teilenummer, confidence, notizen
  ) VALUES
    (gen_random_uuid(), v_household_id, v_service, 1,
     'Ölwechsel-Plus-Paket', 'Motoröl und Ölfilter gewechselt',
     'arbeit', 1, 'Paket', 240.00, 240.00, 20, 0, false, NULL, 0.99, NULL),
    (gen_random_uuid(), v_household_id, v_service, 2,
     'Motoröl 5W-30 4,5L', 'Motoröl 5W-30',
     'fluessigkeit', 4.5, 'Liter', 18.90, 85.05, 20, 0, false, NULL, 0.98, NULL),
    (gen_random_uuid(), v_household_id, v_service, 3,
     'Ölfilter / Innenraumfilter', 'Ölfilter und Innenraumfilter ersetzt',
     'ersatzteil', 1, 'Paket', 74.50, 74.50, 20, 0, false, 'KIA-FILTER-SET', 0.97, NULL),
    (gen_random_uuid(), v_household_id, v_service, 4,
     '§57a KFZ-Überprüfung', '§57a-Begutachtung durchgeführt',
     'pruefung', 1, 'Stück', 89.00, 89.00, 20, 0, false, NULL, 0.99, NULL),
    (gen_random_uuid(), v_household_id, v_service, 5,
     'Entsorgung Altöl', 'Altöl und gebrauchten Filter fachgerecht entsorgt',
     'entsorgung', 1, 'Pauschale', 0, 0, 20, 12.00, true, NULL, 0.91,
     'Kostenlose Position nach Rabatt');

  INSERT INTO public.dokument_links (
    household_id, dokument_id, entity_type, entity_id, role
  ) VALUES (
    v_household_id, v_dokument_service, 'home_fahrzeug_services', v_service, 'original'
  );

  INSERT INTO public.home_fahrzeug_reifen (
    id, household_id, fahrzeug_id, created_by_user_id, saison, marke,
    groesse, profiltiefe, kaufdatum, lagerort, zustand, montiert_ab,
    naechster_wechsel, austausch_faellig_ab_mm, laufleistung_km,
    kaufpreis, herstellungsjahr, dot_nummer, notizen
  ) VALUES
    (gen_random_uuid(), v_household_id, v_fahrzeug, v_user_id,
     'Sommerreifen', 'Continental PremiumContact 6', '195/55 R16',
     5.8, CURRENT_DATE - 700, 'Am Fahrzeug', 'gut', CURRENT_DATE - 70,
     CURRENT_DATE + 120, 3.0, 18400, 520.00, 2024, '1224',
     'Luftdruck monatlich kontrollieren.'),
    (gen_random_uuid(), v_household_id, v_fahrzeug, v_user_id,
     'Winterreifen', 'Michelin Alpin 6', '195/55 R16',
     6.4, CURRENT_DATE - 950, 'Tiefgarage – Reifenregal', 'gut',
     CURRENT_DATE - 250, CURRENT_DATE + 120, 4.0, 12600, 560.00, 2023, '3623',
     'Auf Alufelgen eingelagert.');

  INSERT INTO public.home_fahrzeug_ausgaben (
    id, household_id, fahrzeug_id, created_by_user_id, datum,
    kategorie, beschreibung, betrag, notizen
  ) VALUES
    (gen_random_uuid(), v_household_id, v_fahrzeug, v_user_id,
     CURRENT_DATE - 160, 'Steuer', 'Motorbezogene Versicherungssteuer', 168.00, 'Jahresanteil'),
    (gen_random_uuid(), v_household_id, v_fahrzeug, v_user_id,
     CURRENT_DATE - 22, 'Parken', 'Parkpickerl Wien', 120.00, 'Gültig für ein Jahr'),
    (gen_random_uuid(), v_household_id, v_fahrzeug, v_user_id,
     CURRENT_DATE - 15, 'Maut', 'Digitale Autobahnvignette', 103.80, NULL);

  v_kfz_aufgabe := gen_random_uuid();
  INSERT INTO public.home_fahrzeug_aufgaben (
    id, household_id, fahrzeug_id, service_id, created_by_user_id,
    titel, beschreibung, status, prioritaet, faellig_am,
    kilometerstand_faellig, quelle, notizen
  ) VALUES
    (v_kfz_aufgabe, v_household_id, v_fahrzeug, v_service, v_user_id,
     'Nächster Ölwechsel', 'Ölwechsel nach Serviceempfehlung durchführen.',
     'offen', 'mittel', CURRENT_DATE + 320, 170000, 'ki_serviceanalyse',
     'Aus dem analysierten Servicebeleg vorgeschlagen.'),
    (gen_random_uuid(), v_household_id, v_fahrzeug, NULL, v_user_id,
     'Winterreifen montieren', 'Termin rechtzeitig vor dem ersten Frost vereinbaren.',
     'offen', 'mittel', CURRENT_DATE + 120, NULL, 'manuell', NULL),
    (gen_random_uuid(), v_household_id, v_fahrzeug, NULL, v_user_id,
     'Tankstatus des SOCAR-Belegs bestätigen',
     'Prüfen, ob der Tank nach dem Tanken bis zum automatischen Zapfpistolen-Stopp voll war.',
     'offen', 'niedrig', CURRENT_DATE + 2, NULL, 'manuell', NULL);

  INSERT INTO public.home_fahrzeug_teile (
    id, household_id, fahrzeug_id, aufgabe_id, created_by_user_id,
    name, teilenummer, menge, einzelpreis, status, bezugsquelle, notizen
  ) VALUES
    (gen_random_uuid(), v_household_id, v_fahrzeug, v_kfz_aufgabe, v_user_id,
     'Ölfilter', 'KIA-26300-35505', 1, 14.90, 'benoetigt', 'Autoteile Wien', NULL),
    (gen_random_uuid(), v_household_id, v_fahrzeug, v_kfz_aufgabe, v_user_id,
     'Motoröl 5W-30', NULL, 5, 12.50, 'vorhanden', 'Garage – Werkzeugschrank',
     'Fünf Liter Reserve vorhanden.');

  v_vertrag_internet := gen_random_uuid();
  INSERT INTO public.vertraege (
    id, household_id, dokument_id, partner, vertragstitel, start_date,
    end_date, kuendigungsfrist_raw, kuendigungsfrist_tage, kuendigbar_ab,
    review_required, reviewed_at, classification_confidence,
    extraction_confidence, extraktion
  ) VALUES (
    v_vertrag_internet, v_household_id, v_dokument_internet,
    'Magenta Telekom', 'Zuhause XL Internet',
    CURRENT_DATE - 420, CURRENT_DATE + 310, '30 Tage zum Vertragsende',
    30, CURRENT_DATE + 280, false, NOW(), 0.97, 0.95,
    '{"tarif":"250 Mbit/s","monatlich":39.90,"quelle":"demo_seed"}'::jsonb
  );

  v_polizze_kfz := gen_random_uuid();
  INSERT INTO public.versicherungs_polizzen (
    id, household_id, dokument_id, fahrzeug_id, versicherer,
    polizzen_nummer, versicherungsart, deckung, praemie,
    praemien_intervall, naechste_faelligkeit, waehrung,
    start_date, end_date, review_required, reviewed_at,
    classification_confidence, extraction_confidence, extraktion
  ) VALUES (
    v_polizze_kfz, v_household_id, v_dokument_versicherung, v_fahrzeug,
    'Zurich', 'ZH-KFZ-2026-4711', 'Kfz-Haftpflicht und Teilkasko',
    'Haftpflicht EUR 10 Mio., Teilkasko mit EUR 300 Selbstbehalt',
    180.00, 'vierteljaehrlich', CURRENT_DATE + 20, 'EUR',
    CURRENT_DATE - 345, CURRENT_DATE + 20, false, NOW(), 0.99, 0.97,
    '{"kennzeichen":"W91211D","quelle":"demo_seed"}'::jsonb
  );

  INSERT INTO public.dokument_links (
    household_id, dokument_id, entity_type, entity_id, role
  ) VALUES
    (v_household_id, v_dokument_internet, 'vertrag', v_vertrag_internet, 'original'),
    (v_household_id, v_dokument_versicherung, 'versicherungs_polizze', v_polizze_kfz, 'original'),
    (v_household_id, v_dokument_versicherung, 'home_fahrzeuge', v_fahrzeug, 'insurance');

  -- ============================================================
  -- 19. Heimapotheke
  -- ============================================================
  v_medikament_ibuprofen := gen_random_uuid();

  INSERT INTO public.home_medikamente (
    id, user_id, household_id, name, wirkstoff, darreichungsform,
    packungsgroesse, bestand, mindestbestand, ablaufdatum, lagerort,
    kategorie, notizen, kaufdatum, preis, haendler, beipackzettel_url,
    offizielle_quelle, source_payload
  ) VALUES
    (v_medikament_ibuprofen, v_user_id, v_household_id,
     'Ibuprofen 400 mg', 'Ibuprofen', 'Filmtabletten', '20 Stück',
     6, 5, CURRENT_DATE + 260, 'Badezimmer – Arzneischrank',
     'Schmerzmittel', 'Nur nach Packungsbeilage verwenden.',
     CURRENT_DATE - 80, 6.90, 'Apotheke am Stephansplatz',
     'https://aspregister.basg.gv.at/', 'BASG',
     '{"demo_seed":true,"pzn":"DEMO-IBU-400"}'::jsonb),
    (gen_random_uuid(), v_user_id, v_household_id,
     'Cetirizin 10 mg', 'Cetirizindihydrochlorid', 'Tabletten', '30 Stück',
     18, 5, CURRENT_DATE + 420, 'Badezimmer – Arzneischrank',
     'Allergie', 'Bei Bedarf während der Pollensaison.',
     CURRENT_DATE - 40, 8.50, 'Online-Apotheke', NULL, NULL,
     '{"demo_seed":true}'::jsonb),
    (gen_random_uuid(), v_user_id, v_household_id,
     'Wunddesinfektionsspray', 'Octenidin', 'Spray', '50 ml',
     1, 1, CURRENT_DATE + 600, 'Erste-Hilfe-Box',
     'Erste Hilfe', 'Für kleine oberflächliche Wunden.',
     CURRENT_DATE - 120, 7.80, 'dm', NULL, NULL,
     '{"demo_seed":true}'::jsonb),
    (gen_random_uuid(), v_user_id, v_household_id,
     'Nasenspray Kinder', 'Xylometazolin', 'Nasenspray', '10 ml',
     0, 1, CURRENT_DATE + 45, 'Badezimmer – Arzneischrank',
     'Erkältung', 'Bestand leer – bei Bedarf nachkaufen.',
     CURRENT_DATE - 200, 5.20, 'Apotheke', NULL, NULL,
     '{"demo_seed":true}'::jsonb);

  INSERT INTO public.home_medikament_beipackzettel_analysen (
    id, medikament_id, household_id, source_url, source_hash,
    analyse_status, summary_payload, model, analysiert_am
  ) VALUES (
    gen_random_uuid(), v_medikament_ibuprofen, v_household_id,
    'https://aspregister.basg.gv.at/', 'demo-ibuprofen-400',
    'completed',
    jsonb_build_object(
      'kurzfassung', 'Schmerzstillendes und entzündungshemmendes Arzneimittel.',
      'wichtige_hinweise', jsonb_build_array(
        'Nicht bei bekannten Magen-Darm-Geschwüren ohne ärztliche Rücksprache verwenden.',
        'Dosierung und maximale Tagesdosis der Packungsbeilage beachten.'
      ),
      'demo_seed', true
    ),
    'demo-seed', NOW() - INTERVAL '2 days'
  );

  -- ============================================================
  -- 20. Kochbuch und Essensplanung
  -- ============================================================
  v_rezept_lasagne  := gen_random_uuid();
  v_rezept_curry    := gen_random_uuid();
  v_rezept_pancakes := gen_random_uuid();

  INSERT INTO public.home_rezepte (
    id, household_id, user_id, titel, beschreibung, quelle_plattform,
    import_typ, analyse_modus, sprache, ziel_locale, standort, confidence,
    gruppe, portionen, vorbereitungszeit_minuten, kochzeit_minuten,
    gesamtzeit_minuten, kosten_min, kosten_max, waehrung,
    kalorien_pro_portion, protein_pro_portion_g, kohlenhydrate_pro_portion_g,
    fett_pro_portion_g, anleitung, equipment, notizen, tags,
    favorisiert, status, raw_import_result
  ) VALUES
    (v_rezept_lasagne, v_household_id, v_user_id,
     'Lasagne al forno', 'Familienrezept mit Bolognese und Béchamelsauce.',
     'manuell', 'manuell', 'web', 'de', 'de', 'Wien, Österreich', 1.0,
     'Familienrezepte', 4, 25, 55, 80, 12.00, 16.00, 'EUR',
     720, 36, 68, 31,
     '["Bolognese aus Zwiebel, Knoblauch, Hackfleisch und Tomaten kochen.","Béchamelsauce vorbereiten und Backofen auf 180 °C vorheizen.","Lasagne schichten und mit Käse abschließen.","Etwa 40 Minuten backen und vor dem Servieren ruhen lassen."]'::jsonb,
     '["Großer Topf","Auflaufform","Kochlöffel"]'::jsonb,
     'Schmeckt am nächsten Tag besonders gut.',
     ARRAY['Pasta', 'Familie', 'Ofengericht'], true, 'gespeichert',
     '{"quelle":"demo_seed"}'::jsonb),
    (v_rezept_curry, v_household_id, v_user_id,
     'Kichererbsen-Kokos-Curry', 'Schnelles vegetarisches Curry für den Alltag.',
     'Webseite', 'web', 'web', 'de', 'de', 'Wien, Österreich', 0.94,
     'Schnelle Küche', 4, 10, 25, 35, 8.00, 11.00, 'EUR',
     510, 17, 62, 21,
     '["Zwiebel, Knoblauch und Ingwer anbraten.","Currypaste kurz mitrösten.","Kichererbsen, Tomaten und Kokosmilch zugeben.","20 Minuten köcheln und mit Limette abschmecken."]'::jsonb,
     '["Pfanne","Sieb","Messer"]'::jsonb,
     'Mit Reis oder Naan servieren.',
     ARRAY['Vegetarisch', 'Curry', 'Schnell'], true, 'gespeichert',
     '{"quelle":"demo_seed","importiert":true}'::jsonb),
    (v_rezept_pancakes, v_household_id, v_user_id,
     'Fluffige Pancakes', 'Einfaches Frühstücksrezept.',
     'Video', 'video', 'combined', 'de', 'de', 'Wien, Österreich', 0.91,
     'Frühstück', 3, 10, 15, 25, 4.50, 6.00, 'EUR',
     430, 12, 58, 16,
     '["Trockene Zutaten vermischen.","Milch, Ei und Butter einrühren.","Teig zehn Minuten ruhen lassen.","Pancakes portionsweise goldbraun ausbacken."]'::jsonb,
     '["Schüssel","Schneebesen","Pfanne"]'::jsonb,
     'Mit Beeren und Ahornsirup servieren.',
     ARRAY['Frühstück', 'Süß', 'Kinder'], false, 'gespeichert',
     '{"quelle":"demo_seed","video_import":true}'::jsonb);

  INSERT INTO public.home_rezept_zutaten (
    id, rezept_id, household_id, name, normalized_name, kategorie,
    menge, einheit, menge_text, original_text, confidence,
    kosten_min, kosten_max, waehrung, einkauf_noetig, sortierung
  ) VALUES
    (gen_random_uuid(), v_rezept_lasagne, v_household_id, 'Hackfleisch gemischt', 'hackfleisch', 'Lebensmittel', 500, 'g', '500 g', '500 g Hackfleisch', 1.0, 5.00, 6.50, 'EUR', true, 1),
    (gen_random_uuid(), v_rezept_lasagne, v_household_id, 'Lasagneplatten', 'lasagneplatten', 'Lebensmittel', 250, 'g', '250 g', '250 g Lasagneplatten', 1.0, 1.50, 2.20, 'EUR', false, 2),
    (gen_random_uuid(), v_rezept_lasagne, v_household_id, 'Tomaten stückig', 'tomaten dose', 'Lebensmittel', 2, 'Dose', '2 Dosen', '2 Dosen Tomaten', 1.0, 2.00, 3.00, 'EUR', false, 3),
    (gen_random_uuid(), v_rezept_curry, v_household_id, 'Kichererbsen', 'kichererbsen', 'Lebensmittel', 2, 'Dose', '2 Dosen', '2 Dosen Kichererbsen', 0.99, 1.80, 2.60, 'EUR', true, 1),
    (gen_random_uuid(), v_rezept_curry, v_household_id, 'Kokosmilch', 'kokosmilch', 'Lebensmittel', 400, 'ml', '400 ml', '1 Dose Kokosmilch', 0.98, 1.50, 2.20, 'EUR', true, 2),
    (gen_random_uuid(), v_rezept_curry, v_household_id, 'Currypaste', 'currypaste', 'Lebensmittel', 2, 'EL', '2 EL', '2 EL rote Currypaste', 0.94, 0.50, 0.90, 'EUR', false, 3),
    (gen_random_uuid(), v_rezept_pancakes, v_household_id, 'Mehl', 'mehl', 'Lebensmittel', 250, 'g', '250 g', '250 g Mehl', 1.0, 0.30, 0.50, 'EUR', false, 1),
    (gen_random_uuid(), v_rezept_pancakes, v_household_id, 'Milch', 'milch', 'Lebensmittel', 300, 'ml', '300 ml', '300 ml Milch', 1.0, 0.45, 0.65, 'EUR', true, 2),
    (gen_random_uuid(), v_rezept_pancakes, v_household_id, 'Ei', 'ei', 'Lebensmittel', 2, 'Stück', '2 Stück', '2 Eier', 1.0, 0.70, 1.00, 'EUR', false, 3);

  INSERT INTO public.home_rezept_plan (
    id, household_id, user_id, rezept_id, planned_date, meal_slot,
    portionen, notizen, sort_order, recurrence_frequency
  ) VALUES
    (gen_random_uuid(), v_household_id, v_user_id, v_rezept_curry,
     CURRENT_DATE + 1, 'dinner', 4, 'Reis aus dem Vorrat verwenden.', 10, 'none'),
    (gen_random_uuid(), v_household_id, v_user_id, v_rezept_pancakes,
     CURRENT_DATE + 3, 'breakfast', 3, 'Beeren einkaufen.', 10, 'none'),
    (gen_random_uuid(), v_household_id, v_user_id, v_rezept_lasagne,
     CURRENT_DATE + 5, 'dinner', 4, 'Für Sonntag vorbereiten.', 10, 'none');

  -- ============================================================
  -- 21. Bücherregal (nur wenn die optionale Buchmigration vorliegt)
  -- ============================================================
  IF to_regclass('public.home_buecher') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO public.home_buecher (
        id, user_id, household_id, created_by_user_id, titel, untertitel,
        autoren, autor_anzeige, isbn_13, verlag, erscheinungsjahr, sprache,
        seitenzahl, beschreibung, tags, ort_id, lagerort_id, status,
        zustand, anzahl, notizen, api_quelle, api_ref, api_payload
      ) VALUES
        (gen_random_uuid(), $1, $2, $1, 'Clean Code', NULL,
         ARRAY['Robert C. Martin'], 'Robert C. Martin', '9780132350884',
         'Prentice Hall', 2008, 'de', 464,
         'Grundlagen für lesbaren und wartbaren Code.',
         ARRAY['Softwareentwicklung','Fachbuch'], $3, $4, 'im_regal',
         'gut', 1, 'Häufig verwendetes Nachschlagewerk.',
         'openlibrary', 'OL22856696M', '{"demo_seed":true}'::jsonb),
        (gen_random_uuid(), $1, $2, $1, 'Der Name der Rose', NULL,
         ARRAY['Umberto Eco'], 'Umberto Eco', '9783423010518',
         'dtv', 1982, 'de', 654,
         'Historischer Roman in einer mittelalterlichen Abtei.',
         ARRAY['Roman','Klassiker'], $3, $4, 'im_regal',
         'sehr_gut', 1, NULL,
         'openlibrary', 'OL7353617M', '{"demo_seed":true}'::jsonb),
        (gen_random_uuid(), $1, $2, $1, 'Atomic Habits', NULL,
         ARRAY['James Clear'], 'James Clear', '9781847941831',
         'Random House', 2018, 'en', 320,
         'Praktische Methoden zum Aufbau guter Gewohnheiten.',
         ARRAY['Sachbuch','Produktivität'], $3, $4, 'verliehen',
         'gut', 1, 'An Nachbar Peter verliehen.',
         'google_books', 'fFCjDQAAQBAJ', '{"demo_seed":true}'::jsonb)
    $sql$ USING v_user_id, v_household_id, v_ort_wohnung, v_lager_buecher;
  END IF;


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
  RAISE NOTICE '   → 3 Finanzkonten, Budgetkategorien und gespeicherte Budgetansicht';
  RAISE NOTICE '   → 4 Dokumente, 2 Rechnungen, 1 Vertrag und 1 Versicherung';
  RAISE NOTICE '   → 1 Fahrzeug mit Tankungen, Servicepositionen, Reifen, Kosten und Aufgaben';
  RAISE NOTICE '   → 4 Medikamente und 1 analysierter Beipackzettel';
  RAISE NOTICE '   → 3 Rezepte, 9 Zutaten und 3 geplante Mahlzeiten';
  IF to_regclass('public.home_buecher') IS NOT NULL THEN
    RAISE NOTICE '   → 3 Bücher im optionalen Bücherregal';
  ELSE
    RAISE NOTICE '   → Bücherregal übersprungen: Tabelle public.home_buecher fehlt';
  END IF;

END $$;
