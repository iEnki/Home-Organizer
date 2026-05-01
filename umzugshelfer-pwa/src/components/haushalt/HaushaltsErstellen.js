import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { useHaushalt } from "../../contexts/HaushaltsContext";
import { Home, Key, Plus, AlertCircle, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

const HaushaltsErstellen = ({ session }) => {
  const { t } = useTranslation(["household"]);
  const navigate = useNavigate();
  const { ladeHaushalt, ausstehende_einladungen, ladeAusstehendeEinladungen } = useHaushalt();

  const [aktiveTab, setAktiveTab] = useState("erstellen");
  const [haushaltsName, setHaushaltsName] = useState(t("household:title"));
  const [einladungsCode, setEinladungsCode] = useState("");
  const [laden, setLaden] = useState(false);
  const [fehler, setFehler] = useState("");

  const userId = session?.user?.id;

  const handleErstellen = async (e) => {
    e.preventDefault();
    if (!haushaltsName.trim()) return;
    setLaden(true);
    setFehler("");

    const { data: haushalt, error: hError } = await supabase
      .from("haushalte")
      .insert({ name: haushaltsName.trim(), admin_id: userId })
      .select()
      .single();

    if (hError || !haushalt) {
      setFehler(t("household:setup.createFailed"));
      setLaden(false);
      return;
    }

    await supabase
      .from("haushalt_mitglieder")
      .insert({ haushalt_id: haushalt.id, user_id: userId, rolle: "admin" });

    await supabase
      .from("user_profile")
      .update({ haushalt_id: haushalt.id })
      .eq("id", userId);

    setLaden(false);
    await ladeHaushalt();
    navigate("/home");
  };

  const handleBeitreten = async (e) => {
    e.preventDefault();
    if (!einladungsCode.trim()) return;
    setLaden(true);
    setFehler("");

    const { error } = await supabase.rpc("einladung_annehmen", {
      p_code: einladungsCode.trim(),
    });

    if (error) {
      setFehler(error.message || t("household:messages.inviteInvalid"));
      setLaden(false);
      return;
    }

    setLaden(false);
    await ladeHaushalt();
    navigate("/home");
  };

  const handleEmailEinladungAnnehmen = async (einladung) => {
    setLaden(true);
    setFehler("");

    const { error } = await supabase
      .from("haushalt_mitglieder")
      .insert({ haushalt_id: einladung.haushalt_id, user_id: userId, rolle: "mitglied" });

    if (!error) {
      await supabase
        .from("user_profile")
        .update({ haushalt_id: einladung.haushalt_id })
        .eq("id", userId);

      await supabase
        .from("haushalt_einladungen")
        .update({ status: "angenommen" })
        .eq("id", einladung.id);
    }

    setLaden(false);
    if (error) {
      setFehler(t("household:invites.acceptFailed"));
    } else {
      await ladeHaushalt();
      navigate("/home");
    }
  };

  const handleEmailEinladungAblehnen = async (einladungId) => {
    await supabase
      .from("haushalt_einladungen")
      .update({ status: "abgelaufen" })
      .eq("id", einladungId);
    await ladeAusstehendeEinladungen();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-light-accent-purple/20 dark:bg-accent-purple/20 mb-4">
            <Home className="w-8 h-8 text-light-accent-purple dark:text-accent-purple" />
          </div>
          <h1 className="text-2xl font-bold text-light-text-main dark:text-dark-text-main">
            {t("household:setup.title")}
          </h1>
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1">
            {t("household:setup.subtitle")}
          </p>
        </div>

        {ausstehende_einladungen.length > 0 && (
          <div className="mb-6 space-y-3">
            {ausstehende_einladungen.map((einladung) => (
              <div
                key={einladung.id}
                className="rounded-xl border border-light-accent-purple/30 dark:border-accent-purple/30 bg-light-accent-purple/5 dark:bg-accent-purple/10 p-4"
              >
                <div className="flex items-start gap-3">
                  <Users className="w-5 h-5 text-light-accent-purple dark:text-accent-purple mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-light-text-main dark:text-dark-text-main">
                      {t("household:invites.invitedTo", { name: einladung.haushalte?.name || t("household:title") })}
                    </p>
                    <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                      {t("household:validUntil", { date: new Date(einladung.gueltig_bis).toLocaleDateString("de-DE") })}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleEmailEinladungAnnehmen(einladung)}
                    disabled={laden}
                    className="flex-1 py-2 rounded-lg text-sm font-medium bg-light-accent-purple dark:bg-accent-purple text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {t("household:invites.accept")}
                  </button>
                  <button
                    onClick={() => handleEmailEinladungAblehnen(einladung.id)}
                    disabled={laden}
                    className="flex-1 py-2 rounded-lg text-sm font-medium border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-card-bg dark:hover:bg-dark-card-bg transition-colors disabled:opacity-50"
                  >
                    {t("household:invites.decline")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex rounded-xl bg-light-card-bg dark:bg-dark-card-bg border border-light-border dark:border-dark-border p-1 mb-6">
          <button
            onClick={() => setAktiveTab("erstellen")}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              aktiveTab === "erstellen"
                ? "bg-light-accent-purple dark:bg-accent-purple text-white"
                : "text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
            }`}
          >
            {t("household:setup.tabCreate")}
          </button>
          <button
            onClick={() => setAktiveTab("beitreten")}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              aktiveTab === "beitreten"
                ? "bg-light-accent-purple dark:bg-accent-purple text-white"
                : "text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
            }`}
          >
            {t("household:setup.tabJoin")}
          </button>
        </div>

        {fehler && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {fehler}
          </div>
        )}

        {aktiveTab === "erstellen" && (
          <form onSubmit={handleErstellen} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-light-text-main dark:text-dark-text-main mb-1.5">
                {t("household:setup.nameLabel")}
              </label>
              <input
                type="text"
                value={haushaltsName}
                onChange={(e) => setHaushaltsName(e.target.value)}
                placeholder={t("household:setup.namePlaceholder")}
                maxLength={80}
                required
                className="w-full rounded-xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-4 py-3 text-sm text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-light-accent-purple dark:focus:ring-accent-purple"
              />
            </div>
            <button
              type="submit"
              disabled={laden || !haushaltsName.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm bg-light-accent-purple dark:bg-accent-purple text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {laden ? t("household:setup.creating") : t("household:setup.createButton")}
            </button>
          </form>
        )}

        {aktiveTab === "beitreten" && (
          <form onSubmit={handleBeitreten} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-light-text-main dark:text-dark-text-main mb-1.5">
                {t("household:setup.codeLabel")}
              </label>
              <input
                type="text"
                value={einladungsCode}
                onChange={(e) => setEinladungsCode(e.target.value.trim())}
                placeholder={t("household:setup.codePlaceholder")}
                maxLength={64}
                required
                className="w-full rounded-xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-canvas-1 px-4 py-3 text-sm font-mono text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-light-accent-purple dark:focus:ring-accent-purple"
              />
              <p className="mt-1.5 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                {t("household:setup.codeHint")}
              </p>
            </div>
            <button
              type="submit"
              disabled={laden || !einladungsCode.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm bg-light-accent-purple dark:bg-accent-purple text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Key className="w-4 h-4" />
              {laden ? t("household:setup.joining") : t("household:setup.joinButton")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default HaushaltsErstellen;
