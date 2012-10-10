var child_process = require('child_process');
var fs = require('fs');
var util = require('util');
var path = require('path');
var os = require('os');

// Set up directory for a test project under TMPDIR

var testDir = path.join(os.tmpDir(),"emote_regression_test");
if(!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir);
}
process.chdir(testDir);

var time = "" + new Date().getTime();
fs.mkdirSync(time);
process.chdir(time);

testDir = path.join(testDir,time);

console.log("Running test in " + testDir);

var script;

if (os.platform() == 'win32')
{
    script = "run.bat";
}
else
{
    script = "run.sh";
}

var testScript = path.join(__dirname,script);

child_process.spawn(testScript, [], {
    stdio: [process.stdin, process.stdout, process.stderr], 
    cwd: testDir
});
