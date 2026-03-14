# Changelog

All notable changes to ScreenVault will be documented in this file.

## [Unreleased]

### Added
- Initial app setup with Expo SDK 54
- Swipe-to-triage inbox for unprocessed screenshots
- Folder management (create, delete, color picking)
- Folder detail view with gallery grid
- Screenshot detection via expo-media-library
- Stats dashboard with activity heatmap
- Basic image editor (crop, blur)
- Local build pipeline (build.bat, GitHub Actions)
- Notification system for new screenshots

### Major Enhancements
- **Index Layout Overhaul**: 3 view types (Grid, List, Swipe) with persistent preference.
- **Global Search & Filter**: Find screenshots by name, notes, tags, or status across the entire library.
- **Gallery Viewer**: Full-screen image viewing with horizontal paging and pinch-to-zoom.
- **Enhanced multi-selection**: Unified bulk actions (Delete, Favorite, Organize, Tag) with haptic feedback.
- **Smart Folder Organization**: Recent folder chips and move-between-folders support.
- **Production Polish**: Optimized performance with FlashList and audited release scripts.
