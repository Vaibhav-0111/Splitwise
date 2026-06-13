import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const firebaseUserId = request.cookies.get("firebase_uid")?.value;
  const isAuthPage =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/signup");

  if (!firebaseUserId && !isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (firebaseUserId && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/groups";
    return NextResponse.redirect(url);
  }

  return NextResponse.next({
    request: { headers: request.headers },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
