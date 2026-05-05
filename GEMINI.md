# Council Workflow (Mandatory)

You MUST follow this sequence for every major feature or fix:

1. **Plan**: Update `docs/PLAN.md` with scope, acceptance criteria, and test commands.
2. **Implement**: Perform the changes.
3. **Internal Test**: Run the project tests to ensure baseline stability.
4. **External Review**: Run the `/council:review` command to get feedback from Kilo AI.
5. **Fix & Harden**: Apply high/medium priority fixes suggested by the review.
6. **Final Verification**: Re-run tests and summarize the result.

Never skip steps. If a step cannot be performed (e.g., no staged changes for review), document it clearly.
