## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-06-23 - Avoiding Punctuation in Dynamic aria-labels

**Learning:** While keeping dynamic text in buttons synchronized with their `aria-label` is crucial for WCAG 2.5.3, adding punctuation like ellipses (`...`) to the `aria-label` even if present visually (e.g. `Verifying...`) can cause screen readers to read "dot dot dot" or add unnatural pauses.
**Action:** Ensure that dynamic `aria-label` strings strip out unnecessary visual punctuation like ellipses while preserving the action verb (e.g., use `Verifying` for the label even when the visible text is `Verifying...`). Use `aria-busy` alongside the label to convey the loading state.
