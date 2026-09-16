export { default } from 'next-auth/middleware';

export const config = {
  // Protect everything except the login page, NextAuth's own API routes,
  // static assets, and the PWA manifest/icons (public/icons/*.png) — those
  // must be fetchable by the browser's install-prompt / home-screen logic
  // even when logged out.
  matcher: [
    '/((?!login|api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons).*)',
  ],
};
