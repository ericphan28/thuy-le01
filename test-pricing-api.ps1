# Test Enhanced Pricing API
$headers = @{
    "Content-Type" = "application/json"
}

$testProducts = @(
    @{ sku = "SP000049"; qty = 1 },
    @{ sku = "SP000380"; qty = 1 },
    @{ sku = "SP000384"; qty = 5 },
    @{ sku = "SP000383"; qty = 10 }
)

Write-Host "TESTING ENHANCED PRICING API" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

foreach ($test in $testProducts) {
    Write-Host "Testing: $($test.sku) (Qty: $($test.qty))" -ForegroundColor Yellow
    Write-Host "----------------------------------------" -ForegroundColor Gray
    
    try {
        $body = @{
            sku = $test.sku
            qty = $test.qty
        } | ConvertTo-Json
        
        $response = Invoke-RestMethod -Uri "http://localhost:3004/api/pricing/simulate" -Method POST -Headers $headers -Body $body
        
        Write-Host "✅ Response received:" -ForegroundColor Green
        Write-Host "   List Price: $($response.list_price)" -ForegroundColor White
        Write-Host "   Rule Price: $($response.rule_applied_price)" -ForegroundColor White
        Write-Host "   Final Price: $($response.final_price)" -ForegroundColor White
        
        if ($response.final_savings -gt 0) {
            Write-Host "   Savings: $($response.final_savings) ($($response.final_savings_percent)%)" -ForegroundColor Green
        }
        
        if ($response.applied_rule) {
            Write-Host "   Applied Rule: $($response.applied_rule.reason)" -ForegroundColor Magenta
        }
        
    } catch {
        Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "Ready for POS testing!" -ForegroundColor Cyan
Write-Host "=========================" -ForegroundColor Cyan
Write-Host "Open: http://localhost:3004/dashboard/pos" -ForegroundColor Yellow
Write-Host "Toggle Enhanced Pricing and test above products" -ForegroundColor Yellow
