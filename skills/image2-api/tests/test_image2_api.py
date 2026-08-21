import importlib.util
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "image2_api.py"
SPEC = importlib.util.spec_from_file_location("image2_api", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class Image2ApiTests(unittest.TestCase):
    def test_derive_endpoints_from_host(self):
        self.assertEqual(
            MODULE.derive_endpoints("https://example.com/"),
            (
                "https://example.com/v1/images/generations",
                "https://example.com/v1/images/edits",
            ),
        )

    def test_derive_endpoints_from_v1_prefix(self):
        self.assertEqual(
            MODULE.derive_endpoints("https://example.com/v1"),
            (
                "https://example.com/v1/images/generations",
                "https://example.com/v1/images/edits",
            ),
        )

    def test_build_bearer_header(self):
        headers = MODULE.build_headers("secret", "Authorization", "Bearer", {})
        self.assertEqual(headers["Authorization"], "Bearer secret")

    def test_build_raw_key_header(self):
        headers = MODULE.build_headers("secret", "x-api-key", "", {})
        self.assertEqual(headers["x-api-key"], "secret")

    def test_extract_multiple_image_formats(self):
        refs = MODULE.extract_image_refs(
            {"data": [{"url": "https://example.com/a.png"}, {"b64_json": "YWJj"}]}
        )
        self.assertEqual([item["kind"] for item in refs], ["url", "b64"])

    def test_cli_values_override_preset(self):
        self.assertEqual(
            MODULE.apply_preset("square", "1536x1024", "high", preserve_size=True, preserve_quality=True),
            ("1536x1024", "high"),
        )


if __name__ == "__main__":
    unittest.main()
