
console.log('Server Started...');

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { setupMaster, fork } from 'cluster';
import { watchFile, unwatchFile } from 'fs';
import { createInterface } from 'readline';
import yargs from 'yargs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rl = createInterface(process.stdin, process.stdout);

console.log(`
╔══════════════════════════════╗
║         XSTRO PAIR           ║
╚══════════════════════════════╝
`);

var isRunning = false;

function start(file) {
	if (isRunning) return;
	isRunning = true;
	let args = [join(__dirname, file), ...process.argv.slice(2)];
	console.log('Starting:', [process.argv[0], ...args].join(' '));
	
	setupMaster({
		exec: args[0],
		args: args.slice(1),
	});
	
	let p = fork();
	p.on('message', data => {
		console.log('[RECEIVED]', data);
		switch (data) {
			case 'reset':
				p.process.kill();
				isRunning = false;
				start.apply(this, arguments);
				break;
			case 'uptime':
				p.send(process.uptime());
				break;
		}
	});

	p.on('exit', (_, code) => {
		isRunning = false;
		console.error('Process exited with code:', code);
		if (code === 0) return;
		watchFile(args[0], () => {
			unwatchFile(args[0]);
			start(file);
		});
	});

	let opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse());
	if (!opts['test'])
		if (!rl.listenerCount())
			rl.on('line', line => {
				p.emit('message', line.trim());
			});
}

start('index.js');
