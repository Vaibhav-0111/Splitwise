import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const firebaseUserId = request.cookies.get("firebase_uid")?.value;
  const pathname = request.nextUrl.pathname;

  // Public pages that don't require auth
  const isPublicPage = pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/signup");
  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/signup");

  // Not authenticated & trying to access protected page → redirect to login
  if (!firebaseUserId && !isPublicPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Authenticated & on auth page → redirect to dashboard
  if (firebaseUserId && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
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
