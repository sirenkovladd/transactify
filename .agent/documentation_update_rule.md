# Documentation Update Rule

**Purpose**: This rule defines when and how to automatically update `GEMINI.md` and `CHANGELOG.md` files.

## When to Update GEMINI.md

Update `/Users/vlad/code/transaction-summary/GEMINI.md` when:

### Project Overview Section
- **New features** are added that change the core functionality (e.g., new major UI components, new data models)
- **Technology stack changes** (e.g., adding new libraries, changing frameworks)
- **Architecture changes** (e.g., adding microservices, changing database)

### Building and Running Section
- **Build commands change** (e.g., new build scripts, different compilation steps)
- **New environment variables** are required
- **Dependencies change** (e.g., new system requirements, different versions)
- **Server configuration changes** (e.g., different ports, new startup parameters)

### Development Conventions Section

#### Backend Subsection
- **New Go packages** are introduced as core dependencies
- **API structure changes** (e.g., moving from REST to GraphQL)
- **Database driver changes** or new database-related patterns

#### Frontend Subsection
- **New major UI patterns** are established
- **Component structure changes** significantly
- **Build process changes** (e.g., new bundler, different output directory)
- **New CSS files** are added to the modular CSS architecture
- **CSS architecture patterns change** (e.g., new component CSS files, changes to global styles)

#### Database Subsection
- **Schema changes** that add new tables or significantly modify existing ones
- **New database relationships** or constraints
- **Migration strategy changes**

## When to Update CHANGELOG.md

Update `/Users/vlad/code/transaction-summary/CHANGELOG.md` under the `[Unreleased]` section when:

### Added Section
- **New features** are implemented (e.g., new UI components, new API endpoints)
- **New user-facing functionality** (e.g., new buttons, new pages, new workflows)
- **New configuration options** or settings
- **New CLI commands** or tools

### Changed Section
- **Existing features are modified** in a way that changes user experience
- **UI/UX improvements** or redesigns
- **Performance improvements** that are significant
- **Refactoring** that changes how users interact with the system
- **Behavior changes** in existing features

### Fixed Section
- **Bug fixes** of any kind
- **UI issues** resolved
- **Data handling issues** corrected
- **Performance issues** resolved

### Removed Section (if applicable)
- **Features removed** or deprecated
- **API endpoints removed**
- **Configuration options removed**

## Update Guidelines

1. **Be Specific**: Use clear, concise descriptions that explain WHAT changed and WHY it matters
2. **User-Centric**: Focus on user-facing changes in CHANGELOG.md
3. **Technical Accuracy**: Ensure GEMINI.md reflects the actual current state of the codebase
4. **Batch Updates**: When making multiple related changes, update both files once at the end
5. **Verify Accuracy**: Always check the current content before updating to avoid duplicates

## Analysis Triggers

Automatically analyze whether updates are needed when:
- Creating or modifying multiple files in a feature implementation
- Completing a refactoring task
- Fixing bugs that affect user experience
- Adding new dependencies or changing build processes
- Modifying database schema
- Changing API contracts
- Adding or modifying CSS architecture (especially new component CSS files)

## Format Consistency

### GEMINI.md
- Use markdown formatting consistently
- Keep bullet points concise
- Use code blocks for commands and code examples
- Link to other documentation files when relevant (e.g., `vanjs_skill.md`)

### CHANGELOG.md
- Follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format
- Use present tense for entries (e.g., "Add feature" not "Added feature")
- Group related changes together
- Keep entries brief but descriptive
- Always update the `[Unreleased]` section

## Execution Pattern

When you identify that updates are needed:
1. **Announce**: Briefly mention you're updating documentation as part of the task
2. **Update**: Make the necessary changes to GEMINI.md and/or CHANGELOG.md
3. **Verify**: Ensure no duplicate entries and formatting is correct
4. **Continue**: Proceed with other work without requiring user approval for documentation updates

## Examples

### Example 1: Adding a New Feature
**Change**: Implemented merchant autocomplete in transaction popup
**Updates**:
- `CHANGELOG.md` → Add to "Added" section: "Auto-suggestion for merchant names in transaction popup"
- `GEMINI.md` → No update needed (doesn't change architecture or conventions)

### Example 2: CSS Refactoring
**Change**: Split `styles.css` into component-specific CSS files
**Updates**:
- `CHANGELOG.md` → Add to "Changed" section: "Refactored CSS into modular component-specific files"
- `GEMINI.md` → Update "CSS Architecture" section to document the new modular structure

### Example 3: New Environment Variable
**Change**: Added `SERVER_PORT` environment variable for configurable port
**Updates**:
- `CHANGELOG.md` → Add to "Added" section: "Configurable server port via SERVER_PORT environment variable"
- `GEMINI.md` → Update "Building and Running > Backend" to document the new environment variable

### Example 4: Bug Fix
**Change**: Fixed transaction popup not saving category changes
**Updates**:
- `CHANGELOG.md` → Add to "Fixed" section: "Transaction popup saving issues for category and tags"
- `GEMINI.md` → No update needed (bug fix doesn't change conventions)
