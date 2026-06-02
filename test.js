const http = require('http');
const { exec } = require('child_process');

console.log("Starting verification test...");

// Start the server standalone in a child process
const serverProcess = exec('node index.js', { cwd: __dirname });

serverProcess.stderr.on('data', (data) => {
  console.log(`[Server Log]: ${data.trim()}`);
});

// Wait 2 seconds for server to start, then run tests
setTimeout(() => {
  // Test 1: Fetch Home Page
  http.get('http://localhost:9886/', (res) => {
    console.log(`Test 1 (Fetch Index HTML): Status Code = ${res.statusCode}`);
    if (res.statusCode === 200) {
      console.log("✅ Success: Server is up and serving static HTML pages.");
    } else {
      console.error("❌ Failed: Serve index page failed.");
      process.exit(1);
    }
  }).on('error', (err) => {
    console.error("❌ Failed to connect to server:", err.message);
    process.exit(1);
  });

  // Test 2: Fetch Tasks API
  http.get('http://localhost:9886/api/tasks', (res) => {
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
      console.log(`Test 2 (Fetch Tasks JSON): Status Code = ${res.statusCode}`);
      try {
        const parsedData = JSON.parse(rawData);
        console.log("✅ Success: Tasks API returned valid JSON:", JSON.stringify(parsedData));
        
        // Cleanup and finish
        console.log("\nAll verification tests passed successfully!");
        serverProcess.kill();
        process.exit(0);
      } catch (e) {
        console.error("❌ Failed to parse tasks JSON:", e.message);
        serverProcess.kill();
        process.exit(1);
      }
    });
  }).on('error', (err) => {
    console.error("❌ Failed to connect to API:", err.message);
    serverProcess.kill();
    process.exit(1);
  });
}, 2000);
