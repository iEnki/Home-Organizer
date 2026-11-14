process.env.REACT_APP_SUPABASE_URL = "https://example.supabase.co";
process.env.REACT_APP_SUPABASE_ANON_KEY = "test-anon-key";

jest.mock("../supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { access_token: "test-token" } },
      })),
    },
    storage: {
      from: jest.fn(() => ({ remove: jest.fn(async () => ({ error: null })) })),
    },
  },
}));

jest.mock("./kiClient", () => ({
  cleanKiJsonResponse: jest.fn(),
  getKiClient: jest.fn(),
}));

const { persistSelectedBookCover, sanitizeExternalUrl } = require("./bookSearch");

test("accepts known external book cover hosts and rejects arbitrary hosts", () => {
  expect(sanitizeExternalUrl("http://covers.openlibrary.org/b/id/1-L.jpg"))
    .toBe("https://covers.openlibrary.org/b/id/1-L.jpg");
  expect(sanitizeExternalUrl("https://example.org/cover.jpg")).toBeNull();
});

test("persists an external cover through the authenticated edge function", async () => {
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({
      publicUrl: "https://example.supabase.co/storage/v1/object/public/book-covers/h/b/1.jpg",
      storagePath: "h/b/1.jpg",
    }),
  });

  const result = await persistSelectedBookCover({
    householdId: "household-1",
    bookId: "book-1",
    selectedCoverUrl: "https://covers.openlibrary.org/b/id/1-L.jpg",
    token: "test-token",
  });

  expect(result.storagePath).toBe("h/b/1.jpg");
  expect(fetchMock).toHaveBeenCalledWith(
    "https://example.supabase.co/functions/v1/book-search",
    expect.objectContaining({ method: "POST" }),
  );
  const request = fetchMock.mock.calls[0][1];
  expect(JSON.parse(request.body)).toEqual({
    action: "persist-cover",
    household_id: "household-1",
    book_id: "book-1",
    cover_url: "https://covers.openlibrary.org/b/id/1-L.jpg",
  });
  fetchMock.mockRestore();
});
