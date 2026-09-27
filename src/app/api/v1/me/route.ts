import { handler } from "@/server/rest";

export const GET = handler("read", async ({ token }) => ({
  name: token.name,
  scopes: token.scopes,
  workspace: token.workspace,
}));
