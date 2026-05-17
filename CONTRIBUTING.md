# Contributing

## Automation and commit verification

Commits from Mobius automation (`mobius-bot`, catalog workflows, and sentinel jobs) are typically **unsigned**. GitHub shows these as “Unverified,” which is expected: there is no human GPG key on the bot identity. If branch protection requires verified commits, either configure GPG signing in the relevant workflows using a dedicated bot key stored in repository secrets, or adjust protection rules for automation accounts.
