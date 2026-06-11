import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatKfzDisplayText } from "../../../utils/kfzPresentation";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, color: "#172033" },
  title: { fontSize: 20, marginBottom: 4, fontWeight: 700 },
  subtitle: { color: "#64748b", marginBottom: 18 },
  kpis: { flexDirection: "row", gap: 8, marginBottom: 18 },
  kpi: { flexGrow: 1, border: "1 solid #dbe3ec", borderRadius: 6, padding: 9 },
  kpiLabel: { color: "#64748b", fontSize: 7, marginBottom: 4 },
  kpiValue: { fontSize: 13, fontWeight: 700 },
  heading: { fontSize: 12, fontWeight: 700, marginTop: 12, marginBottom: 6 },
  row: { flexDirection: "row", borderBottom: "1 solid #e8edf3", paddingVertical: 5 },
  date: { width: "15%" },
  category: { width: "18%" },
  description: { width: "47%" },
  amount: { width: "20%", textAlign: "right" },
  muted: { color: "#64748b" },
});

const money = (value) => `${Number(value || 0).toFixed(2)} EUR`;

export default function KfzReportPDF({ vehicle, stats, services = [], servicePositions = [], tires = [], periodLabel }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Kfz-Bericht</Text>
        <Text style={styles.subtitle}>
          {[vehicle?.name, vehicle?.kennzeichen, periodLabel].filter(Boolean).join(" - ")}
        </Text>
        <View style={styles.kpis}>
          <View style={styles.kpi}><Text style={styles.kpiLabel}>Gesamtkosten</Text><Text style={styles.kpiValue}>{money(stats.totalCost)}</Text></View>
          <View style={styles.kpi}><Text style={styles.kpiLabel}>Kosten / km</Text><Text style={styles.kpiValue}>{stats.costPerKm == null ? "-" : money(stats.costPerKm)}</Text></View>
          <View style={styles.kpi}><Text style={styles.kpiLabel}>Verbrauch</Text><Text style={styles.kpiValue}>{stats.averageConsumption == null ? "-" : `${stats.averageConsumption.toFixed(1)} l/100 km`}</Text></View>
        </View>
        <Text style={styles.heading}>Kosten</Text>
        {stats.transactions.slice(0, 80).map((row) => (
          <View key={row.id} style={styles.row}>
            <Text style={styles.date}>{row.date}</Text>
            <Text style={styles.category}>{row.category}</Text>
            <Text style={styles.description}>{formatKfzDisplayText(row.description)}</Text>
            <Text style={styles.amount}>{money(row.amount)}</Text>
          </View>
        ))}
        <Text style={styles.heading}>Service</Text>
        {services.length ? services.map((row) => {
          const positions = servicePositions.filter((position) => position.service_id === row.id);
          return (
            <View key={row.id}>
              <View style={styles.row}>
                <Text style={styles.date}>{row.datum}</Text>
                <Text style={styles.category}>{formatKfzDisplayText(row.typ)}</Text>
                <Text style={styles.description}>{formatKfzDisplayText(row.beschreibung || row.werkstatt || "-")}</Text>
                <Text style={styles.amount}>{money(row.kosten)}</Text>
              </View>
              {positions.length ? <Text style={[styles.muted, { marginBottom: 4 }]}>{positions.map((position) => formatKfzDisplayText(position.beschreibung)).join(", ")}</Text> : null}
              {row.analyse_meta?.safety_notes?.length ? <Text style={{ color: "#b45309", marginBottom: 4 }}>Hinweis: {row.analyse_meta.safety_notes.join(" ")}</Text> : null}
            </View>
          );
        }) : <Text style={styles.muted}>Keine Serviceeinträge im Zeitraum.</Text>}
        <Text style={styles.heading}>Reifen</Text>
        {tires.length ? tires.map((row) => (
          <View key={row.id} style={styles.row}>
            <Text style={styles.date}>{row.kaufdatum || "-"}</Text>
            <Text style={styles.category}>{row.saison}</Text>
            <Text style={styles.description}>{[row.marke, row.groesse, row.dot_nummer].filter(Boolean).join(" - ")}</Text>
            <Text style={styles.amount}>{row.profiltiefe == null ? "-" : `${row.profiltiefe} mm`}</Text>
          </View>
        )) : <Text style={styles.muted}>Keine Reifensätze vorhanden.</Text>}
      </Page>
    </Document>
  );
}
