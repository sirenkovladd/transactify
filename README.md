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
*   **Database:** PostgreSQL
*   **Build Tool:** Bun

## Prerequisites

*   Go (version 1.25.1 or later)
*   PostgreSQL
*   Node.js
*   Bun

## Getting Started

### 1. Database Setup

1.  Create a PostgreSQL database.
2.  Run the `all.sql` file to create the necessary tables.
3.  Set the following environment variables:
    *   `POSTGRES_USER`: Your PostgreSQL username.
    *   `POSTGRES_PASSWORD`: Your PostgreSQL password.
    *   `POSTGRES_DB`: The name of your PostgreSQL database.
    *   `POSTGRES_HOST`: The host of your PostgreSQL database.
    *   `POSTGRES_PORT`: The port of your PostgreSQL database (defaults to 5432).

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

## Command-Line Tools

The project includes the following command-line tools:

*   `cli/createUser/main.go`: Creates a new user.

## Development Conventions

### Backend

*   The backend is written in Go.
*   The backend uses the standard Go project layout.
*   The backend uses the `net/http` package for the HTTP server and the `database/sql` package for database access.
*   The backend uses the `github.com/lib/pq` driver for PostgreSQL.

### Frontend

*   The frontend is written in TypeScript.
*   The frontend uses the `vanjs-core` library for the UI.
*   The frontend code is located in the `client` directory.
*   The main entry point for the frontend is `client/main.ts`.
*   The frontend is built into the `dist` directory.
