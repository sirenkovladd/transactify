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
*   **Best Practices**: Refer to [vanjs_skill.md](vanjs_skill.md) for development guidelines and patterns.
*   The frontend code is located in the `client` directory.
*   The main entry point for the frontend is `client/main.ts`.
*   The frontend is built into the `dist` directory.

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
*   **Import Pattern**: Each component TypeScript file imports its CSS at the top:
    ```typescript
    import "./component-name.css";
    ```

### Database

*   The database schema is defined in the `schema.sql` file.
*   The application uses a PostgreSQL database.
*   The database schema includes tables for users, sessions, transactions, and tags.

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
