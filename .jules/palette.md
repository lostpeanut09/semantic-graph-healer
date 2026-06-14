## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2026-06-14 - Communicating Async States on Plugin Setting Buttons

**Learning:** When using Obsidian's `ButtonComponent` in settings tabs to execute asynchronous actions (like querying external services or scanning models), simply changing the button text to "Scanning..." is not enough for screen reader users to understand that a background process is active. It also falls into the "literal ellipsis" anti-pattern in `aria-label` when the text is updated dynamically if not paired with correct aria attributes.
**Action:** Use `button.buttonEl.setAttribute('aria-busy', 'true')` when the async process starts, and `.removeAttribute('aria-busy')` when it finishes, to provide semantic feedback to assistive technologies. Additionally, when using dynamic attributes, avoid literal "..." in string interpolation to ensure clean screen reader output.
