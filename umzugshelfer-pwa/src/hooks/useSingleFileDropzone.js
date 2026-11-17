import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useTranslation } from "react-i18next";

const exceedsLimit = rejections => rejections.some(({ errors }) => errors.some(({ code }) => code === "too-many-files"));

/** Existing document screens reject the whole selection when more than one file is accepted.
 * Dropzone 20 instead keeps the first file. Preserve the previous callback contract.
 * Keep file paste disabled as in the previous library version.
 * This scoped hook exposes only the three properties used by those screens.
 */
export default function useSingleFileDropzone({ onDrop }) {
  const { t } = useTranslation("documents");
  const handleDrop = useCallback((files, rejections, event) => {
    if (exceedsLimit(rejections)) {
      const rejected = files.map(file => ({ file, errors: [{ code: "too-many-files", message: "Too many files" }] }));
      onDrop([], [...rejected, ...rejections], event);
    } else onDrop(files, rejections, event);
  }, [onDrop]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ multiple: false, noPaste: true, onDrop: handleDrop });
  const getDocumentInputProps = useCallback(props => getInputProps({
    "aria-label": t("manager.uploadTitle", { defaultValue: "Neues Dokument hochladen" }),
    ...props,
  }), [getInputProps, t]);
  return { getRootProps, getInputProps: getDocumentInputProps, isDragActive };
}
