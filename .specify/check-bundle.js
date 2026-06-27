const fs = require('fs');
const path = require('path');

const dir = 'C:/personal_projects/crisis-map/apps/web/dist/web/browser';
const files = fs.readdirSync(dir).filter((f) => /^main-.*\.js$/.test(f));
console.log('main.js candidates:', files);

const f = files[0];
const s = fs.readFileSync(path.join(dir, f), 'utf8');
console.log('main.js size:', s.length);

const emailIdx = s.indexOf('arkemdigital');
console.log('email found at index:', emailIdx);
if (emailIdx > 0) {
  const ctx = s.substring(Math.max(0, emailIdx - 120), emailIdx + 120).replace(/\n/g, ' ');
  console.log('context around email:', ctx);
}

const checks = [
  ['preview ES (no email)', 'Esto abrirá tu app de correo para enviar un mensaje al equipo'],
  ['preview EN (no email)', 'open your mail app so you can send a message to the CrisisMap team'],
  ['preview PT (no email)', 'abrir o seu app de e-mail para enviar uma mensagem à equipa'],
  ['contains a {email} placeholder', '{email}'],
  ['contains @gmail literally', '@gmail'],
];
for (const [name, needle] of checks) {
  console.log(`  ${name}: ${s.indexOf(needle) > 0 ? 'YES' : 'no'}`);
}