import { NextRequest, NextResponse } from 'next/server'
import { simulatePrice } from '@/lib/pricing/engine'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const price_book_id = Number(url.searchParams.get('price_book_id'))
  const sku = String(url.searchParams.get('sku') || '')
  const qty = Number(url.searchParams.get('qty') || 1)
  if (!price_book_id || !sku) {
    return NextResponse.json({ error: 'Missing price_book_id or sku' }, { status: 400 })
  }
  const result = await simulatePrice({ price_book_id, sku, qty })
  return NextResponse.json(result)
}

export async function POST(request: NextRequest) {
  try {
    const { sku, qty, when, customer_id } = await request.json()
    
    // Validate inputs
    if (!sku || !qty || qty <= 0) {
      return NextResponse.json(
        { error: 'Missing or invalid parameters. Required: sku, qty' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Debug: Let's see what columns exist in price_books table
    const { data: allPriceBooks, error: debugError } = await supabase
      .from('price_books')
      .select('*')
      .limit(1)
    
    if (debugError) {
      console.error('Debug error:', debugError)
    } else {
      console.log('Debug - Sample price book:', allPriceBooks?.[0])
    }

    // Find any price book (active first, then any available)
    let { data: defaultPriceBook } = await supabase
      .from('price_books')
      .select('price_book_id, name, is_active, channel')
      .eq('is_active', true)
      .limit(1)
      .single()

    // If no active price book, try to find any price book and activate it
    if (!defaultPriceBook) {
      console.log('No active price book found, looking for any available price book...')
      
      const { data: anyPriceBook } = await supabase
        .from('price_books')
        .select('price_book_id, name, is_active, channel')
        .limit(1)
        .single()
      
      if (anyPriceBook) {
        console.log('Found inactive price book, activating it:', anyPriceBook)
        
        // Try to activate the found price book
        const { data: activatedBook, error: updateError } = await supabase
          .from('price_books')
          .update({ is_active: true })
          .eq('price_book_id', anyPriceBook.price_book_id)
          .select('price_book_id, name, is_active, channel')
          .single()
        
        if (activatedBook && !updateError) {
          defaultPriceBook = activatedBook
          console.log('Successfully activated price book:', activatedBook)
        } else {
          console.error('Failed to activate price book:', updateError)
          // Use the inactive book anyway for simulation
          defaultPriceBook = { ...anyPriceBook, is_active: true }
        }
      }
    }

    // Auto-create default price book if none exists
    if (!defaultPriceBook) {
      console.log('No price book found at all, creating default POS price book...')
      
      const { data: createdPriceBook, error: createError } = await supabase
        .from('price_books')
        .insert({
          name: 'Bảng giá POS (Khôi phục)',
          notes: 'Bảng giá được tạo lại tự động sau khi bảng giá gốc bị xóa',
          is_active: true,
          channel: 'POS',
          effective_from: new Date().toISOString(),
          created_at: new Date().toISOString()
        })
        .select('price_book_id, name, is_active, channel')
        .single()

      if (createError) {
        console.error('Failed to create default price book:', createError)
        
        // Provide detailed error messages based on error type
        if (createError.code === '23505') {
          return NextResponse.json(
            { 
              error: 'Có xung đột khi tạo bảng giá mới.',
              suggestion: 'Vui lòng refresh trang và thử lại. Có thể đã có người khác tạo bảng giá đồng thời.'
            },
            { status: 409 }
          )
        } else if (createError.code === '42501') {
          return NextResponse.json(
            { 
              error: 'Không có quyền tạo bảng giá mới.',
              suggestion: 'Vui lòng liên hệ quản trị viên để được cấp quyền hoặc yêu cầu tạo bảng giá thủ công.'
            },
            { status: 403 }
          )
        } else {
          return NextResponse.json(
            { 
              error: 'Không thể tạo bảng giá khôi phục.',
              suggestion: 'Hệ thống cần ít nhất một bảng giá để hoạt động. Vui lòng tạo bảng giá thủ công trong phần "Quản lý bảng giá" với channel "POS" và đặt trạng thái "Hoạt động".',
              technicalDetails: `Database error: ${createError.message}`,
              recoverySteps: [
                '1. Vào Dashboard → Chính sách giá → Bảng giá',
                '2. Nhấn "Tạo bảng giá mới"', 
                '3. Đặt tên: "Bảng giá POS"',
                '4. Chọn kênh: "POS"', 
                '5. Đặt trạng thái: "Hoạt động"'
              ]
            },
            { status: 500 }
          )
        }
      }
      
      if (!createdPriceBook) {
        return NextResponse.json(
          { 
            error: 'Không thể khôi phục bảng giá tự động.',
            suggestion: 'Vui lòng tạo bảng giá thủ công. Hệ thống đã phát hiện bảng giá POS bị xóa và cần được khôi phục.',
            recoverySteps: [
              '1. Truy cập: Dashboard → Chính sách giá → Bảng giá',
              '2. Tạo bảng giá mới với tên "Bảng giá POS"',
              '3. Chọn kênh "POS" và trạng thái "Hoạt động"',
              '4. Thêm các quy tắc giá cần thiết',
              '5. Quay lại Price Simulator để sử dụng'
            ]
          },
          { status: 500 }
        )
      }
      
      console.log('Successfully created recovery price book:', createdPriceBook)
      defaultPriceBook = { ...createdPriceBook, is_active: true }
      
      // Optional: Send notification about recovery
      console.warn('🚨 RECOVERY ACTION: Created new POS price book to replace deleted one')
    }

    // Final safety check
    if (!defaultPriceBook) {
      return NextResponse.json(
        { 
          error: 'Hệ thống không thể tìm thấy hoặc tạo bảng giá.',
          suggestion: 'Vui lòng tạo bảng giá thủ công trong phần "Quản lý bảng giá" và đảm bảo nó ở trạng thái "Hoạt động".'
        },
        { status: 500 }
      )
    }

    // Get product info with better error messages
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('product_code, product_name, sale_price, base_price, category_id')
      .eq('product_code', sku.toUpperCase())
      .single()

    if (productError || !product) {
      // Check if it's a "not found" vs other database error
      if (productError?.code === 'PGRST116') {
        return NextResponse.json(
          { 
            error: `Không tìm thấy sản phẩm "${sku}". Vui lòng kiểm tra lại mã SKU.`,
            suggestion: 'Bạn có thể tìm kiếm sản phẩm trong danh sách hoặc liên hệ quản lý kho để biết mã SKU chính xác.'
          },
          { status: 404 }
        )
      } else {
        return NextResponse.json(
          { 
            error: 'Có lỗi khi truy vấn thông tin sản phẩm. Vui lòng thử lại.',
            details: productError?.message 
          },
          { status: 500 }
        )
      }
    }

    // Use existing simulatePrice function
    const simulationDate = when ? new Date(when) : new Date()
    const quantity = Math.max(1, parseInt(qty) || 1)
    
    try {
      const result = await simulatePrice({ 
        price_book_id: defaultPriceBook.price_book_id, 
        sku: sku.toUpperCase(), 
        qty: quantity,
        when: simulationDate
      })

      // Transform result to match frontend expectations
      const listPrice = result.list_price || product.sale_price || product.base_price || 0
      const finalPrice = result.final_price || listPrice
      
      // Handle case where no price is available
      if (listPrice === 0) {
        return NextResponse.json(
          { 
            error: `Sản phẩm "${product.product_name}" (${product.product_code}) chưa có giá niêm yết.`,
            suggestion: 'Vui lòng liên hệ bộ phận kinh doanh để cập nhật giá cho sản phẩm này.'
          },
          { status: 400 }
        )
      }
      
      // Store customer info if provided  
      let customerInfo = null
      if (customer_id) {
        const { data: customer } = await supabase
          .from('customers')
          .select('customer_name, customer_group, email, phone')
          .eq('id', customer_id)
          .single()
        
        if (customer) {
          customerInfo = {
            id: customer_id,
            name: customer.customer_name,
            group: customer.customer_group,
            email: customer.email,
            phone: customer.phone
          }
        }
      }

      const response = {
        product: {
          code: product.product_code,
          name: product.product_name
        },
        priceBook: {
          id: defaultPriceBook.price_book_id,
          name: defaultPriceBook.name,
          channel: defaultPriceBook.channel,
          status: defaultPriceBook.is_active ? 'Hoạt động' : 'Khả dụng',
          isRecovered: defaultPriceBook.name.includes('Khôi phục')
        },
        customer: customerInfo,
        listPrice,
        finalPrice,
        quantity,
        totalAmount: finalPrice * quantity,
        totalSavings: (listPrice - finalPrice) * quantity,
        discountPercent: listPrice > 0 ? Math.round(((listPrice - finalPrice) / listPrice) * 100) : 0,
        appliedRule: result.applied_rule_id ? {
          id: result.applied_rule_id,
          reason: result.applied_reason || `Quy tắc #${result.applied_rule_id}`
        } : null,
        simulationDate: simulationDate.toISOString(),
        message: result.applied_rule_id 
          ? `✅ Áp dụng thành công quy tắc giá #${result.applied_rule_id}` 
          : '💡 Sử dụng giá niêm yết (không có quy tắc giá phù hợp)'
      }

      return NextResponse.json(response)
    } catch (simulationError: any) {
      console.error('Simulation engine error:', simulationError)
      return NextResponse.json(
        { 
          error: 'Có lỗi trong quá trình tính toán giá. Vui lòng thử lại.',
          suggestion: 'Nếu lỗi vẫn tiếp tục, vui lòng liên hệ bộ phận kỹ thuật.'
        },
        { status: 500 }
      )
    }

  } catch (error: any) {
    console.error('Price simulation error:', error)
    return NextResponse.json(
      { error: error.message || 'Có lỗi xảy ra khi tính toán giá' },
      { status: 500 }
    )
  }
}
