## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2025-07-25 - Prevent "Blank Page Syndrome" in Lists

**Learning:** Empty states in list views (like History) can feel like a "blank page" or an error if they just say "No items." Guidance-driven empty states (icon, dashed border, clear CTA) help orient the user and instruct them on how to fill the state.
**Action:** Always replace plain text empty list indicators with structured, guidance-driven containers following the `healer-empty-state` pattern.
