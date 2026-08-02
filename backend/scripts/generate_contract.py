"""Regenerate CONTRACT.md from the live OpenAPI schema.

CONTRACT.md documents itself as auto-generated but no generator existed, so it
drifted from the API. Run this after changing any route:

    python -m scripts.generate_contract

Writes to ../CONTRACT.md relative to the backend directory.
"""

from __future__ import annotations

import pathlib
import sys
from typing import Any, Dict, List, Optional

from app.main import app

OUTPUT = pathlib.Path(__file__).resolve().parents[2] / "CONTRACT.md"

METHOD_ORDER = ["get", "post", "put", "patch", "delete"]


def _resolve(schema: Dict[str, Any], spec: Dict[str, Any], depth: int = 0) -> Any:
    """Resolve $ref and reduce a JSON schema to a readable shape."""
    if depth > 6 or not isinstance(schema, dict):
        return "any"

    if "$ref" in schema:
        name = schema["$ref"].split("/")[-1]
        target = spec.get("components", {}).get("schemas", {}).get(name)
        return _resolve(target, spec, depth + 1) if target else "any"

    for key in ("anyOf", "oneOf", "allOf"):
        if key in schema:
            options = [s for s in schema[key] if s.get("type") != "null"]
            if options:
                return _resolve(options[0], spec, depth + 1)
            return "any"

    schema_type = schema.get("type")

    if schema_type == "object" or "properties" in schema:
        properties = schema.get("properties") or {}
        if not properties:
            return "object"
        required = set(schema.get("required") or [])
        shape: Dict[str, Any] = {}
        for name, sub in properties.items():
            marker = name if name in required else f"{name}?"
            shape[marker] = _resolve(sub, spec, depth + 1)
        return shape

    if schema_type == "array":
        items = _resolve(schema.get("items", {}), spec, depth + 1)
        return [items] if isinstance(items, (dict, list)) else f"array[{items if items != 'any' else ''}]"

    if "enum" in schema:
        return " | ".join(f'"{v}"' for v in schema["enum"])

    return {
        "integer": "integer",
        "number": "number",
        "boolean": "boolean",
        "string": "string",
    }.get(schema_type, "any")


def _render(value: Any, indent: int = 0) -> str:
    pad = "  " * indent
    if isinstance(value, dict):
        lines = ["{"]
        for key, sub in value.items():
            lines.append(f'{pad}  "{key}": {_render(sub, indent + 1)},')
        lines.append(pad + "}")
        return "\n".join(lines)
    if isinstance(value, list):
        inner = _render(value[0], indent + 1) if value else "any"
        return f"[\n{pad}  {inner}\n{pad}]"
    return str(value)


def _body_block(operation: Dict[str, Any], spec: Dict[str, Any]) -> Optional[str]:
    body = operation.get("requestBody")
    if not body:
        return None
    content = body.get("content", {})
    for media in ("application/json", "multipart/form-data"):
        if media in content:
            shape = _resolve(content[media].get("schema", {}), spec)
            label = "Request Body (JSON)" if media == "application/json" else "Request Body (multipart/form-data)"
            return f"**{label}:**\n```json\n{_render(shape)}\n```\n"
    return None


def main() -> None:
    spec = app.openapi()
    out: List[str] = [
        "# IMKON CRM Complete API Contracts",
        "",
        "This document is auto-generated from the OpenAPI schema and contains all endpoints and their contracts.",
        "",
        "Regenerate with `python -m scripts.generate_contract` from the `backend/` directory.",
        "",
        "**Base URL:** `/api/v1`",
        "**Authentication:** `Authorization: Bearer <access_token>`",
        "",
    ]

    for path, methods in spec.get("paths", {}).items():
        ordered = sorted(
            methods.items(),
            key=lambda kv: METHOD_ORDER.index(kv[0]) if kv[0] in METHOD_ORDER else 99,
        )
        for method, operation in ordered:
            if method not in METHOD_ORDER:
                continue

            out.append(f"## {method.upper()} {path}")
            out.append("")
            out.append(f"**Summary:** {operation.get('summary', '')}")
            out.append("")

            description = (operation.get("description") or "").strip()
            if description:
                out.append(description)
                out.append("")

            params = operation.get("parameters") or []
            if params:
                out.append("**Parameters:**")
                for param in params:
                    required = " *(required)*" if param.get("required") else ""
                    note = param.get("description", "")
                    out.append(f"- `{param['name']}` [{param.get('in', '')}]{required} {note}".rstrip())
                out.append("")

            body = _body_block(operation, spec)
            if body:
                out.append(body)

            out.append("**Responses:**")
            for code, response in (operation.get("responses") or {}).items():
                out.append(f"- **{code}**: {response.get('description', '')}")
                content = (response.get("content") or {}).get("application/json")
                if content and content.get("schema"):
                    shape = _resolve(content["schema"], spec)
                    rendered = _render(shape).replace("\n", "\n  ")
                    out.append(f"  ```json\n  {rendered}\n  ```")
            out.append("")
            out.append("---")
            out.append("")

    OUTPUT.write_text("\n".join(out))
    endpoints = sum(
        1 for methods in spec.get("paths", {}).values() for m in methods if m in METHOD_ORDER
    )
    print(f"Wrote {OUTPUT} ({endpoints} endpoints)")


if __name__ == "__main__":
    sys.exit(main())
