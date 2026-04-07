import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID ?? '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
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
