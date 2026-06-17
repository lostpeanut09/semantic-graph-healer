## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-06-17 - Avoid Ellipses in aria-label for Auditory UX

**Learning:** While WCAG 2.5.3 (Label in Name) requires synchronizing dynamic `aria-label` attributes with visible text, adding literal ellipses ("...") to `aria-label`s during loading states (e.g., "Executing...") degrades auditory UX because screen readers literally read "dot dot dot".
**Action:** Exclude literal ellipses from dynamic `aria-label`s and rely on `aria-busy` to communicate the loading state to screen readers while keeping the text succinct.
