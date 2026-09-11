## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-07-25 - Empty States to Prevent Blank Page Syndrome

**Learning:** When displaying dynamic content lists (like dashboards or search results), presenting a plain text string (e.g., "No issues found") when the list is empty can feel abrupt or broken ("blank page syndrome"). A structural empty state pattern provides better guidance and reassurance.
**Action:** Use the `healer-empty-state` container pattern (e.g., dashed border, brief description, and an icon) when a list is empty. Ensure decorative icons use `aria-hidden="true"` to prevent screen readers from announcing them unnecessarily, avoiding disruption to the navigational flow.
