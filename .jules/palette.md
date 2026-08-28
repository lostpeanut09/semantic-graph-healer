## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-06-02 - Guidance-Driven Empty States for Advanced Features

**Learning:** Advanced blank-slate features like GraphRAG can suffer from 'blank page syndrome', where users are unsure of what actions they can or should take upon opening the view, making the feature seem broken or unapproachable.
**Action:** Implement guidance-driven empty states using the `healer-empty-state` container pattern (e.g., dashed border, brief description, and an icon) before any interaction occurs, setting visual icons to `aria-hidden="true"` to avoid confusing screen reader announcements.
