console.log("Hello from start_server.js");
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const venvNode = path.join(__dirname, '.venv', 'Scripts', 'node.exe');
const serverScript = path.join(__dirname, 'dist', 'index.js');

console.log("Target Node:", venvNode);

if (!fs.existsSync(venvNode)) {
    console.error("Venv node not found!");
    process.exit(1);
}

const child = spawn(venvNode, ['-r', 'dotenv/config', serverScript], {
    stdio: 'inherit',
    cwd: __dirname,
    env: process.env
});

child.on('exit', (code) => {
    console.log("Child exited with", code);
    process.exit(code);
});
