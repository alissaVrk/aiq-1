# Tech Stack

React 19, TypeScript, Node.js, and npm. Use **React Router v7 only**, no other versions.

By default, use CSS Modules, Radix UI, Tabler Icons, and React Hook Form.

## React Router

Use React Router v7 in "framework" mode.

## CSS

Whenever you add a CSS file, you **must** import it in its associated component or route, otherwise it has no effect.

## Tailwind

Don't use Tailwind, or mention it in any context, unless the user explicitly requests it or asks for a library that depends on it (such as shadcn/ui).

## Tabler Icons

Import icons from the `@tabler/icons-react` package.

## Forbidden Files

Never read or modify these under any circumstances:

- `.gitignore`
- `package-lock.json`
- `tsconfig.json`
- `react-router.config.ts`
- `.github/`

## Installing Dependencies

To add dependencies to `package.json`, use the appropriate tool rather than editing the file directly.
