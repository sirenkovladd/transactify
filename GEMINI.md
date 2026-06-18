# GEMINI.md

## Project Overview

This project is a web application for managing personal transactions. It allows users to track their expenses, categorize them, and view statistics about their spending.

The application is built with a Go backend and a TypeScript/JavaScript frontend. The backend provides a REST API for managing transactions, and the frontend is a single-page application that uses the `vanjs-core` library for the UI. The application uses an embedded [bbolt](https://pkg.go.dev/go.etcd.io/bbolt) (go.etcd.io/bbolt) key/value store for persistence; data lives in a single file on disk.

The project also includes command-line tools for creating users and importing transactions from Wealthsimple.

## Building and Running

### Backend

To run the backend server, you will need to have Go installed. No external database service is required.

1.  **Configure the bbolt file location:**
    *   `BBOLT_PATH`: Path to the bbolt data file. Defaults to `./data/transaction.db`. The parent directory is created on first run.
    *   The first start runs the Go-based migrations in `server/migrations_bbolt/` to create the required buckets.

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
*   The backend uses the `net/http` package for the HTTP server and the `go.etcd.io/bbolt` package for embedded key/value storage.
*   Database access is centralized in the `store` package (`store/store.go` plus one file per table: `users.go`, `sessions.go`, `tags.go`, `transactions.go`, `transaction_tags.go`, `transaction_photos.go`, `sharing.go`, `settings.go`). Route handlers depend on `*store.Store`, not on a SQL driver.

### Frontend

*   The frontend is written in TypeScript.
*   The frontend uses the `vanjs-core` library for the UI.
*   **Best Practices**: Refer to [vanjs_skill.md](vanjs_skill.md) for development guidelines and patterns.
*   The frontend code is located in the `client` directory.
*   The main entry point for the frontend is `client/main.ts`.
*   The frontend is built into the `dist` directory.
*   **Caching**: The frontend implements client-side caching for the transactions list using ETags. It stores the ETag and the transactions data in `localStorage` and sends the `If-None-Match` header in subsequent requests. Static files in production use build timestamps for `Last-Modified` headers, enabling proper HTTP caching.

#### CSS Architecture

*   **Modular CSS**: Each TypeScript component has its own CSS file that is imported directly in the component file.
*   **Component CSS Files**: 
    *   `adding.css` - Import modal, transaction creation, and receipt upload styles
    *   `category.css` - Category modal styles
    *   `common.css` - Transaction card styles
    *   `filter.css` - Filter sidebar, multi-select, and slider styles
    *   `group.css` - Grouping and tag management styles
    *   `login.css` - Login form styles
    *   `main.css` - Main layout, tabs, and responsive styles
    *   `popup.css` - Transaction popup modal styles
    *   `stats.css` - Stats sidebar and summary styles
    *   `tags.css` - Tag modal and input styles
    *   `sharing.css` - Sharing modal styles
*   **Global Styles**: `styles.css` contains only:
    *   CSS variables (`:root`)
    *   Global body styles
    *   Shared modal components
    *   Common button styles
    ```typescript
    import "./component-name.css";
    ```

#### Dynamic Configuration
The application supports runtime configuration of category rules and subgroup mappings via the database.
*   **Settings Table**: Stores JSON configurations in a `settings` table.
*   **Key-Value Store**: Current keys include `categories_map` and `subgroup_map`.
*   **UI Management**: Users can update these settings through the "Settings" menu in the creation sidebar by pasting a new JSON file.
*   **Git Backup**: Current configurations are also stored in `data/categories_map.json` and `data/subgroup_map.json` for version control and easy recovery.
*   **Fallback**: If database settings are unavailable, the application falls back to hardcoded defaults in `client/const.ts` and `client/group.ts`.

### Database

*   The database is a single bbolt file whose path is the `BBOLT_PATH` environment variable (default `./data/transaction.db`).
*   Migrations are Go functions under `server/migrations_bbolt/`, registered in lexicographic order in `registry.go` and applied by `server.ApplyMigrationsBbolt`. Already-applied versions are recorded in the `meta` bucket.
*   The schema is encoded as a set of bbolt buckets, one per table plus secondary indexes and per-table sequence buckets. Key shapes:
    *   `users` / `users_by_username` — `itob(user_id)` and `username` keys, JSON values.
    *   `sessions` — `session_code` keys, JSON values; `GetSessionByCode` bumps `last_used` on every read.
    *   `tags` / `tags_by_id` — keyed by name and id respectively.
    *   `transactions` / `txn_by_user_time` — primary `itob(transaction_id)` and a composite `(itob(user_id) + itob(occurred_at_unix_nano) + itob(transaction_id))` index for per-user ordered range scans (built via `store.TxByUserTimeKey`).
    *   `txn_tags` — `(itob(transaction_id), itob(tag_id))` join rows.
    *   `txn_photos` / `photos_by_path` — primary by `photo_id` and a secondary index for delete-by-path lookups.
    *   `sharing_tokens` / `sharing_tokens_by_user` — token lookup and per-user listing.
    *   `user_connections` / `subscriptions_by_user` — primary and reverse indexes.
    *   `settings` — key → `{value: json.RawMessage, updated_at}` JSON.
*   Migrations and dump/load tooling are part of the binary; the `cli/migrate` package is a one-shot tool that copies data from a live PostgreSQL instance into a fresh bbolt file for the cutover (see `docs/runbooks/migrate-to-bbolt.md`).

## Documentation Maintenance

### Automatic Updates Rule

**IMPORTANT**: Proactively update `GEMINI.md` and `CHANGELOG.md` whenever relevant changes occur during development.

#### Update GEMINI.md When:

*   **Project Overview**: Technology stack changes, new major features, architecture changes
*   **Building and Running**: Build commands change, new environment variables, dependency changes, server configuration changes
*   **Backend Conventions**: New Go packages, API structure changes, database driver changes
*   **Frontend Conventions**: New UI patterns, component structure changes, build process changes, CSS architecture updates (new component CSS files)
*   **Database**: Schema changes (new tables, relationships), migration strategy changes

#### Update CHANGELOG.md When:

Under the `[Unreleased]` section, add entries to:

*   **Added**: New features, user-facing functionality, configuration options, CLI commands
*   **Changed**: UI/UX improvements, refactoring that affects UX, performance improvements, behavior changes
*   **Fixed**: Bug fixes, UI issues, data handling corrections, performance issues
*   **Removed**: Deprecated features, removed endpoints, removed configuration options

#### Guidelines:

*   **Be Specific**: Clear descriptions of WHAT changed and WHY it matters
*   **User-Centric**: Focus on user-facing changes in CHANGELOG.md
*   **Technical Accuracy**: Ensure GEMINI.md reflects actual current state
*   **Batch Updates**: Update both files once after completing related changes
*   **No Duplicates**: Always check current content before adding entries

#### Examples:

*   New feature (merchant autocomplete) → CHANGELOG.md "Added" section only
*   CSS refactoring → Both CHANGELOG.md "Changed" and GEMINI.md "CSS Architecture"
*   New environment variable → Both CHANGELOG.md "Added" and GEMINI.md "Building and Running"
*   Bug fix → CHANGELOG.md "Fixed" section only

See [documentation_update_rule.md](.agent/documentation_update_rule.md) for detailed guidelines.
