## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2026-09-05 - Guidance-Driven Empty States and Screen Reader Flow
**Learning:** To prevent 'blank page syndrome' in advanced features like GraphRAG, implement guidance-driven empty states using a dashed border and clear instructions. Additionally, when using emojis or decorative icons in these empty states, they must include `aria-hidden="true"` to prevent screen readers from announcing them unnecessarily, which can disrupt the navigational flow for visually impaired users.
**Action:** Always include a guidance-driven empty state before any interaction occurs, and use `aria-hidden="true"` on visual icons or emojis to maintain clear accessibility flow.
