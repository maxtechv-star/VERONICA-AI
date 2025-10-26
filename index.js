
import * as baileys from 'baileys';
import fs from 'fs-extra';
import pino from 'pino';
import cors from 'cors';
import express from 'express';
import NodeCache from 'node-cache';
import { Boom } from '@hapi/boom';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import useSequelizeAuthState, { clearSessionData } from './utils.js';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

const app = express();

app.set('json spaces', 2);

app.use((req, res, next) => {
	res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
	res.setHeader('Pragma', 'no-cache');
	res.setHeader('Expires', '0');
	next();
});

app.use(cors());
app.use(express.json());
app.use(express.static(join(dirname(fileURLToPath(import.meta.url)), '.')));

let PORT = process.env.PORT || 8000;
let message = `
Xstro Multi Device Pairing Success
Use the Accesskey Above for Xstro Bot
Please Don't Share to UnAuthorized Users
I won't ask you for your Session
`;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const uploadFolder = join(__dirname, 'uploads');
if (!fs.existsSync(uploadFolder)) {
	fs.mkdirSync(uploadFolder, { recursive: true });
}

function generateAccessKey() {
	const formatNumber = num => num.toString().padStart(2, '0');
	const r1 = formatNumber(Math.floor(Math.random() * 100));
	const r2 = formatNumber(Math.floor(Math.random() * 100));
	const r3 = formatNumber(Math.floor(Math.random() * 100));
	return `XSTRO_${r1}_${r2}_${r3}`;
}

// Serve HTML page
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'index.html'));
});

// Pair endpoint
app.get('/pair', async (req, res) => {
	let phone = req.query.phone;
	if (!phone) {
		return res.json({ error: 'Provide Valid Phone Number' });
	}
	
	try {
		const code = await getPairingCode(phone);
		res.json({ code: code });
	} catch (error) {
		console.error('Pairing error:', error);
		res.json({ error: error.message });
	}
});

app.get('/uploads/:accessKey/:file', async (req, res) => {
	const { accessKey, file } = req.params;
	const filePath = join(uploadFolder, accessKey, file);

	if (fs.existsSync(filePath)) {
		res.sendFile(filePath);
	} else {
		res.status(404).json({ error: 'File not found' });
	}
});

app.get('/session/:key', async (req, res) => {
	const accessKey = req.params.key;
	const folderPath = join(uploadFolder, accessKey);

	if (!fs.existsSync(folderPath)) {
		return res.status(404).json({ error: 'Folder not found' });
	}

	const files = await Promise.all(
		(
			await fs.readdir(folderPath)
		).map(async file => {
			const url = `${req.protocol}://${req.get('host')}/uploads/${accessKey}/${file}`;
			return {
				name: file,
				url: url,
			};
		}),
	);

	res.json({
		accessKey: accessKey,
		files: files,
	});
});

async function getPairingCode(phone) {
	return new Promise(async (resolve, reject) => {
		try {
			const accessKey = generateAccessKey();
			const logger = pino({ level: 'silent' });
			const { state, saveCreds } = await useSequelizeAuthState(accessKey, pino({ level: 'silent' }));
			const { version } = await baileys.fetchLatestBaileysVersion();
			const cache = new NodeCache();

			const conn = baileys.makeWASocket({
				version: version,
				printQRInTerminal: true,
				logger: logger,
				browser: baileys.Browsers.ubuntu('Chrome'),
				auth: {
					creds: state.creds,
					keys: baileys.makeCacheableSignalKeyStore(state.keys, logger, cache),
				},
			});

			if (!conn.authState.creds.registered) {
				let phoneNumber = phone ? phone.replace(/[^0-9]/g, '') : '';
				if (phoneNumber.length < 10) return reject(new Error('Enter Valid Phone Number (min 10 digits)'));

				setTimeout(async () => {
					try {
						let code = await conn.requestPairingCode(phoneNumber);
						resolve(code);
					} catch (error) {
						console.error('Error requesting pairing code:', error);
						reject(new Error('Failed to get pairing code'));
					}
				}, 3000);
			}

			conn.ev.on('creds.update', saveCreds);

			conn.ev.on('connection.update', async update => {
				const { connection, lastDisconnect } = update;

				if (connection === 'open') {
					await baileys.delay(10000);
					
					try {
						const msgsss = await conn.sendMessage(conn.user.id, { text: accessKey });
						await conn.sendMessage(conn.user.id, { text: message }, { quoted: msgsss });
						
						const newSessionPath = join(uploadFolder, accessKey);
						if (!fs.existsSync(newSessionPath)) {
							fs.mkdirSync(newSessionPath, { recursive: true });
						}
						
						await clearSessionData();
						process.send('reset');
					} catch (error) {
						console.error('Error in connection open handler:', error);
					}
				}

				if (connection === 'close') {
					const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
					const resetReasons = [baileys.DisconnectReason.connectionClosed, baileys.DisconnectReason.connectionLost, baileys.DisconnectReason.timedOut, baileys.DisconnectReason.connectionReplaced];
					const resetWithClearStateReasons = [baileys.DisconnectReason.loggedOut, baileys.DisconnectReason.badSession];

					if (resetReasons.includes(reason) || resetWithClearStateReasons.includes(reason) || reason === baileys.DisconnectReason.restartRequired) {
						process.send('reset');
					} else {
						process.send('reset');
					}
				}
			});

			conn.ev.on('messages.upsert', msg => {
				if (msg.type === 'notify') {
					console.log('Message received:', JSON.parse(JSON.stringify(msg.messages[0])));
				}
			});
		} catch (error) {
			console.error('Error occurred in getPairingCode:', error);
			reject(new Error('An Error Occurred'));
		}
	});
}

app.listen(PORT, '0.0.0.0', () => {
	console.log(`Xstro Pair Server running on port: ${PORT}`);
});
