import { NextRequest, NextResponse } from "next/server";

const PROXY_UPSTREAM = process.env.PROXY_UPSTREAM || "http://localhost:3000";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  return proxy(request, await params);
}
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  return proxy(request, await params);
}
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  return proxy(request, await params);
}
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  return proxy(request, await params);
}
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  return proxy(request, await params);
}

async function proxy(
  request: NextRequest,
  { path = [] }: { path?: string[] },
) {
  const pathStr = path.length ? path.join("/") : "";
  const url = new URL(request.url);
  const target = new URL(pathStr + url.search, PROXY_UPSTREAM);

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");

  const res = await fetch(target.toString(), {
    method: request.method,
    headers,
    body: request.body,
  });

  const resHeaders = new Headers(res.headers);
  resHeaders.delete("transfer-encoding");
  resHeaders.delete("connection");

  return new NextResponse(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: resHeaders,
  });
}
