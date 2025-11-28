# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Import transactions from browser extension
- Auto-suggestion for merchant names in transaction popup
- Sorting functionality in grouped view
- HTTP/HTTPS option for server configuration
- Opening transaction in group page
- Show tags in edit form immediately

### Changed

- Refactored CSS into modular component-specific files
- Improved transaction popup UI and layout
- Enhanced stats sidebar display and functionality
- Better filtering based on pattern and exact match
- Hide "+ New" button when user is not logged in
- Refactored client-side reactivity to minimize DOM updates in main list, groups, and filters
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
