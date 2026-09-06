import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "connectsphere",
    timestamp: new Date().toISOString(),
  });
}
