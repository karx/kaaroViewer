# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# workflow
- Use collaborative back-and-forth planning to isolate priority targets before implementation. Confidence: 0.65
- Use TDD (Test-Driven Development) for enhancements and fixes. Confidence: 0.65
- Prioritize legacy cleanup and dead code removal before starting new feature work. Confidence: 0.70

# architecture
- Prefer shared state modules (e.g., app-state.mjs) over callback injection or circular imports for cross-module state. Confidence: 0.65
- Design module boundaries to support future plugin extensibility. Confidence: 0.65

# design-philosophy
- Prefer simple defaults with opt-out configurability (e.g., unconditional autosave, no queue persistence, separate crash-draft vs auto-save IDs). Confidence: 0.70
- Prioritize better UX over internal simplicity for user-facing destructive actions (e.g., soft-undo with redo window, confirmation before restoring draft over dirty canvas). Confidence: 0.70

# ui-layout
- Place new side panels on the left edge to avoid conflict with existing right-side panels (detail, sessions drawers). Confidence: 0.65

# error-handling
- For queued async operations: skip failed items, log the error, notify the user, and continue processing remaining items. Confidence: 0.70

