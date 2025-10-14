# GEMINI.md

## Project Overview

This project is a web application for managing personal transactions. It allows users to track their expenses, categorize them, and view statistics about their spending.

The application is built with a Go backend and a TypeScript/JavaScript frontend. The backend provides a REST API for managing transactions, and the frontend is a single-page application that uses the `vanjs-core` library for the UI. The application uses a PostgreSQL database to store the data.

The project also includes command-line tools for creating users and importing transactions from Wealthsimple.

## Building and Running

### Backend

To run the backend server, you will need to have Go and PostgreSQL installed.

1.  **Set up the database:**
    *   Create a PostgreSQL database.
    *   Run the `schema.sql` file to create the necessary tables.
    *   Set the following environment variables:
        *   `POSTGRES_USER`: Your PostgreSQL username.
        *   `POSTGRES_PASSWORD`: Your PostgreSQL password.
        *   `POSTGRES_DB`: The name of your PostgreSQL database.
        *   `POSTGRES_HOST`: The host of your PostgreSQL database.

2.  **Run the server:**
    ```bash
    go run cli/server/server.go
    ```
    The server will start on port 8080.

### Frontend

To build and run the frontend, you will need to have Node.js and bun installed.

1.  **Install dependencies:**
    ```bash
    bun install
    ```

2.  **Build the frontend:**
    ```bash
    # TODO: Add the command to build the frontend.
    # It is likely `bun build client/main.ts --outdir dist`
    ```

3.  **Serve the frontend:**
    The backend server also serves the frontend files from the `dist` directory.

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

### Database

*   The database schema is defined in the `schema.sql` file.
*   The application uses a PostgreSQL database.
*   The database schema includes tables for users, sessions, transactions, and tags.
