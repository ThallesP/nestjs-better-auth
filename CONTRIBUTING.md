# Contributing

Thanks for your interest in contributing to `@thallesp/nestjs-better-auth`! This
guide covers how to set up the project, the commands you'll use, and what we
expect from a pull request.

## Toolchain

> [!IMPORTANT]
> This repository is developed and tested with **[Bun](https://bun.com)**. The
> `bun.lock` file is the source of truth for dependencies. Please do **not** run
> `npm`, `yarn`, or `pnpm` against the repository — doing so bypasses the
> lockfile, can produce misleading "missing module" errors, and won't match CI.
>
> (The published package can still be installed with any package manager — this
> only applies to working on the library itself.)

Prerequisites:

- [Bun](https://bun.com/docs/installation) (the version used by CI is pinned in
  the repository — match it to avoid surprises)
- Node.js `>= 22.22.1`

## Getting started

```bash
# 1. Fork and clone your fork
git clone https://github.com/<your-username>/nestjs-better-auth.git
cd nestjs-better-auth

# 2. Install dependencies (uses bun.lock)
bun install

# 3. Make sure the baseline is green before changing anything
bun run check
bun run build
bun run test
```

## Development commands

| Command                 | What it does                                          |
| ----------------------- | ----------------------------------------------------- |
| `bun run build`         | Build the package with `unbuild`                      |
| `bun run check`         | Lint **and** format check (Biome) — run before a PR   |
| `bun run lint`          | Lint only                                             |
| `bun run format`        | Format only                                           |
| `bun run test`          | Run the full suite on both adapters (Express + Fastify) |
| `bun run test:express`  | Run the suite on the Express adapter                  |
| `bun run test:fastify`  | Run the suite on the Fastify adapter                  |
| `bun run test:watch`    | Run tests in watch mode                               |

This library is HTTP-adapter agnostic and supports both **Express** and
**Fastify**, so please make sure your change passes on both adapters.

## Opening a pull request

1. Open (or find) an issue describing the problem or feature **before** starting
   non-trivial work, so we can agree on the approach and avoid wasted effort.
2. Create a branch from `master` with a descriptive name.
3. Make your change, with tests when it affects behavior.
4. Run `bun run check` and `bun run test` locally — both must pass.
5. Open the PR against `master`, fill in the template, and link the issue
   (`Closes #123`).

## Contribution guidelines

- **Bug reports and fixes must be reproducible.** Include the exact steps,
  commands, and environment. A "fix" for a problem that only appears when running
  non-standard commands or a different package manager is not a real fix.
- **Keep PRs focused.** One logical change per PR makes review faster.
- **Be ready to discuss and iterate.** You should be able to explain every line
  you submit.

### AI-assisted and automated contributions

AI tools are welcome when used responsibly. If you use them, please:

- **Understand and be able to maintain every line you submit**, including any
  AI-generated parts.
- Make sure the change addresses a **real, verified** problem — not a warning
  fabricated by running commands outside the project's toolchain.

> [!NOTE]
> Low-effort, automated, or bounty-driven pull requests that don't meet these
> expectations may be closed without detailed review, to keep maintainer time
> focused on genuine contributions.
