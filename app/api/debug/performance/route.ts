import { NextResponse, type NextRequest } from 'next/server'

export async function GET(_req: NextRequest) {
	return NextResponse.json({ success: true, message: 'Debug performance route is active' })
}
