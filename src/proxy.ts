import { NextResponse, type NextRequest } from "next/server";

// Cheap gate: no cookie → login page. The session itself is verified against the DB
// in the (app) layout and in every server action.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("catastif_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/health|api/v1|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
