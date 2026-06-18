# Transaction Summary

This project is a web application for managing personal transactions. It allows users to track their expenses, categorize them, and view statistics about their spending.

## Features

*   Track expenses and income.
*   Categorize transactions.
*   View spending statistics.
*   Share transaction data with other users.
*   Import transactions from Wealthsimple, CIBC or CSV.

## Tech Stack

*   **Backend:** Go
*   **Frontend:** TypeScript, [vanjs-core](https://vanjs.org/)
*   **Database:** [bbolt](https://pkg.go.dev/go.etcd.io/bbolt) (embedded key/value store)
*   **Build Tool:** Bun

## Prerequisites

*   Go (version 1.25.1 or later)
*   Node.js
*   Bun

## Getting Started

### 1. Database Setup

The server uses an embedded bbolt file; no external database service is required. Set the following environment variables:

*   `BBOLT_PATH`: Path to the bbolt file. Defaults to `./data/transaction.db`. The parent directory is created on first run.

On first start the server runs any pending Go-based migrations (see `server/migrations_bbolt/`) to create the required buckets.

### 2. Backend

1.  **Run the server:**
    ```bash
    go run cli/server/server.go
    ```
    The server will start on port 8080.

### 3. Frontend

1.  **Install dependencies:**
    ```bash
    bun install
    ```

2.  **Build the frontend:**
    ```bash
    bun run build
    ```

3.  **Serve the frontend:**
    The backend server also serves the frontend files from the `dist` directory.

## Development Conventions

### Backend

*   The backend is written in Go.
*   The backend uses the standard Go project layout.
*   The backend uses the `net/http` package for the HTTP server and the `go.etcd.io/bbolt` package for embedded key/value storage.
*   The `store` package wraps bbolt and exposes typed methods for every table the app uses (users, sessions, transactions, tags, photos, sharing, settings).

### Frontend

*   The frontend is written in TypeScript.
*   The frontend uses the `vanjs-core` library for the UI.
*   The frontend code is located in the `client` directory.
*   The main entry point for the frontend is `client/main.ts`.
*   The frontend is built into the `dist` directory.
