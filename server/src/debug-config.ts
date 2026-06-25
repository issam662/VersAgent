import 'dotenv/config';
import { config } from './config.js';

console.log('--- DEBUG CONFIG START ---');
console.log('Current Directory:', process.cwd());
console.log('process.env.PORT:', process.env.PORT);
console.log('config.port:', config.port);
console.log('--- DEBUG CONFIG END ---');
