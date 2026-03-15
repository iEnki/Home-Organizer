import React from "react";
import {
  Page,
  Text,
  View,
  Document,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
    padding: 30,
    fontFamily: "Helvetica",
  },
  header: {
    fontSize: 24,
    marginBottom: 20,
    textAlign: "center",
    color: "#333333",
    fontFamily: "Helvetica-Bold",
  },
  phaseTitle: {
    fontSize: 18,
    marginTop: 20,
    marginBottom: 10,
    color: "#4A90E2",
    paddingBottom: 3,
    fontFamily: "Helvetica-Bold",
  },
  paragraph: {
    fontSize: 11,
    marginBottom: 8,
    lineHeight: 1.5,
    color: "#555555",
  },
  boldText: {
    fontFamily: "Helvetica-Bold",
  },
  italicText: {
    fontFamily: "Helvetica-Oblique",
  },
  imageContainer: {
    marginVertical: 10,
    alignItems: "center",
  },
  image: {
    maxWidth: "80%",
    maxHeight: 300,
    alignSelf: "center",
  },
  imageCaption: {
    fontSize: 9,
    textAlign: "center",
    color: "#777777",
    marginTop: 5,
    fontStyle: "italic",
  },
});

let uniqueKeyCounter = 0; // Globaler Zähler für eindeutige Keys

const parseMarkdownStyle = (textSegment, baseStyle, keyPrefix) => {
  const elements = [];
  let lastIndex = 0;
  const styleRegex = /(\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_)/g;
  let match;

  while ((match = styleRegex.exec(textSegment)) !== null) {
    if (match.index > lastIndex) {
      elements.push(
        <Text key={`${keyPrefix}-s-${uniqueKeyCounter++}`} style={baseStyle}>
          {textSegment.substring(lastIndex, match.index)}
        </Text>
      );
    }
    if (match[2]) {
      elements.push(
        <Text
          key={`${keyPrefix}-s-${uniqueKeyCounter++}`}
          style={{ ...baseStyle, ...styles.boldText }}
        >
          {match[2]}
        </Text>
      );
    } else if (match[3] || match[4]) {
      elements.push(
        <Text
          key={`${keyPrefix}-s-${uniqueKeyCounter++}`}
          style={{ ...baseStyle, ...styles.italicText }}
        >
          {match[3] || match[4]}
        </Text>
      );
    }
    lastIndex = styleRegex.lastIndex;
  }

  if (lastIndex < textSegment.length) {
    elements.push(
      <Text key={`${keyPrefix}-s-${uniqueKeyCounter++}`} style={baseStyle}>
        {textSegment.substring(lastIndex)}
      </Text>
    );
  }
  return elements.length > 0 ? (
    <>{elements}</> // React-Fragmente brauchen keinen Key, wenn sie direkt zurückgegeben werden
  ) : (
    <Text style={baseStyle} key={`${keyPrefix}-s-${uniqueKeyCounter++}`}>
      {textSegment}
    </Text>
  );
};

const TagebuchPDF = ({
  generierterTagebuchText,
  umzugsdatenJSON,
  signedImageUrlsMap,
}) => {
  uniqueKeyCounter = 0; // Reset für jedes PDF-Rendering

  const renderTextBlockWithMedia = (textBlock, blockKeyPrefix) => {
    if (!textBlock || textBlock.trim() === "") return null;

    const elements = [];
    let lastIndex = 0;
    const mediaRegex = /\[(BILD|DOKUMENT):\s*([^,]+?)\s*,\s*([^\]]+?)\]/g;
    let match;

    while ((match = mediaRegex.exec(textBlock)) !== null) {
      if (match.index > lastIndex) {
        const textSegment = textBlock.substring(lastIndex, match.index);
        // parseMarkdownStyle gibt bereits ein Fragment oder ein einzelnes Text-Element mit Key zurück
        elements.push(
          parseMarkdownStyle(
            textSegment,
            styles.paragraph,
            `${blockKeyPrefix}-p-${uniqueKeyCounter++}`
          )
        );
      }

      const type = match[1];
      let nameFromMarker = match[2].trim();
      const descriptionFromMarker = match[3].trim();
      let actualFileName = nameFromMarker;
      const separatorIndex = nameFromMarker.indexOf(" - ");
      if (separatorIndex !== -1) {
        const potentialFileName = nameFromMarker.substring(0, separatorIndex);
        if (/\.(png|jpe?g|gif|webp)$/i.test(potentialFileName)) {
          actualFileName = potentialFileName;
        }
      }

      if (type === "BILD") {
        let mediaItem = null;
        if (umzugsdatenJSON && umzugsdatenJSON.events) {
          for (const event of umzugsdatenJSON.events) {
            if (event.media) {
              mediaItem = event.media.find(
                (m) =>
                  (m.name === actualFileName || m.name === nameFromMarker) &&
                  m.type === "image"
              );
              if (mediaItem) break;
            }
          }
        }
        if (
          mediaItem &&
          mediaItem.storage_path &&
          signedImageUrlsMap &&
          signedImageUrlsMap[mediaItem.storage_path]
        ) {
          elements.push(
            <View
              key={`${blockKeyPrefix}-img-container-${uniqueKeyCounter++}`}
              style={styles.imageContainer}
            >
              <Image
                style={styles.image}
                src={signedImageUrlsMap[mediaItem.storage_path]}
              />
              {descriptionFromMarker && (
                <Text style={styles.imageCaption}>{descriptionFromMarker}</Text>
              )}
            </View>
          );
        } else {
          elements.push(
            <Text
              key={`${blockKeyPrefix}-img-placeholder-${uniqueKeyCounter++}`}
              style={styles.paragraph}
            >
              {`(Bild: ${nameFromMarker} - ${descriptionFromMarker} konnte nicht geladen werden)`}
            </Text>
          );
        }
      } else if (type === "DOKUMENT") {
        elements.push(
          <Text
            key={`${blockKeyPrefix}-doc-${uniqueKeyCounter++}`}
            style={styles.paragraph}
          >
            {`(Dokumenthinweis: ${nameFromMarker} - ${descriptionFromMarker})`}
          </Text>
        );
      }
      lastIndex = mediaRegex.lastIndex;
    }

    if (lastIndex < textBlock.length) {
      const textSegment = textBlock.substring(lastIndex);
      elements.push(
        parseMarkdownStyle(
          textSegment,
          styles.paragraph,
          `${blockKeyPrefix}-p-${uniqueKeyCounter++}`
        )
      );
    }
    // Wenn elements ein Array von React-Elementen ist (jedes mit eigenem Key),
    // kann es direkt zurückgegeben werden, React wird es handhaben.
    // Ein umschließendes Fragment ist nicht unbedingt nötig, wenn die Elemente schon Keys haben.
    return elements.length > 0 ? elements : null;
  };

  const renderPhasedContent = () => {
    if (!generierterTagebuchText) {
      return <Text style={styles.paragraph}>Kein Tagebuchtext vorhanden.</Text>;
    }

    const phasenNamen = umzugsdatenJSON?.phasen || [];
    const allElements = [];

    const phasenRegexParts = phasenNamen.map(
      (phase) =>
        `(?:#\\s*)?(?:Phase:\\s*)?(${phase.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )})(?::)?`
    );
    const phasenRegexGlobal = new RegExp(
      `(^|\\n)(?:${phasenRegexParts.join("|")})`,
      "gi"
    );

    let lastOverallIndex = 0;
    let matchPh;
    const textParts = [];
    const phaseTitles = [];

    while (
      (matchPh = phasenRegexGlobal.exec(generierterTagebuchText)) !== null
    ) {
      const textVorMatch = generierterTagebuchText.substring(
        lastOverallIndex,
        matchPh.index
      );
      if (textVorMatch.trim()) {
        textParts.push(textVorMatch);
      }
      let actualPhaseTitle = "";
      for (let i = 0; i < phasenNamen.length; i++) {
        if (matchPh[i + 3]) {
          actualPhaseTitle = phasenNamen[i];
          break;
        }
      }
      phaseTitles.push({
        title:
          actualPhaseTitle ||
          matchPh[2]
            .replace(/^(?:#\s*)?(?:Phase:\s*)?/i, "")
            .replace(/:$/, "")
            .trim(),
        index: textParts.length,
      });
      lastOverallIndex = matchPh.index + matchPh[0].length;
    }
    const textNachLetztemMatch =
      generierterTagebuchText.substring(lastOverallIndex);
    if (textNachLetztemMatch.trim()) {
      textParts.push(textNachLetztemMatch);
    }

    if (
      textParts.length === 0 &&
      phaseTitles.length === 0 &&
      generierterTagebuchText
    ) {
      const block = renderTextBlockWithMedia(
        generierterTagebuchText,
        `fulltext-${uniqueKeyCounter++}`
      );
      if (block) allElements.push(...(Array.isArray(block) ? block : [block])); // Stelle sicher, dass es als Array behandelt wird
    } else {
      let currentTextPartIndex = 0;
      for (let i = 0; ; i++) {
        const currentIndexForFind = currentTextPartIndex;
        const phaseTitleInfo = phaseTitles.find(
          (pt) => pt.index === currentIndexForFind
        );

        // Stelle sicher, dass ein Titel nur einmal hinzugefügt wird, falls die Logik mehrfach iteriert
        const titleKey = phaseTitleInfo
          ? `phase-title-${phaseTitleInfo.title.replace(/\s+/g, "-")}`
          : null;
        if (
          phaseTitleInfo &&
          !allElements.find((el) => el && el.key && el.key.startsWith(titleKey))
        ) {
          allElements.push(
            <Text
              key={`${titleKey}-${uniqueKeyCounter++}`}
              style={styles.phaseTitle}
            >
              {phaseTitleInfo.title}
            </Text>
          );
        }

        if (currentTextPartIndex < textParts.length) {
          const renderedBlock = renderTextBlockWithMedia(
            textParts[currentTextPartIndex],
            `block-${uniqueKeyCounter++}`
          );
          if (renderedBlock) {
            allElements.push(
              ...(Array.isArray(renderedBlock)
                ? renderedBlock
                : [renderedBlock])
            );
          }
          currentTextPartIndex++;
        } else if (
          !phaseTitleInfo &&
          i >= Math.max(textParts.length, phaseTitles.length)
        ) {
          break;
        }
        if (
          currentTextPartIndex >= textParts.length &&
          i >= phaseTitles.length &&
          !phaseTitles.find((pt) => pt.index >= currentIndexForFind)
        )
          break;
      }
    }

    if (allElements.length === 0) {
      return (
        <Text style={styles.paragraph}>
          Tagebuch konnte nicht strukturiert werden oder ist leer.
        </Text>
      );
    }
    return <>{allElements}</>; // Ein einzelnes Fragment, das eine Liste von Elementen mit Keys enthält
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.header}>
          {umzugsdatenJSON?.umzugstitel || "Mein Umzugstagebuch"}
        </Text>
        {renderPhasedContent()}
      </Page>
    </Document>
  );
};

export default TagebuchPDF;
