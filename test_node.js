// Quick functional test for app.js command generation
const fs = require('fs');
const path = require('path');

// Load app.js in a way that exposes the globals
const code = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

// We need to make CommandGenerator and ItalianParser global
// Wrap the module code slightly
const wrappedCode = code
  .replace('const ItalianParser', 'global.ItalianParser')
  .replace('const CommandGenerator', 'global.CommandGenerator')
  .replace('const SyntaxHighlighter', 'global.SyntaxHighlighter')
  .replace('const UIController', 'global.UIController');

eval(wrappedCode);

const CG = global.CommandGenerator;
const IP = global.ItalianParser;

let passed = 0;
let failed = 0;

function test(name, condition) {
  if (condition) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name); }
}

console.log('=== Parser Italiano ===');
let p = IP.parse('rinomina tutti i file .txt aggiungendo report_ all\'inizio');
test('riconosce rename', p && p.action === 'rename');
test('pattern *.txt', p && p.filePattern === '*.txt');
test('operazione prefix', p && p.renameOp === 'prefix');
test('valore report_', p && p.renameValue === 'report_');

p = IP.parse('copia tutti i file .jpg più grandi di 1 MB nella cartella backup');
test('riconosce copy', p && p.action === 'copy');
test('destinazione backup', p && p.destination === 'backup');
test('size > 1MB', p && p.conditions.some(c => c.type === 'size' && c.operator === 'gt'));

p = IP.parse('elimina tutti i file .tmp modificati più di 7 giorni fa');
test('riconosce delete', p && p.action === 'delete');
test('date older 7 giorni', p && p.conditions.some(c => c.type === 'date' && c.operator === 'older'));

console.log('\n=== Generatore Bash ===');
let cmd = CG.generate('bash', 'rename', '*.pdf', [], { renameOp: 'prefix', renameValue: 'report_' });
test('prefix rinomina', cmd.includes('report_') && cmd.includes('*.pdf'));
test('ha shebang', cmd.startsWith('#!/bin/bash'));

cmd = CG.generate('bash', 'rename', '*.txt', [], { renameOp: 'date' });
test('rinomina con data', cmd.includes('date') && cmd.includes('%Y%m%d'));

cmd = CG.generate('bash', 'copy', '*.jpg', [], { destination: 'backup' });
test('copia', cmd.includes('cp') && cmd.includes('backup'));

cmd = CG.generate('bash', 'compress', '*.log', [], { archiveName: 'logs.zip' });
test('comprimi', cmd.includes('zip') && cmd.includes('logs.zip'));

// Test conditions
cmd = CG.generate('bash', 'delete', '*.tmp', [{ type: 'size', operator: 'gt', value: 1, unit: 'MB' }], {});
test('condizioni find con size', cmd.includes('-size') && cmd.includes('find'));

console.log('\n=== Generatore CMD ===');
cmd = CG.generate('cmd', 'rename', '*.pdf', [], { renameOp: 'prefix', renameValue: 'report_' });
test('CMD rinomina', cmd.includes('ren') && cmd.includes('report_'));
test('CMD @echo off', cmd.includes('@echo off'));

cmd = CG.generate('cmd', 'rename', '*.txt', [], { renameOp: 'date' });
test('CMD data', cmd.includes('%date'));

console.log('\n=== Generatore PowerShell ===');
cmd = CG.generate('ps', 'rename', '*.txt', [], { renameOp: 'prefix', renameValue: 'report_' });
test('PS rinomina', cmd.includes('Rename-Item') && cmd.includes('report_'));

cmd = CG.generate('ps', 'copy', '*.jpg', [{ type: 'size', operator: 'gt', value: 1, unit: 'MB' }], { destination: 'backup' });
test('PS condizioni size', cmd.includes('Where-Object') && cmd.includes('Length'));

const conds2 = [
  { type: 'size', operator: 'gt', value: 1, unit: 'MB' },
  { type: 'name', operator: 'contains', value: 'foto' }
];
cmd = CG.generate('ps', 'move', '*.jpg', conds2, { destination: 'foto_grandi' });
test('PS condizioni multiple', cmd.includes('Length') && cmd.includes('foto'));

console.log(`\n=== Riepilogo: ${passed} passati, ${failed} falliti ===`);
process.exit(failed > 0 ? 1 : 0);
