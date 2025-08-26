import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { resetType = 'clear', priceBookId } = await request.json()
    
    if (!priceBookId) {
      return NextResponse.json(
        { 
          error: 'Thiếu thông tin bảng giá cần reset.',
          suggestion: 'Vui lòng chọn bảng giá cần reset.'
        },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Verify price book exists
    const { data: priceBook, error: bookError } = await supabase
      .from('price_books')
      .select('price_book_id, name, channel')
      .eq('price_book_id', priceBookId)
      .single()

    if (bookError || !priceBook) {
      return NextResponse.json(
        { 
          error: 'Không tìm thấy bảng giá cần reset.',
          suggestion: 'Bảng giá có thể đã bị xóa. Vui lòng kiểm tra lại danh sách bảng giá.'
        },
        { status: 404 }
      )
    }

    let result = { success: false, message: '', rulesCreated: 0, rulesDeleted: 0 }

    switch (resetType) {
      case 'clear':
        result = await resetToClear(supabase, priceBookId)
        break
      case 'basic':
        result = await resetToBasic(supabase, priceBookId)
        break
      case 'pos_template':
        result = await resetToPosTemplate(supabase, priceBookId)
        break
      default:
        return NextResponse.json(
          { 
            error: 'Loại reset không hợp lệ.',
            suggestion: 'Chọn một trong các loại: clear, basic, pos_template'
          },
          { status: 400 }
        )
    }

    if (!result.success) {
      return NextResponse.json(
        { 
          error: 'Không thể reset bảng giá.',
          suggestion: result.message || 'Vui lòng thử lại sau.'
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `✅ Đã reset bảng giá "${priceBook.name}" thành công.`,
      details: {
        priceBook: priceBook.name,
        resetType: getResetTypeName(resetType),
        rulesDeleted: result.rulesDeleted,
        rulesCreated: result.rulesCreated
      },
      suggestion: resetType === 'clear' 
        ? 'Bảng giá hiện chỉ sử dụng giá niêm yết. Bạn có thể thêm quy tắc mới nếu cần.'
        : 'Bảng giá đã được cập nhật với các quy tắc mặc định. Bạn có thể chỉnh sửa thêm nếu cần.'
    })

  } catch (error: any) {
    console.error('Reset price book error:', error)
    return NextResponse.json(
      { 
        error: 'Có lỗi xảy ra trong quá trình reset.',
        suggestion: 'Vui lòng thử lại sau hoặc liên hệ bộ phận kỹ thuật.',
        details: error.message
      },
      { status: 500 }
    )
  }
}

// Option 1: Clear all rules (chỉ dùng giá niêm yết)
async function resetToClear(supabase: any, priceBookId: number) {
  try {
    // Get count of existing rules
    const { count: existingCount } = await supabase
      .from('price_rules')
      .select('*', { count: 'exact', head: true })
      .eq('price_book_id', priceBookId)

    // Delete all existing rules
    const { error: deleteError } = await supabase
      .from('price_rules')
      .delete()
      .eq('price_book_id', priceBookId)

    if (deleteError) {
      return { success: false, message: `Lỗi xóa quy tắc: ${deleteError.message}`, rulesDeleted: 0, rulesCreated: 0 }
    }

    return { 
      success: true, 
      message: 'Đã xóa tất cả quy tắc giá', 
      rulesDeleted: existingCount || 0, 
      rulesCreated: 0 
    }
  } catch (error: any) {
    return { success: false, message: error.message, rulesDeleted: 0, rulesCreated: 0 }
  }
}

// Option 2: Basic rules (quy tắc cơ bản)
async function resetToBasic(supabase: any, priceBookId: number) {
  try {
    // Clear existing rules first
    const clearResult = await resetToClear(supabase, priceBookId)
    if (!clearResult.success) return clearResult

    // Create basic rules
    const basicRules = [
      {
        price_book_id: priceBookId,
        scope: 'all',
        action_type: 'percent',
        action_value: -5, // Giảm 5% cho đơn mua >= 5 sản phẩm
        min_qty: 5,
        priority: 10,
        is_active: true,
        notes: 'Giảm 5% cho đơn hàng từ 5 sản phẩm trở lên',
        created_at: new Date().toISOString()
      },
      {
        price_book_id: priceBookId,
        scope: 'all',
        action_type: 'percent', 
        action_value: -10, // Giảm 10% cho đơn mua >= 10 sản phẩm
        min_qty: 10,
        priority: 5, // Ưu tiên cao hơn rule 5%
        is_active: true,
        notes: 'Giảm 10% cho đơn hàng từ 10 sản phẩm trở lên',
        created_at: new Date().toISOString()
      }
    ]

    const { error: insertError } = await supabase
      .from('price_rules')
      .insert(basicRules)

    if (insertError) {
      return { success: false, message: `Lỗi tạo quy tắc cơ bản: ${insertError.message}`, rulesDeleted: clearResult.rulesDeleted, rulesCreated: 0 }
    }

    return { 
      success: true, 
      message: 'Đã áp dụng quy tắc giá cơ bản', 
      rulesDeleted: clearResult.rulesDeleted, 
      rulesCreated: basicRules.length 
    }
  } catch (error: any) {
    return { success: false, message: error.message, rulesDeleted: 0, rulesCreated: 0 }
  }
}

// Option 3: POS Template (template chuyên cho POS)
async function resetToPosTemplate(supabase: any, priceBookId: number) {
  try {
    // Clear existing rules first
    const clearResult = await resetToClear(supabase, priceBookId)
    if (!clearResult.success) return clearResult

    // Create POS-specific rules
    const posRules = [
      {
        price_book_id: priceBookId,
        scope: 'all',
        action_type: 'percent',
        action_value: -3, // Giảm 3% cho khách mua >= 3 món
        min_qty: 3,
        priority: 20,
        is_active: true,
        notes: 'Khuyến mãi mua nhiều: 3+ món giảm 3%',
        created_at: new Date().toISOString()
      },
      {
        price_book_id: priceBookId,
        scope: 'all',
        action_type: 'percent',
        action_value: -7, // Giảm 7% cho khách mua >= 7 món  
        min_qty: 7,
        priority: 15,
        is_active: true,
        notes: 'Khuyến mãi mua nhiều: 7+ món giảm 7%',
        created_at: new Date().toISOString()
      },
      {
        price_book_id: priceBookId,
        scope: 'all',
        action_type: 'amount',
        action_value: -5000, // Giảm 5k cho đơn >= 15 món
        min_qty: 15,
        priority: 10,
        is_active: true,
        notes: 'Ưu đãi đặc biệt: 15+ món giảm 5,000đ',
        created_at: new Date().toISOString()
      }
    ]

    const { error: insertError } = await supabase
      .from('price_rules')
      .insert(posRules)

    if (insertError) {
      return { success: false, message: `Lỗi tạo template POS: ${insertError.message}`, rulesDeleted: clearResult.rulesDeleted, rulesCreated: 0 }
    }

    return { 
      success: true, 
      message: 'Đã áp dụng template POS chuyên nghiệp', 
      rulesDeleted: clearResult.rulesDeleted, 
      rulesCreated: posRules.length 
    }
  } catch (error: any) {
    return { success: false, message: error.message, rulesDeleted: 0, rulesCreated: 0 }
  }
}

function getResetTypeName(type: string): string {
  switch (type) {
    case 'clear': return 'Xóa sạch (chỉ giá niêm yết)'
    case 'basic': return 'Quy tắc cơ bản'
    case 'pos_template': return 'Template POS chuyên nghiệp'
    default: return type
  }
}
