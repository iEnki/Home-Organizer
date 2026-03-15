import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 10,
    fontFamily: "Helvetica",
    backgroundColor: "#FFFFFF",
  },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    color: "#1a1a2e",
  },
  subtitle: {
    fontSize: 9,
    color: "#6b7280",
    marginBottom: 20,
  },
  kisteContainer: {
    marginBottom: 16,
    border: "1px solid #e5e7eb",
    borderRadius: 4,
    padding: 10,
  },
  kisteHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
    paddingBottom: 6,
    borderBottom: "1px solid #e5e7eb",
  },
  kisteName: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
  },
  kisteRaum: {
    fontSize: 9,
    color: "#6b7280",
    marginTop: 2,
  },
  kisteQr: {
    fontSize: 8,
    color: "#9ca3af",
    textAlign: "right",
  },
  itemsTable: {
    marginTop: 4,
  },
  itemRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottom: "1px solid #f3f4f6",
  },
  itemRowLast: {
    flexDirection: "row",
    paddingVertical: 3,
  },
  itemBeschreibung: {
    flex: 4,
    color: "#374151",
  },
  itemKategorie: {
    flex: 2,
    color: "#6b7280",
    textAlign: "center",
  },
  itemMenge: {
    flex: 1,
    color: "#374151",
    textAlign: "right",
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottom: "1px solid #d1d5db",
    marginBottom: 2,
  },
  tableHeaderText: {
    fontFamily: "Helvetica-Bold",
    color: "#374151",
    fontSize: 8,
  },
  emptyText: {
    color: "#9ca3af",
    fontStyle: "italic",
    fontSize: 9,
    marginTop: 4,
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 30,
    right: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#9ca3af",
    borderTop: "1px solid #e5e7eb",
    paddingTop: 6,
  },
});

const PacklistePDF = ({ kisten }) => {
  const exportDate = new Date().toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <Document title="Packliste" author="Umzugsplaner">
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Packliste</Text>
        <Text style={styles.subtitle}>
          Exportiert am {exportDate} · {kisten.length} Kiste
          {kisten.length !== 1 ? "n" : ""}
        </Text>

        {kisten.map((kiste) => {
          const items = kiste.inhalt || [];
          return (
            <View key={kiste.id} style={styles.kisteContainer} wrap={false}>
              <View style={styles.kisteHeader}>
                <View>
                  <Text style={styles.kisteName}>
                    {kiste.name || `Kiste ${kiste.id}`}
                  </Text>
                  {kiste.raum_neu ? (
                    <Text style={styles.kisteRaum}>
                      Zielraum: {kiste.raum_neu}
                    </Text>
                  ) : null}
                </View>
                {kiste.qr_code_wert ? (
                  <Text style={styles.kisteQr}>
                    QR: {kiste.qr_code_wert}
                  </Text>
                ) : null}
              </View>

              {items.length > 0 ? (
                <View style={styles.itemsTable}>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.tableHeaderText, { flex: 4 }]}>
                      Gegenstand
                    </Text>
                    <Text
                      style={[
                        styles.tableHeaderText,
                        { flex: 2, textAlign: "center" },
                      ]}
                    >
                      Kategorie
                    </Text>
                    <Text
                      style={[
                        styles.tableHeaderText,
                        { flex: 1, textAlign: "right" },
                      ]}
                    >
                      Menge
                    </Text>
                  </View>
                  {items.map((item, idx) => (
                    <View
                      key={item.id}
                      style={
                        idx === items.length - 1
                          ? styles.itemRowLast
                          : styles.itemRow
                      }
                    >
                      <Text style={styles.itemBeschreibung}>
                        {item.beschreibung}
                      </Text>
                      <Text style={styles.itemKategorie}>
                        {item.kategorie || "–"}
                      </Text>
                      <Text style={styles.itemMenge}>
                        {item.menge ?? 1}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>Keine Gegenstände</Text>
              )}
            </View>
          );
        })}

        <View style={styles.footer} fixed>
          <Text>Umzugsplaner – Packliste</Text>
          <Text render={({ pageNumber, totalPages }) =>
            `Seite ${pageNumber} / ${totalPages}`
          } />
        </View>
      </Page>
    </Document>
  );
};

export default PacklistePDF;
