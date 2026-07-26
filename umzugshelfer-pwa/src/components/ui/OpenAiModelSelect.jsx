import React, { useMemo } from "react";
import { AlertCircle, CheckCircle, RefreshCw, TestTube2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import SearchableSelect from "./SearchableSelect";
import { modelCapabilityForTarget } from "../../utils/openAiModels";

function modelStatus(model, target) {
  if (model?.unavailable) return "unavailable";
  const capability = modelCapabilityForTarget(model, target);
  if (capability === true) return "supported";
  if (capability === false) return "unsupported";
  return "unknown";
}

export default function OpenAiModelSelect({
  value,
  onValueChange,
  models = [],
  target,
  label,
  hint,
  loading = false,
  error = null,
  onRefresh,
  testState,
  onTest,
  disabled = false,
  inheritLabel = null,
}) {
  const { t } = useTranslation("profile");
  const items = useMemo(() => {
    const currentId = String(value || "").trim();
    const hasCurrent = currentId && models.some((model) => model.id === currentId);
    const source = hasCurrent || !currentId
      ? models
      : [{ id: currentId, unavailable: true, capabilities: {} }, ...models];

    const modelItems = source.map((model) => {
      const status = modelStatus(model, target);
      return {
        value: model.id,
        label: model.id,
        description: model.reason
          || (status === "unavailable"
            ? t("modelSelect.unavailableDescription")
            : status === "unknown"
            ? t("modelSelect.unknownDescription")
            : null),
        badge: t(`modelSelect.status.${status}`),
        badgeTone: status === "supported"
          ? "success"
          : status === "unsupported"
          ? "danger"
          : status === "unavailable"
          ? "muted"
          : "warning",
        disabled: status === "unsupported",
      };
    });
    return inheritLabel
      ? [{
          value: "",
          label: inheritLabel,
          description: t("modelSelect.inheritedDescription"),
          badge: t("modelSelect.status.inherited"),
          badgeTone: "muted",
        }, ...modelItems]
      : modelItems;
  }, [inheritLabel, models, t, target, value]);

  const selected = items.find((item) => item.value === value);
  const canTest = Boolean(String(value || "").trim()) && !selected?.disabled;

  return (
    <div className="space-y-1.5">
      {label && (
        <span className="block text-xs font-medium uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
          {label}
        </span>
      )}
      <div className="flex items-end gap-2">
        <SearchableSelect
          value={value}
          onValueChange={onValueChange}
          items={items}
          placeholder={loading ? t("modelSelect.loading") : t("modelSelect.placeholder")}
          searchPlaceholder={t("modelSelect.searchPlaceholder")}
          emptyText={error ? t("modelSelect.unavailable") : t("modelSelect.empty")}
          createText={t("modelSelect.useManualId")}
          allowCustom
          showSearch
          disabled={disabled}
          rootClassName="min-w-0 flex-1"
          triggerClassName="w-full min-h-[42px] px-3 py-2.5 text-sm"
          className="w-full"
        />
        <button
          type="button"
          onClick={onRefresh}
          disabled={disabled || loading}
          title={t("modelSelect.refresh")}
          className="inline-flex h-[42px] w-10 flex-shrink-0 items-center justify-center rounded-card-sm border border-light-border text-light-text-secondary transition-colors hover:border-primary-500/40 hover:text-primary-500 disabled:opacity-50 dark:border-dark-border dark:text-dark-text-secondary"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {error && (
        <p className="flex items-start gap-1 text-xs text-accent-danger">
          <AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> {error}
        </p>
      )}
      {hint && <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{hint}</p>}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={onTest}
          disabled={disabled || !canTest || testState?.status === "testing"}
          className="inline-flex items-center gap-1.5 rounded-pill border border-secondary-500/40 px-3 py-1.5 text-xs font-medium text-secondary-500 transition-colors hover:bg-secondary-500/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <TestTube2 size={13} />
          {testState?.status === "testing" ? t("modelSelect.testing") : t("modelSelect.test")}
        </button>
        {testState?.status === "success" && (
          <span className="inline-flex items-center gap-1 text-xs text-accent-success">
            <CheckCircle size={13} /> {t("modelSelect.compatible", { latencyMs: testState.latencyMs })}
          </span>
        )}
        {(testState?.status === "error" || testState?.status === "required") && (
          <span className="inline-flex items-start gap-1 text-xs text-accent-danger">
            <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
            {testState.message || t("modelSelect.testBeforeSaving")}
          </span>
        )}
      </div>
    </div>
  );
}
