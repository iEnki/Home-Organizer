import { supabase } from "../supabaseClient";
import { createKfzDocumentUrl, removeKfzDocument, uploadKfzDocument } from "./kfzData";

export const VEHICLE_PHOTO_ROLE = "vehicle_photo";
export const VEHICLE_COVER_ROLE = "vehicle_cover";
export const VEHICLE_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const VEHICLE_PHOTO_MAX_BYTES = 12 * 1024 * 1024;

export const validateVehiclePhoto = (file) => {
  if (!file) return "Bitte ein Foto auswählen.";
  if (!VEHICLE_PHOTO_TYPES.includes(file.type)) return "Unterstuetzt werden JPEG, PNG und WebP.";
  if (file.size > VEHICLE_PHOTO_MAX_BYTES) return "Das Foto darf maximal 12 MB gross sein.";
  return "";
};

export const getVehiclePhotos = ({ documents = [], links = [], vehicleId }) => {
  if (!vehicleId) return [];
  const documentById = Object.fromEntries(documents.map((document) => [document.id, document]));
  return links
    .filter((link) => (
      link.entity_type === "home_fahrzeuge"
      && link.entity_id === vehicleId
      && [VEHICLE_PHOTO_ROLE, VEHICLE_COVER_ROLE].includes(link.role)
    ))
    .map((link) => ({ ...documentById[link.dokument_id], linkId: link.id, role: link.role }))
    .filter((document) => document.id && document.datei_typ?.startsWith("image/"))
    .sort((left, right) => (
      Number(right.role === VEHICLE_COVER_ROLE) - Number(left.role === VEHICLE_COVER_ROLE)
      || String(right.created_at || "").localeCompare(String(left.created_at || ""))
    ));
};

export const getVehicleCoverPhoto = (payload) => (
  getVehiclePhotos(payload).find((photo) => photo.role === VEHICLE_COVER_ROLE)
  || getVehiclePhotos(payload)[0]
  || null
);

export async function uploadVehiclePhoto({ file, userId, householdId, vehicleId, makeCover = false }) {
  const validationError = validateVehiclePhoto(file);
  if (validationError) throw new Error(validationError);
  const document = await uploadKfzDocument({
    file,
    userId,
    householdId,
    entityType: "home_fahrzeuge",
    entityId: vehicleId,
    role: VEHICLE_PHOTO_ROLE,
    category: "Kfz-Fahrzeugfoto",
  });
  if (makeCover) await setVehicleCoverPhoto({ householdId, vehicleId, documentId: document.id });
  return document;
}

export async function setVehicleCoverPhoto({ householdId, vehicleId, documentId }) {
  const { error } = await supabase.rpc("set_kfz_vehicle_cover", {
    p_household_id: householdId,
    p_vehicle_id: vehicleId,
    p_document_id: documentId,
  });
  if (error) throw error;
}

export async function deleteVehiclePhoto(document) {
  await removeKfzDocument(document);
}

export async function deleteVehiclePhotos({ documents = [], links = [], vehicleId }) {
  const photos = getVehiclePhotos({ documents, links, vehicleId });
  for (const photo of photos) {
    await removeKfzDocument(photo);
  }
}

export const loadVehiclePhotoUrl = (document) => createKfzDocumentUrl(document);
