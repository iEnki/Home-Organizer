import {
  getRecipeImageUrl,
  removeRecipeImage,
  signRecipeImageUrls,
} from "./recipeImages";

describe("recipeImages", () => {
  test("prefers a signed storage URL over the external URL", () => {
    expect(getRecipeImageUrl({
      thumbnail_signed_url: "https://signed.example/cover",
      thumbnail_url: "https://external.example/cover",
    })).toBe("https://signed.example/cover");
  });

  test("falls back to the external URL", () => {
    expect(getRecipeImageUrl({ thumbnail_url: "https://external.example/cover" }))
      .toBe("https://external.example/cover");
  });

  test("signs unique storage paths in one request", async () => {
    const createSignedUrls = jest.fn().mockResolvedValue({
      data: [
        { path: "house/one/cover.jpg", signedUrl: "https://signed/one" },
        { path: "house/two/cover.webp", signedUrl: "https://signed/two" },
      ],
      error: null,
    });
    const from = jest.fn(() => ({ createSignedUrls }));
    const supabase = { storage: { from } };
    const recipes = await signRecipeImageUrls(supabase, [
      { id: "one", thumbnail_storage_path: "house/one/cover.jpg", thumbnail_url: "external-one" },
      { id: "two", thumbnail_storage_path: "house/two/cover.webp", thumbnail_url: "external-two" },
      { id: "three", thumbnail_storage_path: "house/one/cover.jpg" },
    ]);

    expect(createSignedUrls).toHaveBeenCalledWith(
      ["house/one/cover.jpg", "house/two/cover.webp"],
      21600,
    );
    expect(recipes[0].thumbnail_signed_url).toBe("https://signed/one");
    expect(recipes[1].thumbnail_signed_url).toBe("https://signed/two");
    expect(recipes[2].thumbnail_signed_url).toBe("https://signed/one");
  });

  test("removes the stored image when a path exists", async () => {
    const remove = jest.fn().mockResolvedValue({ error: null });
    const supabase = { storage: { from: jest.fn(() => ({ remove })) } };
    await removeRecipeImage(supabase, { thumbnail_storage_path: "house/id/cover.jpg" });
    expect(remove).toHaveBeenCalledWith(["house/id/cover.jpg"]);
  });
});
