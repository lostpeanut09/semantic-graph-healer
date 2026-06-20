## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.
## 2024-06-20 - Adding Ellipsis to aria-label
**Learning:** Adding an ellipsis to an `aria-label` attribute on buttons to signify loading text (e.g. `aria-label="Executing..."`) might actually result in screen readers reading "dot dot dot" and causing degraded experience compared to using `aria-busy` along with visually hidden context text.
**Action:** Always make sure `aria-label` text is correctly synchronized to visual states, and if the label includes ellipses, ensure it accurately conveys meaning without confusing screen readers.
