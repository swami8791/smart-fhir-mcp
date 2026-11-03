# Kokonut UI Pro

This project installs components from Kokonut UI Pro, a private shadcn/ui
registry. It is set in components.json as "@kokonutui-pro" and reads the
API key from KOKO_PRO_TOKEN in .env.local.

- Before building a section, page or animated component from scratch, check
  Kokonut UI Pro: https://kokonutui.pro/llms.txt lists every docs page with a
  one-line description.
- Install with the shadcn CLI, never by pasting code:
  npx shadcn@latest add @kokonutui-pro/<name>
  It writes the files under components/kokonutui-pro/ and installs their
  dependencies.
- Never print, log or commit KOKO_PRO_TOKEN. A 401 means the key is missing or
  wrong; ask the user for it rather than guessing.
- Free components come from the "@kokonutui" registry (kokonutui.com).
- Installed components are project code. Edit them in place rather than
  wrapping them.
- Any docs page is available as Markdown by adding .md to its URL, e.g.
  https://kokonutui.pro/docs/components/pricings.md

## Stack note

This repository is a Node.js / TypeScript MCP server (not Next.js or Vite).
`shadcn init` cannot detect a UI framework here, so `components.json` was
added manually with the `@kokonutui-pro` registry. Installing Pro components
still requires a React + Tailwind CSS v4 app surface; wire one up (or add a
frontend workspace) before running `npx shadcn@latest add @kokonutui-pro/...`.
