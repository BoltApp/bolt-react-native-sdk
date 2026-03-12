#!/bin/bash
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

if echo "$COMMAND" | grep -qE "^npm "; then
  echo "Blocked: use yarn instead of npm" >&2
  exit 2
fi

exit 0
