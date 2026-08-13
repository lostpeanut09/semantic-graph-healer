## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-06-05 - Hiding Decorative Elements from Screen Readers

**Learning:** When adding visual icons or emojis to UI components (e.g., in empty states or decorative containers), screen readers will often read them aloud, which can disrupt the navigational flow for visually impaired users.
**Action:** Apply the `aria-hidden="true"` attribute to decorative icons or emojis to prevent screen readers from announcing them unnecessarily, as they don't add functional meaning to the application.
