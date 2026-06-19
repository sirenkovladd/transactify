#!/bin/bash
set -e

# SSH target is a Host alias from ~/.ssh/config (which supplies the
# HostName, User, IdentityFile, etc.). Configure it once, reuse everywhere.
SERVER="luiscup"
SSH="ssh $SERVER"
SCP="scp"
REMOTE_BIN="~/bin/transaction-server"
SERVICE="transaction"

echo "Building frontend (prod, embeds into binary)..."
rm -rf dist
bun build --outdir=dist --production ./client/index.html

echo "Building binary (with embedded assets)..."
GIT_COMMIT=$(git rev-parse --short HEAD)
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS="-s -w -X 'main.GitCommit=$GIT_COMMIT' -X 'main.BuildTime=$BUILD_TIME'"
GOOS=linux GOARCH=amd64 go build -ldflags "$LDFLAGS" -tags prod -o transaction-server ./cli/server/server.go
echo "  -> ${GIT_COMMIT} (${BUILD_TIME})"

echo "Uploading binary..."
$SCP transaction-server $SERVER:/tmp/transaction-server

echo "Deploying..."
$SSH "systemctl --user stop $SERVICE && sleep 1 && \
  mkdir -p ~/bin && \
  cp /tmp/transaction-server $REMOTE_BIN && chmod +x $REMOTE_BIN && \
  systemctl --user start $SERVICE"

echo "Done! Status:"
$SSH "systemctl --user status $SERVICE --no-pager | head -10"
