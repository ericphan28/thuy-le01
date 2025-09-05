import { NextResponse, type NextRequest } from 'next/server'

// Simple debug route to verify API wiring and unblock build
export async function GET(_req: NextRequest) {
	return NextResponse.json({ success: true, message: 'Auth debug route is active' })
}

export async function POST(req: NextRequest) {
	try {
		const body = await req.json().catch(() => ({}))
		return NextResponse.json({ success: true, received: body })
	} catch (error) {
		return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Lỗi không xác định' }, { status: 500 })
	}
}
