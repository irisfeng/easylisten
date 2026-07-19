import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyLoginCode } from "@/lib/account-store";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      id: "email-code",
      name: "邮箱验证码",
      credentials: {
        email: { label: "邮箱", type: "email" },
        code: { label: "验证码", type: "text" },
      },
      authorize: async (credentials) =>
        verifyLoginCode(credentials?.email, credentials?.code),
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.userId = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = String(token.userId ?? token.sub ?? "");
      return session;
    },
  },
});
