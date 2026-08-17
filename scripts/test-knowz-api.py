#!/usr/bin/env python3
"""Focused tests for the portable Knowz API skill client."""

from __future__ import annotations

import argparse
import base64
import contextlib
import hashlib
import importlib.util
import io
import json
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
CLIENT_PATH = ROOT / "knowz" / "skills" / "knowz-api" / "scripts" / "knowz_api.py"
sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location("knowz_api_skill_client", CLIENT_PATH)
assert SPEC and SPEC.loader
CLIENT = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = CLIENT
SPEC.loader.exec_module(CLIENT)


def fixture_document() -> dict:
    return {
        "openapi": "3.0.4",
        "info": {"title": "Knowz API", "version": "test"},
        "paths": {
            "/api/v1/knowledge/{id}": {
                "get": {
                    "operationId": "GetKnowledge",
                    "parameters": [
                        {
                            "name": "id",
                            "in": "path",
                            "required": True,
                            "schema": {"type": "string", "format": "uuid"},
                        }
                    ],
                    "responses": {
                        "200": {
                            "description": "OK",
                            "content": {
                                "application/json": {
                                    "schema": {"$ref": "#/components/schemas/Envelope"}
                                }
                            },
                        }
                    },
                },
                "delete": {"operationId": "DeleteKnowledge", "responses": {"204": {"description": "Deleted"}}},
            },
            "/api/v1/files/{fileRecordId}/reprocess": {
                "post": {"operationId": "ReprocessFile", "responses": {"200": {"description": "OK"}}}
            },
            "/api/v1/knowledge/reindex-all": {
                "post": {"operationId": "ReindexAllKnowledge", "responses": {"200": {"description": "OK"}}}
            },
            "/api/v1/users/api-key/reveal": {
                "get": {"operationId": "RevealUserApiKey", "responses": {"200": {"description": "OK"}}}
            },
            "/api/v1/inbox-items/batch-convert": {
                "post": {"operationId": "BatchConvertInboxItems", "responses": {"200": {"description": "OK"}}}
            },
        },
        "components": {
            "schemas": {
                "Envelope": {
                    "type": "object",
                    "required": ["success"],
                    "properties": {
                        "success": {"type": "boolean"},
                        "data": {"$ref": "#/components/schemas/Knowledge"},
                    },
                },
                "Knowledge": {
                    "type": "object",
                    "properties": {"id": {"type": "string", "format": "uuid"}},
                },
            }
        },
    }


class PolicyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.document = fixture_document()

    def test_allows_core_read_and_single_target_reprocess(self) -> None:
        self.assertEqual(CLIENT.find_operation(self.document, "GetKnowledge").method, "GET")
        self.assertEqual(CLIENT.find_operation(self.document, "ReprocessFile").method, "POST")

    def test_blocks_destructive_sensitive_bulk_and_unreviewed_operations(self) -> None:
        for selector in (
            "DeleteKnowledge",
            "ReindexAllKnowledge",
            "RevealUserApiKey",
            "BatchConvertInboxItems",
        ):
            with self.subTest(selector=selector), self.assertRaises(CLIENT.PolicyError):
                CLIENT.find_operation(self.document, selector)

    def test_describe_resolves_nested_component_schemas(self) -> None:
        operation = CLIENT.find_operation(self.document, "GetKnowledge")
        description = CLIENT.describe_operation(operation, self.document)
        response = description["responses"]["200"]["content"]["application/json"]
        self.assertEqual(response["$ref"], "Envelope")
        self.assertEqual(response["properties"]["data"]["$ref"], "Knowledge")
        self.assertEqual(response["properties"]["data"]["properties"]["id"]["format"], "uuid")

    def test_redacts_secret_shaped_response_fields(self) -> None:
        value = CLIENT.redact({"apiKey": "secret", "nested": {"accessToken": "token"}, "safe": "value"})
        self.assertEqual(value["apiKey"], "[REDACTED]")
        self.assertEqual(value["nested"]["accessToken"], "[REDACTED]")
        self.assertEqual(value["safe"], "value")


class WorkflowTests(unittest.TestCase):
    def upload_args(self, file_path: Path) -> argparse.Namespace:
        return argparse.Namespace(
            execute=True,
            file=str(file_path),
            create_as="knowledge",
            vault_id=str(uuid.uuid4()),
            parent_knowledge_id=None,
            client_created_at="2026-08-17T12:00:00Z",
            base_url=None,
            key_env="KNOWZ_API_KEY",
            content_type="text/plain",
            timeout=10.0,
            no_transcription=False,
            title="Fixture",
        )

    def test_chunked_upload_uses_server_chunk_size_and_expected_hashes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            file_path = Path(directory) / "fixture.txt"
            file_path.write_bytes(b"abcdef")
            post_calls = []
            chunk_calls = []

            def fake_post_json(**kwargs):
                post_calls.append(kwargs)
                if kwargs["path"].endswith("/initialize"):
                    return {
                        "success": True,
                        "data": {
                            "uploadId": "upload-1",
                            "fileRecordId": str(uuid.uuid4()),
                            "chunkSize": 3,
                            "totalChunks": 2,
                        },
                    }
                return {"success": True, "data": {"processingStatus": "Pending"}}

            def fake_http_call(**kwargs):
                chunk_calls.append(kwargs)
                return 200, {"Content-Type": "application/json"}, b'{"success":true}'

            with (
                patch.object(CLIENT, "resolve_base_url", return_value="https://api.example.test"),
                patch.object(CLIENT, "require_api_key", return_value="private-key"),
                patch.object(CLIENT, "post_json", side_effect=fake_post_json),
                patch.object(CLIENT, "http_call", side_effect=fake_http_call),
                contextlib.redirect_stdout(io.StringIO()),
                contextlib.redirect_stderr(io.StringIO()),
            ):
                result = CLIENT.command_upload(self.upload_args(file_path))

            self.assertEqual(result, 0)
            self.assertEqual([call["body"] for call in chunk_calls], [b"abc", b"def"])
            expected_md5 = [
                base64.b64encode(hashlib.md5(chunk).digest()).decode("ascii")  # noqa: S324 - checksum fixture
                for chunk in (b"abc", b"def")
            ]
            self.assertEqual(
                [call["headers"]["X-Chunk-Hash"] for call in chunk_calls],
                expected_md5,
            )
            complete = post_calls[-1]
            self.assertEqual(complete["headers"]["X-File-Hash"], hashlib.sha256(b"abcdef").hexdigest())
            self.assertEqual(complete["payload"]["createAs"], "knowledge")
            self.assertEqual(complete["payload"]["fileSize"], 6)

    def test_fixed_reprocess_posts_without_inventing_a_body(self) -> None:
        target = str(uuid.uuid4())
        calls = []

        def fake_http_call(**kwargs):
            calls.append(kwargs)
            return 200, {"Content-Type": "application/json"}, json.dumps({"success": True}).encode()

        args = argparse.Namespace(
            execute=True,
            target=target,
            base_url=None,
            key_env="KNOWZ_API_KEY",
            timeout=10.0,
        )
        with (
            patch.object(CLIENT, "resolve_base_url", return_value="https://api.example.test"),
            patch.object(CLIENT, "require_api_key", return_value="private-key"),
            patch.object(CLIENT, "http_call", side_effect=fake_http_call),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            result = CLIENT.command_reprocess(args)

        self.assertEqual(result, 0)
        self.assertEqual(calls[0]["method"], "POST")
        self.assertNotIn("body", calls[0])
        self.assertEqual(calls[0]["path"], f"/api/v1/files/{target}/reprocess")

    def test_generic_multipart_rejects_large_file_before_reading_it(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            file_path = Path(directory) / "large.bin"
            with file_path.open("wb") as handle:
                handle.seek(CLIENT.MAX_MULTIPART_BYTES)
                handle.write(b"x")
            with (
                patch.object(Path, "read_bytes", side_effect=AssertionError("must not read oversized file")),
                self.assertRaisesRegex(CLIENT.ClientError, "guarded upload workflow"),
            ):
                CLIENT.multipart_body([], [("file", str(file_path))])


class CredentialTests(unittest.TestCase):
    def setUp(self) -> None:
        self.key = "ukz_" + "A" * 32

    def test_environment_is_the_first_automatic_credential_source(self) -> None:
        with patch.dict(CLIENT.os.environ, {"KNOWZ_API_KEY": self.key}, clear=True):
            candidate, mcp, cli = CLIENT.resolve_credential("KNOWZ_API_KEY")
        self.assertEqual(candidate.kind, "environment")
        self.assertEqual(candidate.key, self.key)
        self.assertEqual(mcp, [])
        self.assertIsNone(cli)

    def test_mcp_api_key_is_reused_but_oauth_is_not(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            gemini = root / ".gemini/settings.json"
            gemini.parent.mkdir()
            gemini.write_text(
                json.dumps(
                    {
                        "mcpServers": {
                            "knowz": {
                                "httpUrl": "https://mcp.example.test/mcp",
                                "headers": {"Authorization": f"Bearer {self.key}"},
                            }
                        }
                    }
                )
            )
            with (
                patch.dict(CLIENT.os.environ, {}, clear=True),
                patch.object(CLIENT, "codex_mcp_observation", return_value=None),
            ):
                candidate, observations, _ = CLIENT.resolve_credential(
                    "KNOWZ_API_KEY", credential_source="mcp", project_dir=root
                )
            self.assertEqual(candidate.key, self.key)
            self.assertTrue(observations[0].usable)

            gemini.write_text(
                json.dumps(
                    {
                        "mcpServers": {
                            "knowz": {
                                "httpUrl": "https://mcp.example.test/mcp",
                                "authProviderType": "dynamic_discovery",
                            }
                        }
                    }
                )
            )
            with (
                patch.dict(CLIENT.os.environ, {}, clear=True),
                patch.object(CLIENT, "codex_mcp_observation", return_value=None),
            ):
                candidate, observations, _ = CLIENT.resolve_credential(
                    "KNOWZ_API_KEY", credential_source="mcp", project_dir=root
                )
            self.assertIsNone(candidate)
            self.assertEqual(observations[0].kind, "oauth")

    def test_codex_mcp_environment_reference_is_reused(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "config.toml"
            config.write_text(
                '[mcp_servers.knowz]\nurl = "https://mcp.knowz.io/mcp"\n'
                'bearer_token_env_var = "SHARED_KNOWZ_KEY"\n'
            )
            with patch.dict(CLIENT.os.environ, {"SHARED_KNOWZ_KEY": self.key}, clear=True):
                observation = CLIENT.codex_mcp_observation(config)
        self.assertTrue(observation.usable)
        self.assertEqual(observation.env_name, "SHARED_KNOWZ_KEY")
        self.assertEqual(observation.candidate.key, self.key)

    def test_cli_macos_keychain_is_reused_without_printing_the_key(self) -> None:
        status = {
            "authenticated": True,
            "profile": "prod",
            "apiUrl": "https://api.knowz.io",
            "backend": "keychain",
            "fileKeyMode": None,
        }
        runs = [
            SimpleNamespace(returncode=0, stdout=json.dumps(status)),
            SimpleNamespace(returncode=0, stdout=self.key + "\n"),
        ]

        def which(name: str) -> str | None:
            return f"/usr/bin/{name}" if name in {"knowz", "security"} else None

        with (
            patch.object(CLIENT.shutil, "which", side_effect=which),
            patch.object(CLIENT.subprocess, "run", side_effect=runs),
            patch.object(CLIENT.sys, "platform", "darwin"),
        ):
            observation = CLIENT.detect_cli_auth()
        self.assertEqual(observation.candidate.key, self.key)
        self.assertNotIn(self.key, json.dumps(CLIENT.cli_observation_json(observation)))

    def test_guided_setup_report_never_contains_discovered_secret(self) -> None:
        candidate = CLIENT.CredentialCandidate(self.key, "mcp-config", "fixture MCP config")
        args = argparse.Namespace(
            key_env="KNOWZ_API_KEY",
            credential_source="auto",
            project_dir=None,
            timeout=5.0,
            base_url=None,
            spec=None,
            no_verify=True,
            json_output=True,
        )
        output = io.StringIO()
        with (
            patch.object(CLIENT, "resolve_credential", return_value=(candidate, [], None)),
            patch.object(CLIENT, "resolve_base_url", return_value="https://api.example.test"),
            patch.object(CLIENT, "load_spec", return_value=CLIENT.SpecBundle(fixture_document(), "fixture.json")),
            contextlib.redirect_stdout(output),
        ):
            result = CLIENT.command_setup(args)
        self.assertEqual(result, 0)
        self.assertNotIn(self.key, output.getvalue())
        self.assertTrue(json.loads(output.getvalue())["ready"])

    def test_auth_check_accepts_deployed_response_envelope(self) -> None:
        response = json.dumps({"success": True, "data": {"isValid": True}}).encode()
        with patch.object(
            CLIENT,
            "http_call",
            return_value=(200, {"Content-Type": "application/json"}, response),
        ):
            status = CLIENT.validate_api_key("https://api.example.test", self.key, 5.0)
        self.assertEqual(status, 200)


if __name__ == "__main__":
    unittest.main()
