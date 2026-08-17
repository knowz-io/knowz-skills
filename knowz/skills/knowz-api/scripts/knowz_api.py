#!/usr/bin/env python3
"""Guarded OpenAPI discovery and private-key client for the Knowz API."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urljoin, urlparse
from urllib.request import Request, urlopen


HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options", "trace"}
READ_METHODS = {"GET", "HEAD"}
DEFAULT_BASE_URL = "https://api.knowz.io"
MAX_RESPONSE_BYTES = 64 * 1024 * 1024
MAX_GENERIC_BODY_BYTES = 128 * 1024 * 1024
MAX_MULTIPART_BYTES = 64 * 1024 * 1024

SAFE_WORKFLOW_OPERATIONS = {
    "InitializeUpload",
    "UploadChunk",
    "CompleteUpload",
    "GetUploadProgress",
    "ReprocessFile",
    "ReindexKnowledgeItem",
}

BLOCKED_PATH_PATTERNS = (
    r"^/api/v1/(?:admin|superadmin)(?:/|$)",
    r"^/api/v1/(?:auth|bootstrap|diagnostics|audit)(?:/|$)",
    r"^/api/v1/(?:data-management|portability|federation|sync)(?:/|$)",
    r"^/api/v1/(?:feature-flags|resource-grants?|tenant-resources)(?:/|$)",
    r"^/api/v1/(?:billing|subscriptions?|deployments?|infrastructure)(?:/|$)",
    r"^/api/v1/(?:api-keys?|secrets?|credentials?|permissions?|invitations?)(?:/|$)",
    r"^/api/v1/(?:github|webhooks?|email-routing|sms)(?:/|$)",
    r"^/api/v1/(?:moderation|processing-rules)(?:/|$)",
    r"^/api/v1/(?:ai-services|ai/config|ai/prompts|chat-config)(?:/|$)",
    r"^/api/v1/(?:jobs|agent/tasks|workflow|sequences?)(?:/|$)",
    r"^/api/v1/(?:organizations?|sites)(?:/|$)",
    r"^/api/v1/(?:public|widget-keys?)(?:/|$)",
    r"^/api/v1/(?:shared-vaults?|share-groups?)(?:/|$)",
    r"^/api/v1/(?:tenant|tenants)(?:/|$)",
)

BLOCKED_TAG_PATTERNS = (
    r"admin",
    r"authentication",
    r"identity",
    r"oauth",
    r"sso",
    r"billing",
    r"diagnostic",
    r"cache",
    r"audit",
    r"feature.?flag",
    r"resource.?grant",
    r"tenant.?resource",
    r"data.?management",
    r"portability",
    r"federat",
    r"moderation",
    r"processing.?rules",
    r"email.?routing",
    r"github",
    r"webhook",
    r"deployment",
    r"organization",
    r"customer.?sites",
    r"public.?sites",
    r"workflow",
    r"ai.?configuration",
    r"ai.?prompts",
)

BLOCKED_OPERATION_WORDS = (
    "delete",
    "purge",
    "wipe",
    "destroy",
    "reset",
    "remove",
    "revoke",
    "clear",
    "cleanup",
    "bootstrap",
    "impersonate",
    "rotate",
    "merge",
    "transfer",
    "publish",
    "provision",
    "cancel",
    "restore",
    "migrate",
)

BLOCKED_EXACT_OPERATIONS = {
    "IndexAllKnowledge",
    "ReindexAllKnowledge",
    "ProcessFileNow",
    "UploadZipToVault",
}

ALLOWED_CLIENT_PATH_PATTERNS = (
    r"^/api/v1/knowledge(?:/|$)",
    r"^/api/v1/knowledge-item-types(?:/|$)",
    r"^/api/v1/vaults(?:/|$)",
    r"^/api/v1/files(?:/|$)",
    r"^/api/v1/filesystem(?:/|$)",
    r"^/api/v1/attachments(?:/|$)",
    r"^/api/v1/(?:entities|persons|locations|events)(?:/|$)",
    r"^/api/v1/(?:custom-entities|custom-entity-types)(?:/|$)",
    r"^/api/v1/(?:topics|tags|comments)(?:/|$)",
    r"^/api/v1/(?:graph|explore|query|temporal-contexts)(?:/|$)",
    r"^/api/v1/(?:perspectives|inbox-items|conversations|chat)(?:/|$)",
    r"^/api/v1/(?:datalists|enrichment|reasoning-traces)(?:/|$)",
    r"^/api/v1/(?:docs|usage)(?:/|$)",
)

SENSITIVE_RESPONSE_KEYS = re.compile(
    r"(?:password|passphrase|token|secret|credential|private.?key|api.?key|connection.?string)",
    re.IGNORECASE,
)
FORBIDDEN_CALLER_HEADERS = {
    "authorization",
    "x-api-key",
    "cookie",
    "set-cookie",
    "host",
    "content-length",
    "proxy-authorization",
}

API_KEY_PREFIXES = ("ukz_", "kz_", "ksh_", "sh-")
MCP_PROJECT_CONFIG_NAMES = (
    Path(".gemini/settings.json"),
    Path(".mcp.json"),
    Path(".vscode/mcp.json"),
    Path(".cursor/mcp.json"),
    Path(".claude/settings.local.json"),
)


class ClientError(RuntimeError):
    """A safe, user-facing client failure."""


class PolicyError(ClientError):
    """The selected operation is outside the skill's safe surface."""


class ApiError(ClientError):
    """The API returned a transport or application error."""


@dataclass(frozen=True)
class SpecBundle:
    document: dict[str, Any]
    source: str


@dataclass(frozen=True)
class Operation:
    method: str
    path: str
    value: dict[str, Any]
    path_item: dict[str, Any]

    @property
    def operation_id(self) -> str:
        return str(self.value.get("operationId") or "")

    @property
    def label(self) -> str:
        return self.operation_id or f"{self.method} {self.path}"

    @property
    def tags(self) -> list[str]:
        return [str(tag) for tag in self.value.get("tags", [])]


@dataclass(frozen=True)
class CredentialCandidate:
    key: str
    kind: str
    source: str
    env_name: str | None = None


@dataclass(frozen=True)
class McpAuthObservation:
    source: str
    kind: str
    usable: bool
    env_name: str | None = None
    candidate: CredentialCandidate | None = None


@dataclass(frozen=True)
class CliAuthObservation:
    installed: bool
    authenticated: bool | None = None
    profile: str | None = None
    api_url: str | None = None
    backend: str | None = None
    file_key_mode: str | None = None
    candidate: CredentialCandidate | None = None
    detail: str | None = None


def eprint(*values: object) -> None:
    print(*values, file=sys.stderr)


def read_json_file(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ClientError(f"Unable to read JSON file {path}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise ClientError(f"Invalid JSON in {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ClientError(f"Expected one JSON object in {path}")
    return value


def find_enterprise_config(start: Path) -> dict[str, Any] | None:
    for directory in (start, *start.parents):
        candidate = directory / "enterprise.json"
        if candidate.is_file():
            try:
                return read_json_file(candidate)
            except ClientError:
                return None
    return None


def normalize_base_url(value: str) -> str:
    value = value.strip().rstrip("/")
    if value.endswith("/api/v1"):
        value = value[: -len("/api/v1")]
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ClientError(f"Invalid Knowz API base URL: {value!r}")
    if parsed.scheme == "http" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise ClientError("Plain HTTP is permitted only for loopback Knowz API servers")
    return value


def load_cli_profile_metadata() -> dict[str, Any] | None:
    """Load non-secret CLI profile metadata without touching its credential store."""
    configured_dir = os.environ.get("KNOWZ_CONFIG_DIR", "").strip()
    config_path = Path(configured_dir).expanduser() / "config.json" if configured_dir else Path.home() / ".knowz/config.json"
    if not config_path.is_file():
        return None
    try:
        config = read_json_file(config_path)
    except ClientError:
        return None
    profile = config.get("activeProfile")
    profiles = config.get("profiles")
    if not isinstance(profile, str) or not isinstance(profiles, dict):
        return None
    value = profiles.get(profile)
    if not isinstance(value, dict):
        return None
    api_url = value.get("apiUrl")
    if not isinstance(api_url, str) or not api_url.strip():
        return None
    return {"profile": profile, "apiUrl": api_url.strip(), "configPath": str(config_path)}


def resolve_base_url(explicit: str | None) -> str:
    if explicit:
        return normalize_base_url(explicit)
    configured = os.environ.get("KNOWZ_API_URL", "").strip()
    if configured:
        return normalize_base_url(configured)
    enterprise = find_enterprise_config(Path.cwd().resolve())
    endpoint = enterprise.get("api_endpoint") if enterprise else None
    if isinstance(endpoint, str) and endpoint.strip():
        return normalize_base_url(endpoint)
    cli_profile = load_cli_profile_metadata()
    if cli_profile:
        return normalize_base_url(str(cli_profile["apiUrl"]))
    return DEFAULT_BASE_URL


def read_limited(response: Any, limit: int = MAX_RESPONSE_BYTES) -> bytes:
    data = response.read(limit + 1)
    if len(data) > limit:
        raise ApiError(f"Response exceeded the {limit // (1024 * 1024)} MiB client limit")
    return data


def fetch_json_url(url: str, timeout: float) -> dict[str, Any]:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ClientError(f"Unsupported OpenAPI URL: {url}")
    if parsed.scheme == "http" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise ClientError("Plain HTTP OpenAPI URLs are permitted only for loopback hosts")
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "knowz-api-skill/1"})
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = read_limited(response)
    except (HTTPError, URLError, TimeoutError) as exc:
        raise ClientError(f"Unable to load OpenAPI document from {url}: {exc}") from exc
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ClientError(f"OpenAPI URL did not return valid JSON: {url}: {exc}") from exc
    if not isinstance(value, dict):
        raise ClientError(f"OpenAPI URL did not return a JSON object: {url}")
    return value


def local_spec_candidates() -> list[Path]:
    cwd = Path.cwd().resolve()
    roots: list[Path] = []
    for directory in (cwd, *cwd.parents):
        roots.append(directory)
        roots.append(directory / "knowz-platform")
        roots.append(directory.parent / "knowz-platform")
    roots.append(Path.home() / "Code" / "knowz-platform")

    candidates: list[Path] = []
    relative_names = (
        Path("clients/hereforever-mobile-swift/docs/knowz-api-swagger.json"),
        Path("swagger/v1/swagger.json"),
        Path("openapi.json"),
        Path("swagger.json"),
    )
    seen: set[Path] = set()
    for root in roots:
        for relative_name in relative_names:
            candidate = (root / relative_name).resolve()
            if candidate not in seen:
                seen.add(candidate)
                candidates.append(candidate)
    return candidates


def validate_openapi(document: dict[str, Any], source: str) -> None:
    if not isinstance(document.get("paths"), dict) or not document["paths"]:
        raise ClientError(f"OpenAPI document has no paths: {source}")
    if not (document.get("openapi") or document.get("swagger")):
        raise ClientError(f"JSON is not recognizably an OpenAPI/Swagger document: {source}")


def load_spec(explicit: str | None, base_url: str, timeout: float) -> SpecBundle:
    selected = explicit or os.environ.get("KNOWZ_OPENAPI_SPEC", "").strip() or None
    if selected:
        if urlparse(selected).scheme in {"http", "https"}:
            document = fetch_json_url(selected, timeout)
            validate_openapi(document, selected)
            return SpecBundle(document, selected)
        path = Path(selected).expanduser().resolve()
        document = read_json_file(path)
        validate_openapi(document, str(path))
        return SpecBundle(document, str(path))

    for candidate in local_spec_candidates():
        if candidate.is_file():
            document = read_json_file(candidate)
            validate_openapi(document, str(candidate))
            return SpecBundle(document, str(candidate))

    remote = f"{base_url}/swagger/v1/swagger.json"
    document = fetch_json_url(remote, timeout)
    validate_openapi(document, remote)
    return SpecBundle(document, remote)


def iter_operations(document: dict[str, Any]) -> Iterable[Operation]:
    for path, path_item in document.get("paths", {}).items():
        if not isinstance(path_item, dict):
            continue
        for method, value in path_item.items():
            if method.lower() not in HTTP_METHODS or not isinstance(value, dict):
                continue
            yield Operation(method.upper(), str(path), value, path_item)


def normalized_operation_text(operation: Operation) -> str:
    summary = str(operation.value.get("summary") or "")
    description = str(operation.value.get("description") or "")
    return " ".join((operation.operation_id, operation.path, *operation.tags, summary, description)).lower()


def policy_reason(operation: Operation) -> str | None:
    if operation.method == "DELETE":
        return "destructive operations are not exposed"

    path = operation.path.lower()
    if not path.startswith("/api/v1/"):
        return "internal, health, or non-client routes are not exposed"

    if operation.operation_id in SAFE_WORKFLOW_OPERATIONS:
        return None

    if operation.operation_id in BLOCKED_EXACT_OPERATIONS:
        return "bulk or synchronous processing operations are not exposed"

    for pattern in BLOCKED_PATH_PATTERNS:
        if re.search(pattern, path, flags=re.IGNORECASE):
            return "administrative, integration, or control-plane operations are not exposed"

    tags = " ".join(operation.tags)
    for pattern in BLOCKED_TAG_PATTERNS:
        if re.search(pattern, tags, flags=re.IGNORECASE):
            return "administrative, integration, or control-plane operations are not exposed"

    compact_id = re.sub(r"[^a-z0-9]", "", operation.operation_id.lower())
    if any(word in compact_id for word in BLOCKED_OPERATION_WORDS):
        return "destructive or high-impact operations are not exposed"

    if re.search(r"/(?:index-all|reindex-all|rebuild|process-now|upload-zip|batch)(?:[-/]|$)", path):
        return "bulk or synchronous processing operations are not exposed"

    if re.search(
        r"/(?:merge|restore|cleanup|reset|clear|participants|move-knowledge|sms|git-config|git-import|prompt|engagement|reconciliation)(?:/|$)",
        path,
    ):
        return "destructive, sharing, or configuration operations are not exposed"

    if "superadmin" in normalized_operation_text(operation) or "across all tenants" in normalized_operation_text(operation):
        return "cross-tenant and administrative operations are not exposed"

    if re.search(r"/(?:test|debug)(?:[-/]|$)", path) or "test only" in normalized_operation_text(operation):
        return "test and debug operations are not exposed"

    content_types = []
    for response in operation.value.get("responses", {}).values():
        if isinstance(response, dict):
            content_types.extend(response.get("content", {}).keys())
    if (
        "/stream" in path
        or "stream" in compact_id
        or any(str(value).lower() == "text/event-stream" for value in content_types)
    ):
        return "streaming and SSE operations are not exposed by this bounded client"

    if not any(re.search(pattern, path, flags=re.IGNORECASE) for pattern in ALLOWED_CLIENT_PATH_PATTERNS):
        return "this operation is not part of the reviewed tenant-scoped client surface"

    if path.startswith("/api/v1/usage/") and operation.method not in READ_METHODS:
        return "usage configuration operations are not exposed"

    return None


def find_operation(document: dict[str, Any], selector: str) -> Operation:
    selector = selector.strip()
    method_path = re.match(r"^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s+(.+)$", selector, re.I)
    matches: list[Operation] = []
    for operation in iter_operations(document):
        if method_path:
            if operation.method == method_path.group(1).upper() and operation.path == method_path.group(2).strip():
                matches.append(operation)
        elif operation.operation_id.lower() == selector.lower():
            matches.append(operation)
    if not matches:
        raise ClientError(f"Operation not found in the selected OpenAPI document: {selector}")
    if len(matches) > 1:
        choices = ", ".join(f"{item.method} {item.path}" for item in matches)
        raise ClientError(f"Operation selector is ambiguous; use method and path: {choices}")
    operation = matches[0]
    reason = policy_reason(operation)
    if reason:
        raise PolicyError(f"The requested endpoint falls outside the safe Knowz client surface: {reason}.")
    return operation


def resolve_ref(document: dict[str, Any], ref: str) -> Any:
    if not ref.startswith("#/"):
        return {"$ref": ref}
    value: Any = document
    for segment in ref[2:].split("/"):
        segment = segment.replace("~1", "/").replace("~0", "~")
        if not isinstance(value, dict) or segment not in value:
            return {"$ref": ref, "unresolved": True}
        value = value[segment]
    return value


def simplify_schema(
    schema: Any,
    document: dict[str, Any],
    *,
    depth: int = 0,
    seen: set[str] | None = None,
) -> Any:
    if not isinstance(schema, dict):
        return schema
    if depth > 7:
        return {"truncated": "schema depth limit"}
    seen = set() if seen is None else set(seen)
    if "$ref" in schema:
        ref = str(schema["$ref"])
        name = ref.rsplit("/", 1)[-1]
        if ref in seen:
            return {"$ref": name, "recursive": True}
        seen.add(ref)
        resolved = resolve_ref(document, ref)
        result = simplify_schema(resolved, document, depth=depth + 1, seen=seen)
        if isinstance(result, dict):
            return {"$ref": name, **result}
        return {"$ref": name, "value": result}

    result: dict[str, Any] = {}
    for key in (
        "type",
        "format",
        "title",
        "description",
        "nullable",
        "readOnly",
        "writeOnly",
        "default",
        "example",
        "enum",
        "required",
        "minimum",
        "maximum",
        "minLength",
        "maxLength",
        "pattern",
    ):
        if key in schema:
            result[key] = schema[key]
    if "properties" in schema and isinstance(schema["properties"], dict):
        result["properties"] = {
            name: simplify_schema(value, document, depth=depth + 1, seen=seen)
            for name, value in schema["properties"].items()
        }
    if "items" in schema:
        result["items"] = simplify_schema(schema["items"], document, depth=depth + 1, seen=seen)
    for key in ("allOf", "oneOf", "anyOf"):
        if key in schema and isinstance(schema[key], list):
            result[key] = [
                simplify_schema(value, document, depth=depth + 1, seen=seen) for value in schema[key]
            ]
    if "additionalProperties" in schema:
        value = schema["additionalProperties"]
        result["additionalProperties"] = (
            simplify_schema(value, document, depth=depth + 1, seen=seen)
            if isinstance(value, dict)
            else value
        )
    return result or schema


def operation_parameters(operation: Operation) -> list[dict[str, Any]]:
    values: list[dict[str, Any]] = []
    for source in (operation.path_item.get("parameters", []), operation.value.get("parameters", [])):
        if isinstance(source, list):
            values.extend(value for value in source if isinstance(value, dict))
    return values


def describe_operation(operation: Operation, document: dict[str, Any]) -> dict[str, Any]:
    parameters = []
    for parameter in operation_parameters(operation):
        parameters.append(
            {
                "name": parameter.get("name"),
                "in": parameter.get("in"),
                "required": bool(parameter.get("required")),
                "description": parameter.get("description"),
                "schema": simplify_schema(parameter.get("schema", {}), document),
            }
        )

    request_body = operation.value.get("requestBody")
    request_description = None
    if isinstance(request_body, dict):
        request_description = {
            "required": bool(request_body.get("required")),
            "description": request_body.get("description"),
            "content": {
                content_type: {
                    "schema": simplify_schema(value.get("schema", {}), document),
                    **({"example": value["example"]} if "example" in value else {}),
                }
                for content_type, value in request_body.get("content", {}).items()
                if isinstance(value, dict)
            },
        }

    responses: dict[str, Any] = {}
    for status, response in operation.value.get("responses", {}).items():
        if not isinstance(response, dict):
            continue
        content = response.get("content", {})
        responses[str(status)] = {
            "description": response.get("description"),
            "content": {
                content_type: simplify_schema(value.get("schema", {}), document)
                for content_type, value in content.items()
                if isinstance(value, dict)
            },
        }

    return {
        "operationId": operation.operation_id or None,
        "method": operation.method,
        "path": operation.path,
        "impact": "read" if operation.method in READ_METHODS else "mutation (--execute required)",
        "tags": operation.tags,
        "summary": operation.value.get("summary"),
        "description": operation.value.get("description"),
        "parameters": parameters,
        "requestBody": request_description,
        "responses": responses,
    }


def parse_pairs(values: list[str], label: str) -> list[tuple[str, str]]:
    pairs = []
    for value in values:
        if "=" not in value:
            raise ClientError(f"{label} must use name=value syntax: {value!r}")
        name, item = value.split("=", 1)
        if not name:
            raise ClientError(f"{label} name cannot be empty")
        pairs.append((name, item))
    return pairs


def resolve_request_path(operation: Operation, pairs: list[tuple[str, str]]) -> str:
    declared = {
        str(parameter.get("name")): parameter
        for parameter in operation_parameters(operation)
        if parameter.get("in") == "path"
    }
    provided = dict(pairs)
    unknown = sorted(set(provided) - set(declared))
    if unknown:
        raise ClientError(f"Unknown path parameter(s): {', '.join(unknown)}")
    missing = sorted(name for name, parameter in declared.items() if parameter.get("required") and name not in provided)
    if missing:
        raise ClientError(f"Missing required path parameter(s): {', '.join(missing)}")
    path = operation.path
    for name, value in provided.items():
        path = path.replace("{" + name + "}", quote(value, safe=""))
    if re.search(r"\{[^}]+\}", path):
        raise ClientError(f"Unresolved path parameter in {path}")
    return path


def validate_query_pairs(operation: Operation, pairs: list[tuple[str, str]]) -> None:
    declared = {
        str(parameter.get("name")): parameter
        for parameter in operation_parameters(operation)
        if parameter.get("in") == "query"
    }
    provided = {name for name, _ in pairs}
    unknown = sorted(provided - set(declared))
    if unknown:
        raise ClientError(f"Unknown query parameter(s): {', '.join(unknown)}")
    missing = sorted(name for name, parameter in declared.items() if parameter.get("required") and name not in provided)
    if missing:
        raise ClientError(f"Missing required query parameter(s): {', '.join(missing)}")


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: "[REDACTED]" if SENSITIVE_RESPONSE_KEYS.search(str(key)) else redact(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value


def get_ci(value: dict[str, Any], key: str, default: Any = None) -> Any:
    lower = key.lower()
    for candidate, item in value.items():
        if str(candidate).lower() == lower:
            return item
    return default


def is_private_api_key(value: str) -> bool:
    value = value.strip()
    return (
        len(value) >= 20
        and value.startswith(API_KEY_PREFIXES)
        and not any(character.isspace() or ord(character) < 32 for character in value)
    )


def display_path(path: Path) -> str:
    try:
        return f"~/{path.resolve().relative_to(Path.home().resolve())}"
    except ValueError:
        return str(path.resolve())


def value_credential_candidate(value: Any, source: str, *, bearer: bool = False) -> CredentialCandidate | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if bearer:
        if not text.lower().startswith("bearer "):
            return None
        text = text[7:].strip()
    env_match = re.fullmatch(r"(?:\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*))", text)
    if env_match:
        env_name = env_match.group(1) or env_match.group(2)
        key = os.environ.get(env_name, "").strip()
        if is_private_api_key(key):
            return CredentialCandidate(key, "mcp-environment", source, env_name)
        return None
    if is_private_api_key(text):
        return CredentialCandidate(text, "mcp-config", source)
    return None


def json_mcp_observation(path: Path) -> McpAuthObservation | None:
    if not path.is_file():
        return None
    source = display_path(path)
    try:
        config = read_json_file(path)
    except ClientError:
        return McpAuthObservation(source, "invalid-config", False)
    servers = config.get("mcpServers") or config.get("servers")
    if not isinstance(servers, dict) or not isinstance(servers.get("knowz"), dict):
        return None
    knowz = servers["knowz"]
    if knowz.get("authProviderType") or knowz.get("oauth"):
        return McpAuthObservation(source, "oauth", False)

    headers = knowz.get("headers") if isinstance(knowz.get("headers"), dict) else {}
    direct_header = get_ci(headers, "X-API-Key") or get_ci(headers, "X-Api-Key")
    candidate = value_credential_candidate(direct_header, source)
    if candidate:
        return McpAuthObservation(source, candidate.kind, True, candidate.env_name, candidate)

    authorization = get_ci(headers, "Authorization")
    candidate = value_credential_candidate(authorization, source, bearer=True)
    if candidate:
        return McpAuthObservation(source, candidate.kind, True, candidate.env_name, candidate)

    env = knowz.get("env") if isinstance(knowz.get("env"), dict) else {}
    env_value = get_ci(env, "KNOWZ_API_KEY")
    candidate = value_credential_candidate(env_value, source)
    if candidate:
        return McpAuthObservation(source, candidate.kind, True, candidate.env_name, candidate)
    if isinstance(env_value, str) and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", env_value.strip()):
        env_name = env_value.strip()
        key = os.environ.get(env_name, "").strip()
        if is_private_api_key(key):
            candidate = CredentialCandidate(key, "mcp-environment", source, env_name)
            return McpAuthObservation(source, candidate.kind, True, env_name, candidate)
        return McpAuthObservation(source, "environment-reference", False, env_name)
    return McpAuthObservation(source, "configured-without-private-key", False)


def codex_mcp_observation(path: Path | None = None) -> McpAuthObservation | None:
    if path is None:
        configured_home = os.environ.get("CODEX_HOME", "").strip()
        path = Path(configured_home).expanduser() / "config.toml" if configured_home else Path.home() / ".codex/config.toml"
    if not path.is_file():
        return None
    try:
        content = path.read_text(encoding="utf-8")
    except OSError:
        return McpAuthObservation(display_path(path), "unreadable-config", False)
    table = re.search(
        r"(?ms)^\s*\[mcp_servers\.knowz\]\s*$.*?(?=^\s*\[[^]]+\]\s*$|\Z)",
        content,
    )
    if not table:
        return None
    source = display_path(path)
    env_match = re.search(r'^\s*bearer_token_env_var\s*=\s*"([A-Za-z_][A-Za-z0-9_]*)"', table.group(0), re.M)
    if not env_match:
        return McpAuthObservation(source, "configured-without-private-key", False)
    env_name = env_match.group(1)
    key = os.environ.get(env_name, "").strip()
    if is_private_api_key(key):
        candidate = CredentialCandidate(key, "mcp-environment", source, env_name)
        return McpAuthObservation(source, candidate.kind, True, env_name, candidate)
    return McpAuthObservation(source, "environment-reference", False, env_name)


def discover_mcp_auth(project_dir: Path | None = None) -> list[McpAuthObservation]:
    root = (project_dir or Path.cwd()).expanduser().resolve()
    paths: list[Path] = []
    seen: set[Path] = set()
    for directory in (root, *root.parents):
        for relative in MCP_PROJECT_CONFIG_NAMES:
            candidate = directory / relative
            if candidate.is_file() and candidate.resolve() not in seen:
                seen.add(candidate.resolve())
                paths.append(candidate)
        if (directory / ".git").exists():
            break
    user_gemini = Path.home() / ".gemini/settings.json"
    if user_gemini.is_file() and user_gemini.resolve() not in seen:
        paths.append(user_gemini)

    observations: list[McpAuthObservation] = []
    codex = codex_mcp_observation()
    if codex:
        observations.append(codex)
    for path in paths:
        observation = json_mcp_observation(path)
        if observation:
            observations.append(observation)
    return observations


def detect_cli_auth(timeout: float = 5.0) -> CliAuthObservation:
    binary = shutil.which("knowz")
    if not binary:
        return CliAuthObservation(False, detail="Knowz CLI is not installed")
    try:
        result = subprocess.run(
            [binary, "auth", "status", "--json"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=min(max(timeout, 1.0), 15.0),
            check=False,
        )
        status = json.loads(result.stdout) if result.returncode == 0 else None
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError):
        status = None
    if not isinstance(status, dict):
        return CliAuthObservation(True, detail="Knowz CLI auth status was unavailable")

    authenticated = status.get("authenticated") is True
    profile = status.get("profile") if isinstance(status.get("profile"), str) else None
    api_url = status.get("apiUrl") if isinstance(status.get("apiUrl"), str) else None
    backend = status.get("backend") if isinstance(status.get("backend"), str) else None
    file_key_mode = status.get("fileKeyMode") if isinstance(status.get("fileKeyMode"), str) else None
    candidate = None
    detail = None
    if authenticated and backend == "keychain" and profile and sys.platform == "darwin":
        security = shutil.which("security") or ("/usr/bin/security" if Path("/usr/bin/security").is_file() else None)
        if security:
            try:
                key_result = subprocess.run(
                    [security, "find-generic-password", "-s", "knowz-cli", "-a", profile, "-w"],
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL,
                    text=True,
                    timeout=min(max(timeout, 1.0), 15.0),
                    check=False,
                )
                key = key_result.stdout.strip() if key_result.returncode == 0 else ""
                if is_private_api_key(key):
                    candidate = CredentialCandidate(
                        key,
                        "cli-keychain",
                        f"Knowz CLI keychain profile {profile!r}",
                    )
                else:
                    detail = "CLI keychain entry could not be reused; the OS may require access approval"
            except (OSError, subprocess.SubprocessError):
                detail = "CLI keychain entry could not be reused"
    elif authenticated and backend == "encrypted-file":
        detail = "CLI encrypted-file credentials are deliberately not decrypted by this skill"
    elif authenticated:
        detail = "CLI credentials need the planned credential broker on this platform"

    return CliAuthObservation(
        True,
        authenticated,
        profile,
        api_url,
        backend,
        file_key_mode,
        candidate,
        detail,
    )


def resolve_credential(
    env_name: str,
    *,
    credential_source: str = "auto",
    project_dir: Path | None = None,
    cli_timeout: float = 5.0,
) -> tuple[CredentialCandidate | None, list[McpAuthObservation], CliAuthObservation | None]:
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", env_name):
        raise ClientError(f"Invalid credential environment variable name: {env_name!r}")
    if credential_source not in {"auto", "env", "mcp", "cli"}:
        raise ClientError(f"Invalid credential source: {credential_source!r}")

    value = os.environ.get(env_name, "").strip()
    if value and credential_source in {"auto", "env"}:
        if not is_private_api_key(value):
            raise ClientError(f"{env_name} is set but is not a supported private Knowz API key")
        return CredentialCandidate(value, "environment", env_name, env_name), [], None
    if credential_source == "env":
        return None, [], None

    mcp = discover_mcp_auth(project_dir) if credential_source in {"auto", "mcp"} else []
    for observation in mcp:
        if observation.candidate:
            return observation.candidate, mcp, None
    if credential_source == "mcp":
        return None, mcp, None

    cli = detect_cli_auth(cli_timeout) if credential_source in {"auto", "cli"} else None
    if cli and cli.candidate:
        return cli.candidate, mcp, cli
    return None, mcp, cli


def require_api_key(
    env_name: str,
    credential_source: str = "auto",
    project_dir: str | None = None,
    cli_timeout: float = 5.0,
) -> str:
    candidate, _, _ = resolve_credential(
        env_name,
        credential_source=credential_source,
        project_dir=Path(project_dir) if project_dir else None,
        cli_timeout=cli_timeout,
    )
    if not candidate:
        raise ClientError(
            "No reusable private Knowz API key was found. Run `knowz_api.py setup` for guided authentication."
        )
    return candidate.key


def require_api_key_for_args(args: argparse.Namespace) -> str:
    return require_api_key(
        args.key_env,
        getattr(args, "credential_source", "auto"),
        getattr(args, "project_dir", None),
        getattr(args, "timeout", 5.0),
    )


def decode_response(raw: bytes, content_type: str) -> Any:
    if not raw:
        return None
    if "json" in content_type.lower() or raw.lstrip().startswith((b"{", b"[")):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            pass
    return raw


def response_summary(raw: bytes, content_type: str) -> str:
    value = decode_response(raw, content_type)
    if isinstance(value, (dict, list)):
        return json.dumps(redact(value), indent=2, ensure_ascii=False)
    if isinstance(value, bytes):
        return value[:2048].decode("utf-8", errors="replace")
    return str(value)


def http_call(
    *,
    base_url: str,
    method: str,
    path: str,
    api_key: str,
    timeout: float,
    query: list[tuple[str, str]] | None = None,
    headers: dict[str, str] | None = None,
    body: bytes | None = None,
) -> tuple[int, dict[str, str], bytes]:
    url = urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))
    if query:
        url += ("&" if "?" in url else "?") + urlencode(query, doseq=True)
    request_headers = {
        "Accept": "application/json",
        "User-Agent": "knowz-api-skill/1",
        "X-API-Key": api_key,
        **(headers or {}),
    }
    request = Request(url, data=body, headers=request_headers, method=method)
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = read_limited(response)
            return response.status, dict(response.headers.items()), raw
    except HTTPError as exc:
        raw = exc.read(MAX_RESPONSE_BYTES)
        content_type = exc.headers.get("Content-Type", "") if exc.headers else ""
        detail = response_summary(raw, content_type).strip()
        suffix = f": {detail}" if detail else ""
        raise ApiError(f"Knowz API returned HTTP {exc.code}{suffix}") from None
    except (URLError, TimeoutError) as exc:
        raise ApiError(f"Knowz API request failed: {exc}") from exc


def ensure_application_success(value: Any) -> None:
    if isinstance(value, dict) and get_ci(value, "success") is False:
        message = get_ci(value, "message") or get_ci(value, "error") or "application operation failed"
        raise ApiError(f"Knowz API reported failure: {message}")


def multipart_body(
    fields: list[tuple[str, str]],
    files: list[tuple[str, str]],
) -> tuple[bytes, str]:
    boundary = f"----knowz-api-{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    total = 0

    def append(value: bytes) -> None:
        nonlocal total
        total += len(value)
        if total > MAX_MULTIPART_BYTES:
            raise ClientError("Generic multipart body exceeds 64 MiB; use the guarded upload workflow")
        chunks.append(value)

    for name, value in fields:
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", name):
            raise ClientError(f"Invalid multipart field name: {name!r}")
        append(f"--{boundary}\r\n".encode())
        append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        append(value.encode())
        append(b"\r\n")
    for name, file_name in files:
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", name):
            raise ClientError(f"Invalid multipart file field name: {name!r}")
        path = Path(file_name).expanduser().resolve()
        if not path.is_file():
            raise ClientError(f"Multipart file does not exist: {path}")
        if total + path.stat().st_size + 512 > MAX_MULTIPART_BYTES:
            raise ClientError("Generic multipart body exceeds 64 MiB; use the guarded upload workflow")
        safe_name = path.name.replace('"', "")
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        append(f"--{boundary}\r\n".encode())
        append(f'Content-Disposition: form-data; name="{name}"; filename="{safe_name}"\r\n'.encode())
        append(f"Content-Type: {content_type}\r\n\r\n".encode())
        try:
            append(path.read_bytes())
        except OSError as exc:
            raise ClientError(f"Unable to read multipart file {path}: {exc}") from exc
        append(b"\r\n")
    append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def prepare_body(args: argparse.Namespace) -> tuple[bytes | None, str | None]:
    json_modes = int(bool(args.json_body)) + int(bool(args.json_file))
    body_groups = int(json_modes > 0) + int(bool(args.raw_file)) + int(bool(args.form or args.form_file))
    if json_modes > 1 or body_groups > 1:
        raise ClientError("Choose exactly one body mode: JSON, raw file, or multipart form")
    if args.json_body:
        try:
            value = json.loads(args.json_body)
        except json.JSONDecodeError as exc:
            raise ClientError(f"--json is invalid: {exc}") from exc
        return json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode(), "application/json"
    if args.json_file:
        path = Path(args.json_file).expanduser().resolve()
        value = read_json_file(path)
        return json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode(), "application/json"
    if args.raw_file:
        path = Path(args.raw_file).expanduser().resolve()
        if not path.is_file():
            raise ClientError(f"Raw body file does not exist: {path}")
        if path.stat().st_size > MAX_GENERIC_BODY_BYTES:
            raise ClientError("Raw body exceeds 128 MiB; use the guarded upload workflow")
        try:
            return path.read_bytes(), args.content_type or "application/octet-stream"
        except OSError as exc:
            raise ClientError(f"Unable to read raw body file {path}: {exc}") from exc
    if args.form or args.form_file:
        return multipart_body(parse_pairs(args.form, "--form"), parse_pairs(args.form_file, "--form-file"))
    return None, None


def validate_api_key(base_url: str, api_key: str, timeout: float) -> int:
    body = json.dumps({"apiKey": api_key}, separators=(",", ":")).encode()
    status, response_headers, raw = http_call(
        base_url=base_url,
        method="POST",
        path="/api/v1/auth/validate-key",
        api_key=api_key,
        timeout=timeout,
        headers={"Content-Type": "application/json"},
        body=body,
    )
    value = decode_response(raw, response_headers.get("Content-Type", ""))
    ensure_application_success(value)
    data = get_ci(value, "data") if isinstance(value, dict) else None
    is_valid = get_ci(value, "isValid") if isinstance(value, dict) else None
    if is_valid is None and isinstance(data, dict):
        is_valid = get_ci(data, "isValid")
    if is_valid is not True:
        raise ApiError("Knowz API did not validate the selected private API key")
    return status


def mcp_observation_json(observation: McpAuthObservation) -> dict[str, Any]:
    result: dict[str, Any] = {
        "source": observation.source,
        "kind": observation.kind,
        "usable": observation.usable,
    }
    if observation.env_name:
        result["environmentVariable"] = observation.env_name
        result["environmentVariableSet"] = bool(os.environ.get(observation.env_name, "").strip())
    return result


def cli_observation_json(observation: CliAuthObservation | None) -> dict[str, Any]:
    if not observation:
        return {"inspected": False}
    result: dict[str, Any] = {
        "inspected": True,
        "installed": observation.installed,
        "authenticated": observation.authenticated,
        "profile": observation.profile,
        "apiUrl": observation.api_url,
        "backend": observation.backend,
        "credentialReusable": observation.candidate is not None,
    }
    if observation.file_key_mode:
        result["fileKeyMode"] = observation.file_key_mode
    if observation.detail:
        result["detail"] = observation.detail
    return result


def setup_next_steps(
    candidate: CredentialCandidate | None,
    mcp: list[McpAuthObservation],
    cli: CliAuthObservation | None,
    spec_error: str | None,
    auth_error: str | None,
) -> list[str]:
    steps: list[str] = []
    if not candidate:
        unset_refs = sorted({item.env_name for item in mcp if item.env_name and not item.usable})
        if unset_refs:
            steps.append(
                f"Set {', '.join(unset_refs)} in the environment that launches the agent, then restart the agent."
            )
        if any(item.kind == "oauth" for item in mcp):
            steps.append(
                "MCP OAuth is configured, but an OAuth session is not converted into a private API key; create or reuse a private key for direct API access."
            )
        if cli and cli.authenticated and not cli.candidate:
            steps.append(
                "The Knowz CLI is signed in, but this credential backend cannot be shared safely yet; keep using the CLI for its supported commands and configure the same private key through the agent environment or an API-key MCP config for direct calls."
            )
        steps.append("Create or copy a private API key from https://app.knowz.io/settings/api-keys.")
        steps.append(
            "Set KNOWZ_API_KEY privately in the agent process (never in argv, chat, or a committed file), then rerun setup."
        )
    if spec_error:
        steps.append(
            "Set KNOWZ_OPENAPI_SPEC to the correct Swagger file/URL, or make the resolved API server's /swagger/v1/swagger.json reachable."
        )
    if auth_error:
        steps.append("Check that the private key and API base URL belong to the same Knowz environment.")
    if not steps:
        steps.append("Setup is complete; the skill can discover and call its reviewed API surface.")
    return steps


def command_setup(args: argparse.Namespace) -> int:
    project_dir = Path(args.project_dir).expanduser().resolve() if args.project_dir else Path.cwd().resolve()
    try:
        candidate, mcp, cli = resolve_credential(
            args.key_env,
            credential_source=args.credential_source,
            project_dir=project_dir,
            cli_timeout=args.timeout,
        )
        credential_error = None
    except ClientError as exc:
        candidate, mcp, cli = None, [], None
        credential_error = str(exc)

    base_url = resolve_base_url(args.base_url)
    spec_source = None
    spec_error = None
    try:
        spec_source = load_spec(args.spec, base_url, args.timeout).source
    except ClientError as exc:
        spec_error = str(exc)

    auth_status: int | None = None
    auth_error = None
    if args.no_verify:
        auth_state = "skipped"
    elif not candidate:
        auth_state = "not-run"
    else:
        try:
            auth_status = validate_api_key(base_url, candidate.key, args.timeout)
            auth_state = "passed"
        except ClientError as exc:
            auth_state = "failed"
            auth_error = str(exc)

    ready = bool(candidate and spec_source and (args.no_verify or auth_state == "passed"))
    report = {
        "ready": ready,
        "apiBaseUrl": base_url,
        "projectDirectory": str(project_dir),
        "credential": {
            "available": candidate is not None,
            "source": candidate.source if candidate else None,
            "kind": candidate.kind if candidate else None,
            "environmentVariable": candidate.env_name if candidate else None,
            "error": credential_error,
        },
        "mcp": [mcp_observation_json(item) for item in mcp],
        "cli": cli_observation_json(cli),
        "openapi": {"available": spec_source is not None, "source": spec_source, "error": spec_error},
        "authenticationCheck": {"state": auth_state, "httpStatus": auth_status, "error": auth_error},
        "nextSteps": setup_next_steps(candidate, mcp, cli, spec_error, auth_error),
    }
    if args.json_output:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print("Knowz API guided setup")
        print(f"  ready:       {'yes' if ready else 'no'}")
        print(f"  API:         {base_url}")
        print(f"  credential:  {candidate.source if candidate else 'not found'}")
        print(f"  OpenAPI:     {spec_source or 'unavailable'}")
        print(f"  auth check:  {auth_state}")
        print("Next steps:")
        for index, step in enumerate(report["nextSteps"], 1):
            print(f"  {index}. {step}")
    return 0 if ready else 4


def command_auth_check(args: argparse.Namespace) -> int:
    base_url = resolve_base_url(args.base_url)
    candidate, _, _ = resolve_credential(
        args.key_env,
        credential_source=args.credential_source,
        project_dir=Path(args.project_dir) if args.project_dir else None,
        cli_timeout=args.timeout,
    )
    if not candidate:
        raise ClientError("No reusable private API key was found; run `knowz_api.py setup`")
    status = validate_api_key(base_url, candidate.key, args.timeout)
    print(
        json.dumps(
            {
                "valid": True,
                "httpStatus": status,
                "apiBaseUrl": base_url,
                "credentialSource": candidate.source,
                "credentialKind": candidate.kind,
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


def command_source(args: argparse.Namespace) -> int:
    base_url = resolve_base_url(args.base_url)
    bundle = load_spec(args.spec, base_url, args.timeout)
    operations = list(iter_operations(bundle.document))
    allowed = [item for item in operations if policy_reason(item) is None]
    info = bundle.document.get("info", {})
    result = {
        "source": bundle.source,
        "apiBaseUrl": base_url,
        "openapi": bundle.document.get("openapi") or bundle.document.get("swagger"),
        "title": info.get("title"),
        "version": info.get("version"),
        "paths": len(bundle.document.get("paths", {})),
        "safeClientOperations": len(allowed),
        "withheldOperations": len(operations) - len(allowed),
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


def command_discover(args: argparse.Namespace) -> int:
    base_url = resolve_base_url(args.base_url)
    bundle = load_spec(args.spec, base_url, args.timeout)
    query = (args.query or "").strip().lower()
    tag = (args.tag or "").strip().lower()
    method = (args.method or "").upper()
    matches: list[Operation] = []
    for operation in iter_operations(bundle.document):
        if policy_reason(operation) is not None:
            continue
        if method and operation.method != method:
            continue
        if tag and not any(tag in value.lower() for value in operation.tags):
            continue
        if query and query not in normalized_operation_text(operation):
            continue
        matches.append(operation)
    matches.sort(key=lambda item: (item.tags[0] if item.tags else "", item.path, item.method))
    matches = matches[: args.limit]
    if args.json_output:
        print(
            json.dumps(
                [
                    {
                        "operationId": item.operation_id or None,
                        "method": item.method,
                        "path": item.path,
                        "tags": item.tags,
                        "summary": item.value.get("summary"),
                        "impact": "read" if item.method in READ_METHODS else "mutation",
                    }
                    for item in matches
                ],
                indent=2,
                ensure_ascii=False,
            )
        )
    else:
        for item in matches:
            tag_value = item.tags[0] if item.tags else "-"
            summary = str(item.value.get("summary") or "").replace("\n", " ")
            print(f"{item.method}\t{item.path}\t{item.operation_id or '-'}\t{tag_value}\t{summary}")
    return 0


def command_describe(args: argparse.Namespace) -> int:
    base_url = resolve_base_url(args.base_url)
    bundle = load_spec(args.spec, base_url, args.timeout)
    operation = find_operation(bundle.document, args.selector)
    result = describe_operation(operation, bundle.document)
    result["openapiSource"] = bundle.source
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


def command_request(args: argparse.Namespace) -> int:
    base_url = resolve_base_url(args.base_url)
    bundle = load_spec(args.spec, base_url, args.timeout)
    operation = find_operation(bundle.document, args.selector)
    if operation.method not in READ_METHODS and not args.execute:
        raise ClientError(
            f"{operation.method} {operation.path} changes state; inspect it with describe and pass --execute"
        )

    path_pairs = parse_pairs(args.path_param, "--path")
    query_pairs = parse_pairs(args.query_param, "--query")
    header_pairs = parse_pairs(args.header, "--header")
    resolve_path = resolve_request_path(operation, path_pairs)
    validate_query_pairs(operation, query_pairs)
    headers: dict[str, str] = {}
    for name, value in header_pairs:
        if name.lower() in FORBIDDEN_CALLER_HEADERS:
            raise ClientError(f"Refusing caller override of sensitive HTTP header: {name}")
        if not re.fullmatch(r"[A-Za-z0-9-]+", name) or "\r" in value or "\n" in value:
            raise ClientError(f"Invalid HTTP header: {name!r}")
        headers[name] = value

    body, content_type = prepare_body(args)
    request_body = operation.value.get("requestBody")
    if isinstance(request_body, dict) and request_body.get("required") and body is None:
        raise ClientError("The OpenAPI operation requires a request body")
    if content_type:
        headers["Content-Type"] = content_type
    if args.idempotency_key:
        if len(args.idempotency_key) > 256 or "\r" in args.idempotency_key or "\n" in args.idempotency_key:
            raise ClientError("Idempotency key must be a single line of at most 256 characters")
        headers["Idempotency-Key"] = args.idempotency_key

    api_key = require_api_key_for_args(args)
    status, response_headers, raw = http_call(
        base_url=base_url,
        method=operation.method,
        path=resolve_path,
        api_key=api_key,
        timeout=args.timeout,
        query=query_pairs,
        headers=headers,
        body=body,
    )
    content_type = response_headers.get("Content-Type", "")
    value = decode_response(raw, content_type)
    ensure_application_success(value)

    if args.output:
        output = Path(args.output).expanduser().resolve()
        if output.exists() and not args.overwrite_output:
            raise ClientError(f"Output already exists; use --overwrite-output to replace it: {output}")
        output.parent.mkdir(parents=True, exist_ok=True)
        mode = "wb" if args.overwrite_output else "xb"
        try:
            with output.open(mode) as handle:
                handle.write(raw)
        except OSError as exc:
            raise ClientError(f"Unable to write response to {output}: {exc}") from exc
        print(json.dumps({"status": status, "operationId": operation.operation_id or None, "output": str(output)}, indent=2))
    elif isinstance(value, (dict, list)):
        print(json.dumps({"status": status, "operationId": operation.operation_id or None, "response": redact(value)}, indent=2, ensure_ascii=False))
    elif isinstance(value, bytes):
        print(value.decode("utf-8", errors="replace"))
    else:
        print(json.dumps({"status": status, "operationId": operation.operation_id or None, "response": value}, indent=2, ensure_ascii=False))
    return 0


def post_json(
    *,
    base_url: str,
    path: str,
    api_key: str,
    timeout: float,
    payload: dict[str, Any],
    headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()
    status, response_headers, raw = http_call(
        base_url=base_url,
        method="POST",
        path=path,
        api_key=api_key,
        timeout=timeout,
        headers={"Content-Type": "application/json", **(headers or {})},
        body=body,
    )
    value = decode_response(raw, response_headers.get("Content-Type", ""))
    if not isinstance(value, dict):
        raise ApiError(f"Knowz API returned a non-JSON response for POST {path} (HTTP {status})")
    ensure_application_success(value)
    return value


def command_upload(args: argparse.Namespace) -> int:
    if not args.execute:
        raise ClientError("Chunked upload changes state; inspect the target and pass --execute")
    file_path = Path(args.file).expanduser().resolve()
    if not file_path.is_file():
        raise ClientError(f"Upload file does not exist: {file_path}")
    if file_path.stat().st_size <= 0:
        raise ClientError("Upload file is empty")
    if args.create_as == "knowledge" and not args.vault_id:
        raise ClientError("--vault-id is required with --create-as knowledge")
    if args.create_as != "knowledge" and args.vault_id:
        raise ClientError("--vault-id is only valid with --create-as knowledge")
    for label, value in (
        ("--vault-id", args.vault_id),
        ("--parent-knowledge-id", args.parent_knowledge_id),
    ):
        if value:
            try:
                uuid.UUID(value)
            except ValueError as exc:
                raise ClientError(f"{label} must be a UUID") from exc
    if args.client_created_at:
        try:
            datetime.fromisoformat(args.client_created_at.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ClientError("--client-created-at must be an ISO-8601 timestamp") from exc

    base_url = resolve_base_url(args.base_url)
    api_key = require_api_key_for_args(args)
    content_type = args.content_type or mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    file_size = file_path.stat().st_size
    init_response = post_json(
        base_url=base_url,
        path="/api/v1/files/upload/initialize",
        api_key=api_key,
        timeout=args.timeout,
        payload={"fileName": file_path.name, "fileSize": file_size, "contentType": content_type},
    )
    session = get_ci(init_response, "data")
    if not isinstance(session, dict):
        raise ApiError("InitializeUpload response did not contain a data object")
    upload_id = str(get_ci(session, "uploadId") or "")
    file_record_id = str(get_ci(session, "fileRecordId") or "")
    chunk_size = int(get_ci(session, "chunkSize") or 0)
    total_chunks = int(get_ci(session, "totalChunks") or 0)
    if not upload_id or not file_record_id or chunk_size <= 0 or total_chunks <= 0:
        raise ApiError("InitializeUpload response omitted uploadId, fileRecordId, chunkSize, or totalChunks")

    whole_hash = hashlib.sha256()
    uploaded = 0
    try:
        with file_path.open("rb") as handle:
            for chunk_index in range(total_chunks):
                chunk = handle.read(chunk_size)
                if not chunk:
                    raise ApiError(f"File ended before server-advertised chunk {chunk_index}")
                whole_hash.update(chunk)
                try:
                    md5_digest = hashlib.md5(chunk, usedforsecurity=False).digest()
                except TypeError:
                    md5_digest = hashlib.md5(chunk).digest()  # noqa: S324 - transport checksum only
                chunk_hash = base64.b64encode(md5_digest).decode("ascii")
                _, response_headers, raw = http_call(
                    base_url=base_url,
                    method="POST",
                    path="/api/v1/files/upload/streaming",
                    api_key=api_key,
                    timeout=args.timeout,
                    headers={
                        "Content-Type": "application/octet-stream",
                        "X-Upload-Id": upload_id,
                        "X-Chunk-Index": str(chunk_index),
                        "X-Chunk-Hash": chunk_hash,
                    },
                    body=chunk,
                )
                result = decode_response(raw, response_headers.get("Content-Type", ""))
                ensure_application_success(result)
                uploaded += len(chunk)
                eprint(f"Uploaded chunk {chunk_index + 1}/{total_chunks} ({uploaded}/{file_size} bytes)")
            if handle.read(1):
                raise ApiError("File contains more data than the server-advertised upload session")
    except OSError as exc:
        raise ClientError(f"Unable to read upload file {file_path}: {exc}") from exc

    payload: dict[str, Any] = {
        "uploadId": upload_id,
        "fileRecordId": file_record_id,
        "fileName": file_path.name,
        "fileSize": file_size,
        "contentType": content_type,
        "processTranscription": not args.no_transcription,
    }
    if args.create_as != "file":
        payload["createAs"] = args.create_as
    if args.title:
        payload["title"] = args.title
    if args.vault_id:
        payload["vaultId"] = args.vault_id
    if args.parent_knowledge_id:
        payload["parentKnowledgeId"] = args.parent_knowledge_id
    if args.client_created_at:
        payload["clientCreatedAt"] = args.client_created_at

    complete_response = post_json(
        base_url=base_url,
        path="/api/v1/files/upload/complete",
        api_key=api_key,
        timeout=args.timeout,
        payload=payload,
        headers={"X-File-Hash": whole_hash.hexdigest()},
    )
    print(
        json.dumps(
            {
                "operation": "chunked-upload",
                "file": str(file_path),
                "uploadId": upload_id,
                "fileRecordId": file_record_id,
                "response": redact(complete_response),
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


def run_fixed_mutation(args: argparse.Namespace, operation_id: str, path: str, target_name: str) -> int:
    if not args.execute:
        raise ClientError(f"{operation_id} changes state; inspect the target and pass --execute")
    target = args.target.strip()
    try:
        uuid.UUID(target)
    except ValueError as exc:
        raise ClientError(f"{target_name} must be a UUID") from exc
    base_url = resolve_base_url(args.base_url)
    api_key = require_api_key_for_args(args)
    status, response_headers, raw = http_call(
        base_url=base_url,
        method="POST",
        path=path.format(target=quote(target, safe="")),
        api_key=api_key,
        timeout=args.timeout,
    )
    response = decode_response(raw, response_headers.get("Content-Type", ""))
    ensure_application_success(response)
    print(
        json.dumps(
            {
                "status": status,
                "operationId": operation_id,
                target_name: target,
                "response": redact(response),
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


def command_reprocess(args: argparse.Namespace) -> int:
    return run_fixed_mutation(
        args,
        "ReprocessFile",
        "/api/v1/files/{target}/reprocess",
        "fileRecordId",
    )


def command_reindex(args: argparse.Namespace) -> int:
    return run_fixed_mutation(
        args,
        "ReindexKnowledgeItem",
        "/api/v1/knowledge/{target}/reindex",
        "knowledgeId",
    )


def add_api_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--base-url", help="Knowz API base URL (default: config/env/production)")
    parser.add_argument("--timeout", type=float, default=60.0, help="Request timeout in seconds")


def add_spec_options(parser: argparse.ArgumentParser) -> None:
    add_api_options(parser)
    parser.add_argument("--spec", help="OpenAPI file or URL (default: env/local checkout/server)")


def add_credential_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--key-env", default="KNOWZ_API_KEY", help="Preferred environment variable containing the private API key")
    parser.add_argument(
        "--credential-source",
        choices=("auto", "env", "mcp", "cli"),
        default="auto",
        help="Credential source (default: env, known MCP configs, then supported CLI keychain)",
    )
    parser.add_argument("--project-dir", help="Project directory used for MCP configuration discovery")


def add_call_options(parser: argparse.ArgumentParser) -> None:
    add_credential_options(parser)
    parser.add_argument("--execute", action="store_true", help="Acknowledge and execute a state-changing operation")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Guarded OpenAPI discovery and private-key access for safe Knowz client operations"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    setup = subparsers.add_parser("setup", help="Discover, guide, and verify private-key API setup")
    add_spec_options(setup)
    add_credential_options(setup)
    setup.add_argument("--no-verify", action="store_true", help="Inspect setup without making the read-only key validation call")
    setup.add_argument("--json-output", action="store_true", help="Emit a machine-readable setup report")
    setup.set_defaults(handler=command_setup)

    auth_check = subparsers.add_parser("auth-check", help="Verify the selected private key without printing it")
    add_api_options(auth_check)
    add_credential_options(auth_check)
    auth_check.set_defaults(handler=command_auth_check)

    source = subparsers.add_parser("source", help="Show the resolved OpenAPI source and safe operation counts")
    add_spec_options(source)
    source.set_defaults(handler=command_source)

    discover = subparsers.add_parser("discover", help="Search the safe client operation surface")
    add_spec_options(discover)
    discover.add_argument("--query", help="Search operation IDs, paths, tags, summaries, and descriptions")
    discover.add_argument("--tag", help="Filter by tag substring")
    discover.add_argument("--method", choices=sorted(method.upper() for method in HTTP_METHODS), help="Filter by HTTP method")
    discover.add_argument("--limit", type=int, default=50, choices=range(1, 501), metavar="1..500")
    discover.add_argument("--json-output", action="store_true", help="Emit JSON instead of tab-separated rows")
    discover.set_defaults(handler=command_discover)

    describe = subparsers.add_parser("describe", help="Describe one permitted operation and resolve its schemas")
    add_spec_options(describe)
    describe.add_argument("selector", help="Operation ID or exact 'METHOD /path'")
    describe.set_defaults(handler=command_describe)

    request = subparsers.add_parser("request", help="Call one permitted operation discovered from OpenAPI")
    add_spec_options(request)
    add_call_options(request)
    request.add_argument("selector", help="Operation ID or exact 'METHOD /path'")
    request.add_argument("--path", dest="path_param", action="append", default=[], help="Path parameter name=value")
    request.add_argument("--query", dest="query_param", action="append", default=[], help="Query parameter name=value; repeat for arrays")
    request.add_argument("--header", action="append", default=[], help="Non-sensitive operation header name=value")
    request.add_argument("--json", dest="json_body", help="Inline JSON request body")
    request.add_argument("--json-file", help="Path to a JSON object request body")
    request.add_argument("--raw-file", help="Path to a raw request body")
    request.add_argument("--content-type", help="Content type for --raw-file")
    request.add_argument("--form", action="append", default=[], help="Multipart text field name=value")
    request.add_argument("--form-file", action="append", default=[], help="Multipart file field=/absolute/path")
    request.add_argument("--idempotency-key", help="Stable idempotency key for a retryable mutation")
    request.add_argument("--output", help="Write the raw response body to this path")
    request.add_argument("--overwrite-output", action="store_true", help="Allow replacing an existing --output file")
    request.set_defaults(handler=command_request)

    upload = subparsers.add_parser("upload", help="Run the guarded server-sized chunked upload workflow")
    add_api_options(upload)
    add_call_options(upload)
    upload.add_argument("file", help="File to upload")
    upload.add_argument("--create-as", choices=("file", "inbox", "knowledge"), default="file")
    upload.add_argument("--vault-id", help="Destination vault UUID for --create-as knowledge")
    upload.add_argument("--title", help="Inbox or knowledge title")
    upload.add_argument("--content-type", help="Override the detected MIME type")
    upload.add_argument("--no-transcription", action="store_true", help="Disable automatic transcription processing")
    upload.add_argument("--parent-knowledge-id", help="Optional parent knowledge UUID")
    upload.add_argument("--client-created-at", help="Optional ISO-8601 client creation timestamp")
    upload.set_defaults(handler=command_upload)

    reprocess = subparsers.add_parser("reprocess", help="Queue safe reprocessing for one file record")
    add_api_options(reprocess)
    add_call_options(reprocess)
    reprocess.add_argument("target", help="File record UUID")
    reprocess.set_defaults(handler=command_reprocess)

    reindex = subparsers.add_parser("reindex", help="Queue search reindexing for one knowledge item")
    add_api_options(reindex)
    add_call_options(reindex)
    reindex.add_argument("target", help="Knowledge item UUID")
    reindex.set_defaults(handler=command_reindex)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return int(args.handler(args))
    except PolicyError as exc:
        eprint(f"Blocked by Knowz API safety policy: {exc}")
        return 5
    except ClientError as exc:
        eprint(f"Error: {exc}")
        return 4
    except KeyboardInterrupt:
        eprint("Interrupted")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
