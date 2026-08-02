# Legacy Pending-Capture Location

The canonical queue is now project-root `knowz-pending.md`, which `/knowz flush` drains.

Do not append new captures here. `/knowz flush` still checks this file and safely migrates any `---`-delimited legacy blocks before replay, so upgrades do not lose older queued operations.
