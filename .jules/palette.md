## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-10-24 - Guidance-Driven Empty States
**Learning:** Implementing guidance-driven empty states (e.g. healer-empty-state with dashed borders, a brief description, and an aria-hidden icon) prevents 'blank page syndrome' in complex views like GraphRAG, helping users understand how to interact before any state exists.
**Action:** Always include empty states for search or query views, ensuring icons have aria-hidden="true" to avoid redundant screen reader announcements.
