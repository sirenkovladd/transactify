# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Dynamic categories rules and subgroup mappings stored in the database.
- Settings modal in the UI to update these configurations via JSON upload.
- Git-tracked JSON versions of category rules and subgroup mappings in `data/`.

- Import transactions from browser extension
- Auto-suggestion for merchant names in transaction popup
- Sorting functionality in grouped view
- HTTP/HTTPS option for server configuration
- Opening transaction in group page
- Show tags in edit form immediately
- Client-side caching for transactions list using ETags
- Build timestamp for static file caching with Last-Modified headers
- Input for specifying number of transactions to fetch in browser extension popup


### Changed

- Refactored `categoriesMap` and `subGroupMap` to pull from the database while maintaining hardcoded defaults as fallbacks.
- Moved categories and subgroup configuration from code to a more maintainable, runtime-updatable system.

- Refactored CSS into modular component-specific files
- Improved transaction popup UI and layout
- Enhanced stats sidebar display and functionality
- Better filtering based on pattern and exact match
- Hide "+ New" button when user is not logged in
- Refactored client-side reactivity to minimize DOM updates in main list, groups, and filters
- Refactored `CategoryModal`, `TagModal`, `SharingModal`, `NewTransactionModal`, and `ScanReceiptModal` to be pure VanJS components, removing dependency on `index.html`.
- Updated `client/main.ts` to mount new modal components.
- Refactored `client/adding.ts` to use reactive components for modals.
- Improved reactivity of transaction list rendering.
- Converted `CategoryModal` to a reactive VanJS component
- Refactored `ImportModal` to use reactive state, removing manual DOM manipulation

### Fixed

- Transaction popup saving issues for category and tags
- Transaction parsing from Wealthsimple import
- Cashback transaction type handling
- Large gap spacing issues in UI
- Filter in query param
- Filter on startup
- Tag filter
- Check existing transaction while importing
- Update last used session
- Remove personName from adding transaction
