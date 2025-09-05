'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function TestPricingPage() {
  const [sku, setSku] = useState('SP000049');
  const [quantity, setQuantity] = useState(1);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const testPricing = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/pricing/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku,
          qty: quantity
        })
      });
      
      const data = await response.json();
      setResult(data);
      console.log('=== PRICING TEST RESULT ===');
      console.log('SKU:', sku);
      console.log('Quantity:', quantity);
      console.log('Result:', data);
      console.log('=========================');
    } catch (error) {
      console.error('Pricing test error:', error);
      setResult({ error: error instanceof Error ? error.message : 'Lỗi không xác định' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Test Pricing Calculator</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="sku">Product SKU</Label>
            <Input 
              id="sku"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="SP000049"
            />
          </div>
          
          <div>
            <Label htmlFor="quantity">Quantity</Label>
            <Input 
              id="quantity"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              placeholder="1"
            />
          </div>
          
          <Button onClick={testPricing} disabled={loading} className="w-full">
            {loading ? 'Testing...' : 'Test Pricing'}
          </Button>
          
          <div className="text-sm text-gray-600">
            <p>SKU: {sku}</p>
            <p>Expected: 220,000₫ → 190,000₫ (with net rule)</p>
            <p>Actual result will be shown below...</p>
          </div>
          
          {result && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-2">Result:</h3>
              <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
