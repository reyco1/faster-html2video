const { execSync } = require('child_process');
const path = require('path');

console.log('🧪 Testing Recording Control Feature\n');

const tests = [
  {
    name: 'Basic recording control',
    cmd: 'node ../dist/cli.js recording-control.html ../output/test-recording-control.webm --enable-recording-control --wait-for-start-signal --max-recording-duration 30 -f 30',
    description: 'Test with manual start/stop control'
  },
  {
    name: 'Auto-start recording',
    cmd: 'node ../dist/cli.js recording-control.html ../output/test-auto-start.webm --enable-recording-control --max-recording-duration 15 -f 30',
    description: 'Test with automatic start (no wait)'
  },
  {
    name: 'Console-based control',
    cmd: 'node ../dist/cli.js recording-control.html ../output/test-console-control.webm --enable-recording-control --wait-for-start-signal --verbose -f 30',
    description: 'Test with console message control'
  }
];

console.log('Recording Control Test Instructions:');
console.log('1. For "Basic recording control" test:');
console.log('   - Click "Start Recording" button to begin');
console.log('   - Click "Stop Recording" to end (or wait 10s for auto-stop)');
console.log('');
console.log('2. For "Auto-start recording" test:');
console.log('   - Recording starts automatically');
console.log('   - Click "Stop Recording" to end early');
console.log('');
console.log('3. For "Console-based control" test:');
console.log('   - Open browser console');
console.log('   - Type: console.log("RECORDING:START")');
console.log('   - Type: console.log("RECORDING:STOP")');
console.log('');

console.log('Choose a test to run:');
tests.forEach((test, index) => {
  console.log(`${index + 1}. ${test.name} - ${test.description}`);
});

console.log('\nRun a test with: node test-recording-control.js [number]');
console.log('Example: node test-recording-control.js 1');

const testIndex = process.argv[2] ? parseInt(process.argv[2]) - 1 : 0;

if (testIndex >= 0 && testIndex < tests.length) {
  const test = tests[testIndex];
  console.log(`\n🚀 Running: ${test.name}`);
  console.log(`Command: ${test.cmd}\n`);
  
  try {
    execSync(test.cmd, {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..')
    });
    console.log(`\n✅ Test completed successfully!`);
  } catch (error) {
    console.error(`\n❌ Test failed:`, error.message);
  }
} else {
  console.log('\nPlease specify a valid test number (1-3)');
}