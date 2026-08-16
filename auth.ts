import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import { resolveAuthBaseUrl } from '@/lib/auth/baseUrl';
import { env } from '@/lib/env';

// Pin OAuth redirect_uri to the public canon domain — not a *.vercel.app alias.
process.env.AUTH_URL = resolveAuthBaseUrl();

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    GitHub({
      clientId: env.GITHUB_CLIENT_ID ?? '',
      clientSecret: env.GITHUB_CLIENT_SECRET ?? '',
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        const username = typeof token.login === 'string' ? token.login : session.user.name ?? null;
        if (username) {
          session.user.githubUsername = username;
        }
        if (typeof token.sub === 'string') {
          session.user.mobius_id = `mbx_${token.sub}`;
        }
      }
      return session;
    },
    async jwt({ token, profile }) {
      if (profile && typeof profile === 'object' && 'login' in profile) {
        const login = (profile as { login?: unknown }).login;
        if (typeof login === 'string') {
          token.login = login;
        }
      }
      return token;
    },
  },
  pages: {
    signIn: '/terminal',
  },
});
