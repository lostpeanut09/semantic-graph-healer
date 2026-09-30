## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-10-25 - Extraneous Inline Styles in Constrained Environments

**Learning:** When restricted to using existing classes and forbidden from adding custom CSS, developers often attempt to bypass this constraint by applying extensive inline styles (e.g., `style="padding: 2em; text-align: center; border-style: dashed;"`). Even if these styles rely on native application CSS variables or simple attributes, heavy reliance on inline styles creates maintenance overhead and fragments the design system, ultimately violating the spirit of the "no custom CSS" rule.
**Action:** When implementing UX patterns like empty states under strict styling constraints, rely primarily on semantic HTML and existing, comprehensive utility classes (like `healer-card`, `healer-empty-state`) to define the structure and appearance. Only use minimal inline styles for exceptional, one-off visual overrides (like `border-style: dashed` if no dashed-border utility exists) that cannot be achieved through the existing class system.
