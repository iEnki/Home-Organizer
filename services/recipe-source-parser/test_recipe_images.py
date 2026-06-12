import unittest
from unittest.mock import Mock, patch

import server


class FakeImageResponse:
    def __init__(self, content_type="image/jpeg", chunks=None, headers=None):
        self.url = "https://cdn.example/cover"
        self.headers = {"Content-Type": content_type, **(headers or {})}
        self._chunks = chunks or [b"image"]

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def raise_for_status(self):
        return None

    def iter_content(self, _chunk_size):
        return iter(self._chunks)


class RecipeImageTests(unittest.TestCase):
    @patch.object(server, "extract_metadata")
    def test_social_metadata_refresh_is_added_after_saved_url(self, extract_metadata):
        extract_metadata.return_value = {"thumbnail_url": "https://fresh.example/cover.jpg"}
        result = server.recipe_image_candidates({
            "quelle_url": "https://www.tiktok.com/@cook/video/1",
            "quelle_plattform": "tiktok",
            "thumbnail_url": "https://expired.example/cover.jpg",
        })
        self.assertEqual(result, [
            "https://expired.example/cover.jpg",
            "https://fresh.example/cover.jpg",
        ])

    @patch.object(server, "run")
    def test_social_thumbnail_is_downloaded_with_ytdlp(self, run):
        def create_thumbnail(_command, timeout):
            self.assertEqual(timeout, 90)
            output_index = _command.index("-o") + 1
            output_template = _command[output_index]
            path = output_template.replace("%(ext)s", "webp")
            with open(path, "wb") as image:
                image.write(b"webp-image")
            return ""

        run.side_effect = create_thumbnail
        content, content_type = server.download_social_recipe_image(
            "https://www.tiktok.com/@cook/video/1",
        )
        self.assertEqual(content, b"webp-image")
        self.assertEqual(content_type, "image/webp")

    @patch.object(server, "validate_url", side_effect=lambda value: value)
    @patch.object(server.requests, "get")
    def test_download_accepts_supported_image(self, requests_get, _validate_url):
        requests_get.return_value = FakeImageResponse(content_type="image/webp", chunks=[b"a", b"b"])
        content, content_type = server.download_recipe_image("https://cdn.example/cover")
        self.assertEqual(content, b"ab")
        self.assertEqual(content_type, "image/webp")

    @patch.object(server, "validate_url", side_effect=lambda value: value)
    @patch.object(server.requests, "get")
    def test_download_rejects_unsupported_mime(self, requests_get, _validate_url):
        requests_get.return_value = FakeImageResponse(content_type="text/html")
        with self.assertRaisesRegex(RuntimeError, "Unsupported"):
            server.download_recipe_image("https://cdn.example/cover")

    @patch.object(server, "validate_url", side_effect=lambda value: value)
    @patch.object(server.requests, "get")
    def test_download_rejects_oversized_stream(self, requests_get, _validate_url):
        requests_get.return_value = FakeImageResponse(
            chunks=[b"x" * (server.RECIPE_IMAGE_MAX_BYTES + 1)],
        )
        with self.assertRaisesRegex(RuntimeError, "exceeds 5 MB"):
            server.download_recipe_image("https://cdn.example/cover")


if __name__ == "__main__":
    unittest.main()
