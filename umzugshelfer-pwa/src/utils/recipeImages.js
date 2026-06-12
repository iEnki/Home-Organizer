export const RECIPE_IMAGE_BUCKET = "recipe-images";
export const RECIPE_IMAGE_URL_TTL_SECONDS = 6 * 60 * 60;

export const getRecipeImageUrl = (recipe) =>
  recipe?.thumbnail_signed_url || recipe?.thumbnail_url || null;

export async function signRecipeImageUrls(supabase, recipes = []) {
  const paths = [...new Set(
    recipes.map((recipe) => recipe?.thumbnail_storage_path).filter(Boolean),
  )];
  if (paths.length === 0) return recipes;

  const { data, error } = await supabase.storage
    .from(RECIPE_IMAGE_BUCKET)
    .createSignedUrls(paths, RECIPE_IMAGE_URL_TTL_SECONDS);
  if (error) {
    console.warn("Rezeptbilder konnten nicht signiert werden", error);
    return recipes;
  }

  const signedByPath = new Map(
    (data || [])
      .filter((entry) => entry?.path && entry?.signedUrl)
      .map((entry) => [entry.path, entry.signedUrl]),
  );
  return recipes.map((recipe) => ({
    ...recipe,
    thumbnail_signed_url: signedByPath.get(recipe.thumbnail_storage_path) || null,
  }));
}

export async function signRecipeImageUrl(supabase, recipe) {
  if (!recipe) return recipe;
  const [signed] = await signRecipeImageUrls(supabase, [recipe]);
  return signed || recipe;
}

export async function removeRecipeImage(supabase, recipe) {
  if (!recipe?.thumbnail_storage_path) return;
  const { error } = await supabase.storage
    .from(RECIPE_IMAGE_BUCKET)
    .remove([recipe.thumbnail_storage_path]);
  if (error) throw error;
}
