# Chat-First Home Specification

## Goal

Replace the editorial landing page at `/` with Zona.ai's primary chat experience for guests and authenticated users.

## Behavior

- `/` renders a GPT-like empty chat workspace, not marketing content.
- Guests can type a prompt and configure composer controls that do not require protected data.
- Guest submit stores the draft in `sessionStorage`, then starts Google OAuth with `callbackURL: '/'`.
- Returning authenticated users recover the draft in the composer. The draft is never submitted automatically.
- Authenticated submit creates a conversation, navigates to `/chat/$conversationId`, then sends the recovered/current prompt through the existing authenticated chat flow.
- `/chat` remains an authenticated compatibility route and redirects authenticated users to `/`.
- `/chat/$conversationId` remains the persistent conversation route.

## Security

- Chat, conversation, history, upload, and model server functions retain server-side authentication.
- Guest UI never calls protected chat or conversation functions before authentication.
- Guest sidebar contains no private conversation data.
- Draft storage contains only the user's local prompt and is removed after recovery.

## Visual Direction

- Functional chat density modeled after GPT-style products.
- Keep Zona.ai tokens: Cream Paper, Inter, Ink Black, Fresh Grass, white/sandstone surfaces.
- No poster headline, decorative marketing prose, illustration, heavy shadow, neon, gradient, emoji, glassmorphism, or capsule clutter.
- Responsive desktop/mobile layout; keyboard-accessible composer and auth action.

## Testing

- Unit test draft persistence/recovery.
- Component tests for guest submit and authenticated submit handoff.
- Update route/landing E2E expectations.
- Run typecheck, Biome, relevant Vitest, build, browser smoke checks.
