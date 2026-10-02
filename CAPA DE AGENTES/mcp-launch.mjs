import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const bundled = path.join(here, '..', 'agentes/.venv/Scripts/python.exe');
const proc = spawn(existsSync(bundled) ? bundled : 'python', [path.join(here, 'mcp_server.py')], {stdio: 'inherit', cwd: path.dirname(here), windowsHide:true});
proc.on('error', e => { console.error(e.message); process.exitCode=1; });
proc.on('exit', code => {process.exitCode=code ?? 1;});
