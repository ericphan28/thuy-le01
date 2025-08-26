const https = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/debug-pricing',
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  }
};

console.log('Making HTTP request to debug pricing API...');

const req = https.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers: ${JSON.stringify(res.headers, null, 2)}`);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response body:');
    console.log(data);
    
    try {
      const parsed = JSON.parse(data);
      console.log('\nParsed JSON:');
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log('Could not parse as JSON');
    }
  });
});

req.on('error', (error) => {
  console.error('Request error:', error.message);
});

req.end();
