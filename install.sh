#!/usr/bin/env bash
# Install MCP Feedback Enhanced (Hunter fork) into Cursor.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
EXT_ID="mcp-feedback.mcp-feedback-enhanced-2.5.1-universal"
CURSOR_EXT="${HOME}/.cursor/extensions/${EXT_ID}"
MCP_JSON="${HOME}/.cursor/mcp.json"
NODE_BIN="$(command -v node || true)"

usage() {
  cat <<'EOF'
Usage: ./install.sh [--link]

  default   Copy extension files to ~/.cursor/extensions/
  --link    Symlink instead of copy (for local development)

After install:
  1. Developer: Reload Window
  2. Open bottom panel "MCP Feedback Enhanced"
  3. Confirm status shows Connected :<port> pid=<pid>
EOF
}

MODE="copy"
if [[ "${1:-}" == "--link" ]]; then
  MODE="link"
elif [[ -n "${1:-}" ]]; then
  usage
  exit 1
fi

if [[ -z "${NODE_BIN}" ]]; then
  echo "install.sh: node not found in PATH" >&2
  exit 1
fi

mkdir -p "${HOME}/.cursor/extensions"

if [[ "${MODE}" == "link" ]]; then
  rm -rf "${CURSOR_EXT}"
  ln -s "${ROOT}" "${CURSOR_EXT}"
  echo "Linked ${ROOT} -> ${CURSOR_EXT}"
else
  mkdir -p "${CURSOR_EXT}"
  rsync -a --delete \
    --exclude='.git' \
    --exclude='.DS_Store' \
    --exclude='install.sh' \
    "${ROOT}/" "${CURSOR_EXT}/"
  echo "Copied to ${CURSOR_EXT}"
fi

MCP_SERVER="${CURSOR_EXT}/mcp-server/dist/index.js"
if [[ ! -f "${MCP_SERVER}" ]]; then
  echo "install.sh: missing ${MCP_SERVER}" >&2
  exit 1
fi

python3 - <<PY
import json, os
path = os.path.expanduser("${MCP_JSON}")
cfg = {}
if os.path.exists(path):
    with open(path, encoding="utf-8") as f:
        cfg = json.load(f)
servers = cfg.setdefault("mcpServers", {})
servers["mcp-feedback-enhanced"] = {
    "command": "${NODE_BIN}",
    "args": ["${MCP_SERVER}"],
}
with open(path, "w", encoding="utf-8") as f:
    json.dump(cfg, f, indent=2)
    f.write("\n")
print(f"Updated {path}")
PY

echo ""
echo "Done. Run 'Developer: Reload Window' in Cursor."
