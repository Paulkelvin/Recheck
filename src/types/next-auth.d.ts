import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "buyer" | "surveyor" | "admin";
    } & DefaultSession["user"];
  }

  interface User {
    role: "buyer" | "surveyor" | "admin";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "buyer" | "surveyor" | "admin";
  }
}
