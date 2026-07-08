/* ============================================================
   Costruttore Visivo di Comandi — App Logic
   Parser italiano + Generatore comandi + UI controller
   ============================================================ */

// ── Parser italiano ──────────────────────────────────────────
const ItalianParser = {
  /**
   * Analizza una descrizione in italiano e restituisce
   * azione, pattern, condizioni e parametri operativi.
   */
  parse(text) {
    if (!text || !text.trim()) return null;
    const t = text.toLowerCase().trim();

    const result = {
      action: null,
      filePattern: null,
      conditions: [],
      renameOp: null,
      renameValue: null,
      renameSearch: null,
      renameReplace: null,
      destination: null,
      archiveName: null,
    };

    // ── Azione ──
    if (/\brinomina(re)?\b/i.test(t)) result.action = 'rename';
    else if (/\bcopia(re)?\b/i.test(t)) result.action = 'copy';
    else if (/\bsposta(re)?\b|\bmuovi|spostare\b/i.test(t)) result.action = 'move';
    else if (/\belimina(re)?\b|\bcancella(re)?\b/i.test(t)) result.action = 'delete';
    else if (/\bcomprimi(re)?\b|\bzippa(re)?\b|\barchivia(re)?\b/i.test(t)) result.action = 'compress';

    // ── Pattern file (estensione) ──
    const extMatch = t.match(/\.[a-zA-Z0-9]+/g);
    if (extMatch) {
      // Prendi l'estensione più probabile (non in un URL o path)
      const ext = extMatch.find(e => !/^\.(com|it|org|net|io)$/i.test(e));
      if (ext) result.filePattern = '*' + extMatch[extMatch.length - 1];
    }

    // ── Operazione di rinomina ──
    // "aggiungendo X all'inizio" → prefix
    const prefixMatch = t.match(/aggiung(?:endo|i|ere)\s+(.+?)\s+all['']inizio/i);
    if (prefixMatch) {
      result.renameOp = 'prefix';
      result.renameValue = prefixMatch[1].replace(/["']/g, '').trim();
    }
    // "aggiungendo X alla fine" → suffix
    const suffixMatch = t.match(/aggiung(?:endo|i|ere)\s+(.+?)\s+alla\s+fine/i);
    if (suffixMatch) {
      result.renameOp = 'suffix';
      result.renameValue = suffixMatch[1].replace(/["']/g, '').trim();
    }
    // "sostituisci/sostituendo X con Y" → replace
    const replaceMatch = t.match(/sostitu(?:isci|endo|ire)\s+(.+?)\s+con\s+(.+?)(?:\s|$)/i);
    if (replaceMatch) {
      result.renameOp = 'replace';
      result.renameSearch = replaceMatch[1].replace(/["']/g, '').trim();
      result.renameReplace = replaceMatch[2].replace(/["']/g, '').trim();
    }
    // "con/data di oggi" → date
    if (/\bdata\s+di\s+oggi\b/i.test(t) || /\boggi\b.*\bdata\b/i.test(t)) {
      result.renameOp = 'date';
    }
    // "rinomina X in Y" → replace
    const renameInMatch = t.match(/rinomina\s+(.+?)\s+in\s+(.+?)(?:$|\s|\.)/i);
    if (renameInMatch && !result.renameOp) {
      result.renameOp = 'replace';
      result.renameSearch = renameInMatch[1].trim();
      result.renameReplace = renameInMatch[2].trim();
    }

    // ── Destinazione (per copy/move) ──
    const destMatch = t.match(/(?:nella|nello|in|dentro)\s+(?:la\s+)?(?:cartella|directory|folder)?\s*['"]?([a-zA-Z0-9_\-.\/\\]+)['"]?/i);
    if (destMatch) {
      result.destination = destMatch[1].replace(/["']/g, '').trim();
    }

    // ── Archivio (per compress) ──
    const archiveMatch = t.match(/(?:in|come|chiamato|nominato)\s+(?:il\s+file\s+)?['"]?([a-zA-Z0-9_\-.\/\\]+\.(?:zip|tar\.gz|tgz|7z|rar))['"]?/i);
    if (archiveMatch) {
      result.archiveName = archiveMatch[1].replace(/["']/g, '').trim();
    }

    // ── Condizioni ──
    // "più grandi di X MB/KB/GB" → size greater
    const sizeGt = t.match(/(?:più\s+grand(?:i|e)\s+di|maggior(?:i|e)\s+di|superior(?:i|e)\s+a)\s+(\d+(?:[.,]\d+)?)\s*(MB|KB|GB|mb|kb|gb)/i);
    if (sizeGt) {
      result.conditions.push({
        type: 'size',
        operator: 'gt',
        value: parseFloat(sizeGt[1].replace(',', '.')),
        unit: sizeGt[2].toUpperCase()
      });
    }
    // "più piccoli di X MB/KB/GB" → size less
    const sizeLt = t.match(/(?:più\s+piccol(?:i|o)\s+di|minor(?:i|e)\s+di|inferior(?:i|e)\s+a)\s+(\d+(?:[.,]\d+)?)\s*(MB|KB|GB|mb|kb|gb)/i);
    if (sizeLt) {
      result.conditions.push({
        type: 'size',
        operator: 'lt',
        value: parseFloat(sizeLt[1].replace(',', '.')),
        unit: sizeLt[2].toUpperCase()
      });
    }

    // "modificati dopo il X" → date newer
    const dateNewer = t.match(/(?:modificat(?:i|o|e)\s+(?:dopo|dal)|più\s+recent(?:i|e)\s+di)\s+(\d+)\s*(giorni|ore|minuti|settimane|mesi)/i);
    if (dateNewer) {
      result.conditions.push({
        type: 'date',
        operator: 'newer',
        value: parseInt(dateNewer[1]),
        unit: dateNewer[2]
      });
    }
    // "modificati prima del X" / "più vecchi di X" → date older
    const dateOlder = t.match(/(?:modificat(?:i|o|e)\s+(?:prima|più)\s+(?:del|di)|più\s+vecch(?:i|io)\s+di)\s+(\d+)\s*(giorni|ore|minuti|settimane|mesi)/i);
    if (dateOlder) {
      result.conditions.push({
        type: 'date',
        operator: 'older',
        value: parseInt(dateOlder[1]),
        unit: dateOlder[2]
      });
    }

    // "che contengono X" / "con X nel nome" → name contains
    const nameMatch = t.match(/(?:che\s+conteng(?:ono|a)|con\s+(.+?)\s+nel\s+nome)/i);
    if (nameMatch) {
      result.conditions.push({
        type: 'name',
        operator: 'contains',
        value: nameMatch[1] ? nameMatch[1].replace(/["']/g, '').trim() : ''
      });
    }
    // simpler: "con nome X"
    const nameSimple = t.match(/con\s+(?:il\s+)?nome\s+['"]?([a-zA-Z0-9_\- ]+?)['"]?(?:\s|$)/i);
    if (nameSimple && !result.conditions.some(c => c.type === 'name')) {
      result.conditions.push({
        type: 'name',
        operator: 'contains',
        value: nameSimple[1].trim()
      });
    }

    return result;
  }
};

// ── Generatore comandi ────────────────────────────────────────
const CommandGenerator = {
  /**
   * Converte una dimensione in byte per il confronto.
   */
  sizeToBytes(value, unit) {
    const multipliers = { KB: 1024, MB: 1048576, GB: 1073741824 };
    return Math.round(value * (multipliers[unit] || 1));
  },

  /**
   * Converte un intervallo di tempo in giorni (per find -mtime).
   */
  timeToDays(value, unit) {
    const multipliers = { minuti: 1/1440, ore: 1/24, giorni: 1, settimane: 7, mesi: 30 };
    return Math.round(value * (multipliers[unit] || 1));
  },

  /**
   * Costruisce il comando completo in base a piattaforma, azione, condizioni e parametri.
   */
  generate(platform, action, filePattern, conditions, params) {
    switch (platform) {
      case 'bash': return this.generateBash(action, filePattern, conditions, params);
      case 'cmd': return this.generateCmd(action, filePattern, conditions, params);
      case 'ps': return this.generatePowerShell(action, filePattern, conditions, params);
      default: return '# Piattaforma non supportata';
    }
  },

  /**
   * Bash (Linux/macOS) — usa find, for loop, condizioni native.
   */
  generateBash(action, filePattern, conditions, params) {
    const lines = ['#!/bin/bash'];
    const pattern = filePattern || '*.*';
    const conditionsFilter = this.buildBashConditions(conditions);
    const dest = params.destination || 'destinazione';
    const archiveName = params.archiveName || 'archivio.zip';

    switch (action) {
      case 'rename': {
        const op = params.renameOp || 'prefix';
        lines.push('');
        lines.push('# Rinomina file: ' + pattern);

        if (conditionsFilter.findArgs) {
          if (op === 'prefix') {
            const val = params.renameValue || 'prefisso_';
            lines.push(`find . -maxdepth 1 -name "${pattern}" ${conditionsFilter.findArgs} -exec bash -c 'for f; do mv "$f" "$(dirname "$f")/${val}$(basename "$f")"; done' _ {} +`);
          } else if (op === 'suffix') {
            const val = params.renameValue || '_suffisso';
            lines.push(`find . -maxdepth 1 -name "${pattern}" ${conditionsFilter.findArgs} -exec bash -c 'for f; do name="$(basename "$f")"; ext="\${name##*.}"; base="\${name%.*}"; if [ "$base" = "$name" ]; then mv "$f" "$(dirname "$f")/\${name}${val}"; else mv "$f" "$(dirname "$f")/\${base}${val}.$ext"; fi; done' _ {} +`);
          } else if (op === 'replace') {
            const search = params.renameSearch || 'vecchio';
            const replace = params.renameReplace || 'nuovo';
            lines.push(`find . -maxdepth 1 -name "${pattern}" ${conditionsFilter.findArgs} -exec bash -c 'for f; do mv "$f" "$(dirname "$f")/$(basename "$f" | sed "s/${search}/${replace}/g")"; done' _ {} +`);
          } else if (op === 'date') {
            lines.push(`find . -maxdepth 1 -name "${pattern}" ${conditionsFilter.findArgs} -exec bash -c 'for f; do mv "$f" "$(dirname "$f")/$(date +%Y%m%d)_$(basename "$f")"; done' _ {} +`);
          }
        } else {
          if (op === 'prefix') {
            const val = params.renameValue || 'prefisso_';
            lines.push(`for f in ${pattern}; do`);
            lines.push(`  [ -f "$f" ] || continue`);
            lines.push(`  mv "$f" "${val}$f"`);
            lines.push(`done`);
          } else if (op === 'suffix') {
            const val = params.renameValue || '_suffisso';
            lines.push(`for f in ${pattern}; do`);
            lines.push(`  [ -f "$f" ] || continue`);
            lines.push(`  base="\${f%.*}"`);
            lines.push(`  ext="\${f##*.}"`);
            lines.push(`  if [ "$base" = "$f" ]; then mv "$f" "$f${val}"; else mv "$f" "$base${val}.$ext"; fi`);
            lines.push(`done`);
          } else if (op === 'replace') {
            const search = params.renameSearch || 'vecchio';
            const replace = params.renameReplace || 'nuovo';
            lines.push(`for f in ${pattern}; do`);
            lines.push(`  [ -f "$f" ] || continue`);
            lines.push(`  newname=$(echo "$f" | sed "s/${search}/${replace}/g")`);
            lines.push(`  mv "$f" "$newname"`);
            lines.push(`done`);
          } else if (op === 'date') {
            lines.push(`for f in ${pattern}; do`);
            lines.push(`  [ -f "$f" ] || continue`);
            lines.push(`  mv "$f" "$(date +%Y%m%d)_$f"`);
            lines.push(`done`);
          }
        }
        break;
      }

      case 'copy': {
        lines.push('');
        lines.push('# Copia file: ' + pattern + ' → ' + dest);
        lines.push(`mkdir -p "${dest}"`);
        if (conditionsFilter.findArgs) {
          lines.push(`find . -maxdepth 1 -name "${pattern}" ${conditionsFilter.findArgs} -exec cp {} "${dest}/" \\;`);
        } else {
          lines.push(`cp ${pattern} "${dest}/" 2>/dev/null || true`);
        }
        break;
      }

      case 'move': {
        lines.push('');
        lines.push('# Sposta file: ' + pattern + ' → ' + dest);
        lines.push(`mkdir -p "${dest}"`);
        if (conditionsFilter.findArgs) {
          lines.push(`find . -maxdepth 1 -name "${pattern}" ${conditionsFilter.findArgs} -exec mv {} "${dest}/" \\;`);
        } else {
          lines.push(`mv ${pattern} "${dest}/" 2>/dev/null || true`);
        }
        break;
      }

      case 'delete': {
        lines.push('');
        lines.push('# ATTENZIONE: Elimina file: ' + pattern);
        lines.push('# Verifica i file prima di eseguire!');
        if (conditionsFilter.findArgs) {
          lines.push(`# Anteprima (rimuovi 'echo' per eseguire davvero):`);
          lines.push(`find . -maxdepth 1 -name "${pattern}" ${conditionsFilter.findArgs} -exec echo "Elimino: {}" \\;`);
          lines.push(`# find . -maxdepth 1 -name "${pattern}" ${conditionsFilter.findArgs} -delete`);
        } else {
          lines.push(`# Anteprima:`);
          lines.push(`ls ${pattern} 2>/dev/null`);
          lines.push(`# Per eliminare davvero, decommenta la riga sotto:`);
          lines.push(`# rm ${pattern}`);
        }
        break;
      }

      case 'compress': {
        lines.push('');
        lines.push('# Comprimi file: ' + pattern + ' → ' + archiveName);
        if (conditionsFilter.findArgs) {
          lines.push(`find . -maxdepth 1 -name "${pattern}" ${conditionsFilter.findArgs} -print0 | xargs -0 zip "${archiveName}"`);
        } else {
          if (archiveName.endsWith('.tar.gz') || archiveName.endsWith('.tgz')) {
            lines.push(`tar czf "${archiveName}" ${pattern}`);
          } else {
            lines.push(`zip "${archiveName}" ${pattern}`);
          }
        }
        break;
      }

      default:
        lines.push('# Seleziona un\'azione');
    }

    return lines.join('\n');
  },

  /**
   * Costruisce i filtri find per Bash.
   */
  buildBashConditions(conditions) {
    if (!conditions || conditions.length === 0) {
      return { findCmd: null, findArgs: '' };
    }

    let hasComplex = false;
    const args = [];

    conditions.forEach(c => {
      if (c.type === 'size' && c.operator === 'gt') {
        const bytes = this.sizeToBytes(c.value, c.unit);
        args.push(`-size +${bytes}c`);
        hasComplex = true;
      } else if (c.type === 'size' && c.operator === 'lt') {
        const bytes = this.sizeToBytes(c.value, c.unit);
        args.push(`-size -${bytes}c`);
        hasComplex = true;
      } else if (c.type === 'date' && c.operator === 'older') {
        const days = this.timeToDays(c.value, c.unitTime || c.unit);
        args.push(`-mtime +${days}`);
        hasComplex = true;
      } else if (c.type === 'date' && c.operator === 'newer') {
        const days = this.timeToDays(c.value, c.unitTime || c.unit);
        args.push(`-mtime -${days}`);
        hasComplex = true;
      } else if (c.type === 'name' && c.operator === 'contains') {
        args.push(`-name "*${c.value}*"`);
        hasComplex = true;
      } else if (c.type === 'name' && c.operator === 'equals') {
        args.push(`-name "${c.value}"`);
        hasComplex = true;
      } else if (c.type === 'name' && c.operator === 'starts') {
        args.push(`-name "${c.value}*"`);
        hasComplex = true;
      } else if (c.type === 'name' && c.operator === 'ends') {
        args.push(`-name "*${c.value}"`);
        hasComplex = true;
      } else if (c.type === 'ext' && c.operator === 'is') {
        args.push(`-name "*.${c.value.replace(/^\./, '')}"`);
        hasComplex = true;
      } else if (c.type === 'ext' && c.operator === 'not') {
        args.push(`! -name "*.${c.value.replace(/^\./, '')}"`);
        hasComplex = true;
      }
    });

    if (!hasComplex) return { findCmd: null, findArgs: '' };

    return { findCmd: null, findArgs: args.join(' ') };
  },

  /**
   * Windows CMD — batch scripting.
   */
  generateCmd(action, filePattern, conditions, params) {
    const lines = ['@echo off', 'REM Comando generato dal Costruttore Visivo di Comandi', ''];
    const pattern = filePattern || '*.*';
    const dest = params.destination || 'destinazione';
    const archiveName = params.archiveName || 'archivio.zip';
    const hasConditions = conditions && conditions.length > 0;

    if (hasConditions) {
      lines.push('REM ATTENZIONE: CMD ha supporto limitato per le condizioni.');
      lines.push('REM Per condizioni complesse usa PowerShell.');
      lines.push('REM Le condizioni vengono ignorate in questa modalità.');
      lines.push('');
    }

    switch (action) {
      case 'rename': {
        const op = params.renameOp || 'prefix';
        lines.push('REM Rinomina file: ' + pattern);
        if (op === 'prefix') {
          const val = params.renameValue || 'prefisso_';
          lines.push(`for %%f in (${pattern}) do ren "%%f" "${val}%%f"`);
        } else if (op === 'suffix') {
          const val = params.renameValue || '_suffisso';
          lines.push(`for %%f in (${pattern}) do ren "%%f" "%%~nf${val}%%~xf"`);
        } else if (op === 'replace') {
          const search = params.renameSearch || 'vecchio';
          const replace = params.renameReplace || 'nuovo';
          lines.push('setlocal enabledelayedexpansion');
          lines.push(`for %%f in (${pattern}) do (`);
          lines.push('  set "name=%%~nxf"');
          lines.push(`  set "newname=!name:${search}=${replace}!"`);
          lines.push('  ren "%%f" "!newname!"');
          lines.push(')');
        } else if (op === 'date') {
          lines.push('REM Aggiunge la data nel formato AAAAMMGG come prefisso');
          lines.push(`for %%f in (${pattern}) do ren "%%f" "%date:~-4,4%%date:~-7,2%%date:~-10,2%_%%f"`);
        }
        break;
      }

      case 'copy': {
        lines.push('REM Copia file: ' + pattern + ' → ' + dest);
        lines.push(`if not exist "${dest}" mkdir "${dest}"`);
        lines.push(`copy ${pattern} "${dest}\\" >nul 2>&1`);
        break;
      }

      case 'move': {
        lines.push('REM Sposta file: ' + pattern + ' → ' + dest);
        lines.push(`if not exist "${dest}" mkdir "${dest}"`);
        lines.push(`move ${pattern} "${dest}\\" >nul 2>&1`);
        break;
      }

      case 'delete': {
        lines.push('REM ATTENZIONE: Elimina file: ' + pattern);
        lines.push('REM Verifica i file prima di eseguire!');
        lines.push(`echo File che verranno eliminati:`);
        lines.push(`dir /b ${pattern} 2>nul`);
        lines.push(`REM Per eliminare davvero, decommenta la riga sotto:`);
        lines.push(`REM del /q ${pattern}`);
        break;
      }

      case 'compress': {
        lines.push('REM Comprimi file: ' + pattern + ' → ' + archiveName);
        lines.push('REM CMD non supporta la compressione nativa.');
        lines.push('REM Usa PowerShell: Compress-Archive -Path ' + pattern + ' -DestinationPath ' + archiveName);
        lines.push('REM Oppure installa 7-Zip e usa:');
        lines.push(`REM "C:\\Program Files\\7-Zip\\7z.exe" a "${archiveName}" ${pattern}`);
        break;
      }

      default:
        lines.push('REM Seleziona un\'azione');
    }

    return lines.join('\n');
  },

  /**
   * Windows PowerShell — più potente, supporta condizioni native.
   */
  generatePowerShell(action, filePattern, conditions, params) {
    const lines = [
      '# Comando generato dal Costruttore Visivo di Comandi',
      '# Esegui in PowerShell: ./script.ps1',
      '# Se ricevi un errore di esecuzione, prima esegui: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass',
      ''
    ];
    const pattern = filePattern || '*.*';
    const dest = params.destination || 'destinazione';
    const archiveName = params.archiveName || 'archivio.zip';

    // Build file filter pipeline
    let filterStr = `$files = Get-ChildItem -Path ".\\" -Filter "${pattern}" -File`;
    const conditionsFilter = this.buildPowerShellConditions(conditions);
    if (conditionsFilter) {
      filterStr += ' | Where-Object { ' + conditionsFilter + ' }';
    }
    lines.push(filterStr);
    lines.push('');

    switch (action) {
      case 'rename': {
        const op = params.renameOp || 'prefix';
        lines.push('# Rinomina file');
        lines.push('$files | ForEach-Object {');
        if (op === 'prefix') {
          const val = params.renameValue || 'prefisso_';
          lines.push(`  Rename-Item -Path $_.FullName -NewName ("${val}" + $_.Name)`);
        } else if (op === 'suffix') {
          const val = params.renameValue || '_suffisso';
          lines.push(`  $base = [System.IO.Path]::GetFileNameWithoutExtension($_.Name)`);
          lines.push(`  $ext = $_.Extension`);
          lines.push(`  Rename-Item -Path $_.FullName -NewName ($base + "${val}" + $ext)`);
        } else if (op === 'replace') {
          const search = params.renameSearch || 'vecchio';
          const replace = params.renameReplace || 'nuovo';
          lines.push(`  $newName = $_.Name -replace "${search}", "${replace}"`);
          lines.push('  Rename-Item -Path $_.FullName -NewName $newName');
        } else if (op === 'date') {
          lines.push('  $datePrefix = (Get-Date).ToString("yyyyMMdd")');
          lines.push('  Rename-Item -Path $_.FullName -NewName ($datePrefix + "_" + $_.Name)');
        }
        lines.push('}');
        break;
      }

      case 'copy': {
        lines.push('# Copia file → ' + dest);
        lines.push(`$dest = "${dest}"`);
        lines.push('if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest | Out-Null }');
        lines.push('$files | Copy-Item -Destination $dest');
        break;
      }

      case 'move': {
        lines.push('# Sposta file → ' + dest);
        lines.push(`$dest = "${dest}"`);
        lines.push('if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest | Out-Null }');
        lines.push('$files | Move-Item -Destination $dest');
        break;
      }

      case 'delete': {
        lines.push('# ATTENZIONE: Elimina file');
        lines.push('Write-Host "File che verranno eliminati:" -ForegroundColor Yellow');
        lines.push('$files | ForEach-Object { Write-Host "  $_" }');
        lines.push('# Rimuovi il commento per eliminare davvero:');
        lines.push('# $files | Remove-Item -Force');
        break;
      }

      case 'compress': {
        lines.push('# Comprimi file → ' + archiveName);
        lines.push(`Compress-Archive -Path $files.FullName -DestinationPath "${archiveName}" -Force`);
        break;
      }

      default:
        lines.push('# Seleziona un\'azione');
    }

    return lines.join('\n');
  },

  /**
   * Costruisce il filtro Where-Object per PowerShell.
   */
  buildPowerShellConditions(conditions) {
    if (!conditions || conditions.length === 0) return null;

    const parts = [];
    conditions.forEach(c => {
      if (c.type === 'size' && c.operator === 'gt') {
        const bytes = this.sizeToBytes(c.value, c.unit);
        parts.push(`$_.Length -gt ${bytes}`);
      } else if (c.type === 'size' && c.operator === 'lt') {
        const bytes = this.sizeToBytes(c.value, c.unit);
        parts.push(`$_.Length -lt ${bytes}`);
      } else if (c.type === 'date' && c.operator === 'older') {
        const days = this.timeToDays(c.value, c.unitTime || c.unit);
        parts.push(`$_.LastWriteTime -lt (Get-Date).AddDays(-${days})`);
      } else if (c.type === 'date' && c.operator === 'newer') {
        const days = this.timeToDays(c.value, c.unitTime || c.unit);
        parts.push(`$_.LastWriteTime -gt (Get-Date).AddDays(-${days})`);
      } else if (c.type === 'name' && c.operator === 'contains') {
        parts.push(`$_.Name -like "*${c.value}*"`);
      } else if (c.type === 'name' && c.operator === 'equals') {
        parts.push(`$_.Name -eq "${c.value}"`);
      } else if (c.type === 'name' && c.operator === 'starts') {
        parts.push(`$_.Name -like "${c.value}*"`);
      } else if (c.type === 'name' && c.operator === 'ends') {
        parts.push(`$_.Name -like "*${c.value}"`);
      } else if (c.type === 'ext' && c.operator === 'is') {
        parts.push(`$_.Extension -eq ".${c.value.replace(/^\./, '')}"`);
      } else if (c.type === 'ext' && c.operator === 'not') {
        parts.push(`$_.Extension -ne ".${c.value.replace(/^\./, '')}"`);
      }
    });

    return parts.length > 0 ? parts.join(' -and ') : null;
  }
};

// ── Syntax Highlighter ───────────────────────────────────────
const SyntaxHighlighter = {
  highlight(code, platform) {
    // Escape HTML
    let html = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Platform-specific highlighting
    if (platform === 'bash') {
      html = this.highlightBash(html);
    } else if (platform === 'cmd') {
      html = this.highlightCmd(html);
    } else if (platform === 'ps') {
      html = this.highlightPowerShell(html);
    }

    return html;
  },

  highlightBash(html) {
    // Comments
    html = html.replace(/(^|\n)(#[^\n]*)/g, '$1<span class="token-comment">$2</span>');
    // Keywords: for, do, done, if, then, else, fi, in, exec, find, cp, mv, rm, zip, tar, mkdir
    html = html.replace(/\b(for|do|done|if|then|else|fi|in|exec|find|cp|mv|rm|zip|tar|mkdir|echo|ls|xargs)\b/g,
      '<span class="token-keyword">$1</span>');
    // Commands (green): mv, cp, rm, zip (when not already matched)
    html = html.replace(/&lt;span class="token-keyword"&gt;(mv|cp|rm|zip|tar|mkdir)&lt;\/span&gt;/g,
      '<span class="token-cmd">$1</span>');
    // Flags
    html = html.replace(/(\s)(-[a-zA-Z0-9]+)/g, '$1<span class="token-flag">$2</span>');
    // Strings
    html = html.replace(/(["'][^"']*["'])/g, '<span class="token-string">$1</span>');
    // Variables
    html = html.replace(/(\$\{?[a-zA-Z_][a-zA-Z0-9_]*\}?)/g, '<span class="token-var">$1</span>');
    // Shebang
    html = html.replace(/(#!\/bin\/[a-z]+)/g, '<span class="token-comment">$1</span>');
    // Paths
    html = html.replace(/([.\/][a-zA-Z0-9_\-.\/]+)/g, '<span class="token-path">$1</span>');
    // Danger words
    html = html.replace(/\b(rm\s+-rf|delete|elimin)\b/gi, '<span class="token-danger">$1</span>');

    return html;
  },

  highlightCmd(html) {
    // Comments
    html = html.replace(/(^|\n)(REM[^\n]*|::[^\n]*)/gi, '$1<span class="token-comment">$2</span>');
    // Keywords
    html = html.replace(/\b(for|do|in|if|exist|not|echo|set|setlocal|enabledelayedexpansion|endlocal)\b/gi,
      '<span class="token-keyword">$1</span>');
    // Commands
    html = html.replace(/\b(ren|rename|copy|move|del|mkdir|dir)\b/gi,
      '<span class="token-cmd">$1</span>');
    // Flags
    html = html.replace(/(\s)(\/[a-zA-Z]+)/g, '$1<span class="token-flag">$2</span>');
    // Variables
    html = html.replace(/(%[a-zA-Z_][a-zA-Z0-9_:~,\-]*%?)/g, '<span class="token-var">$1</span>');
    html = html.replace(/(%%[a-zA-Z~])/g, '<span class="token-var">$1</span>');
    // Strings
    html = html.replace(/(["][^"]*["])/g, '<span class="token-string">$1</span>');
    // Danger
    html = html.replace(/\b(del\s+\/q|delete)\b/gi, '<span class="token-danger">$1</span>');

    return html;
  },

  highlightPowerShell(html) {
    // Comments
    html = html.replace(/(^|\n)(#[^\n]*)/g, '$1<span class="token-comment">$2</span>');
    // Keywords
    html = html.replace(/\b(Get-ChildItem|Where-Object|ForEach-Object|Rename-Item|Copy-Item|Move-Item|Remove-Item|Compress-Archive|New-Item|Write-Host|Test-Path|Out-Null)\b/g,
      '<span class="token-cmd">$1</span>');
    html = html.replace(/\b(if|else|foreach|in|param|begin|process|end|return|throw)\b/g,
      '<span class="token-keyword">$2</span>');
    // Flags
    html = html.replace(/(\s)(-[a-zA-Z]+)/g, '$1<span class="token-flag">$2</span>');
    // Variables
    html = html.replace(/(\$[a-zA-Z_][a-zA-Z0-9_]*)/g, '<span class="token-var">$1</span>');
    // Properties/methods
    html = html.replace(/(\.(Name|FullName|Extension|Length|LastWriteTime|BaseName))/g,
      '<span class="token-var">$1</span>');
    // Strings
    html = html.replace(/(["][^"]*["])/g, '<span class="token-string">$1</span>');
    // Paths
    html = html.replace(/([.\/\\][a-zA-Z0-9_\-.\/\\]+)/g, '<span class="token-path">$1</span>');
    // Danger
    html = html.replace(/\b(Remove-Item)\b/g, '<span class="token-danger">$1</span>');

    return html;
  }
};

// ── UI Controller ────────────────────────────────────────────
const UIController = {
  conditions: [],

  init() {
    this.bindDescription();
    this.bindActionSwitch();
    this.bindRenameStrategy();
    this.bindConditions();
    this.bindGenerate();
    this.bindCopy();
    this.bindDownload();
    this.bindChips();
    this.bindPlatformSwitch();
  },

  // ── Analisi descrizione ──
  bindDescription() {
    const btn = document.getElementById('btn-analyze');
    const textarea = document.getElementById('desc-input');

    btn.addEventListener('click', () => this.analyzeDescription());
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.analyzeDescription();
      }
    });
  },

  analyzeDescription() {
    const text = document.getElementById('desc-input').value.trim();
    if (!text) return;

    const parsed = ItalianParser.parse(text);
    if (!parsed || !parsed.action) {
      this.showToast('⚠️ Non ho capito l\'azione. Prova con "rinomina", "copia", "sposta", "elimina" o "comprimi".');
      return;
    }

    // Set action
    const actionRadio = document.querySelector(`input[name="action"][value="${parsed.action}"]`);
    if (actionRadio) {
      actionRadio.checked = true;
      this.switchActionPanel(parsed.action);
    }

    // Set file pattern
    if (parsed.filePattern) {
      const patternInput = document.getElementById(`${parsed.action}-pattern`);
      if (patternInput) patternInput.value = parsed.filePattern;
    }

    // Set rename params
    if (parsed.action === 'rename') {
      if (parsed.renameOp) {
        const stratRadio = document.querySelector(`input[name="rename-strategy"][value="${parsed.renameOp}"]`);
        if (stratRadio) {
          stratRadio.checked = true;
          this.switchRenameStrategy(parsed.renameOp);
        }
      }
      if (parsed.renameValue) {
        document.getElementById('rename-value').value = parsed.renameValue;
      }
      if (parsed.renameSearch) {
        document.getElementById('rename-search').value = parsed.renameSearch;
      }
      if (parsed.renameReplace) {
        document.getElementById('rename-replace').value = parsed.renameReplace;
      }
    }

    // Set destination
    if (parsed.destination) {
      if (parsed.action === 'copy') document.getElementById('copy-dest').value = parsed.destination;
      if (parsed.action === 'move') document.getElementById('move-dest').value = parsed.destination;
    }

    // Set archive name
    if (parsed.archiveName) {
      document.getElementById('compress-archive').value = parsed.archiveName;
    }

    // Set conditions
    if (parsed.conditions.length > 0) {
      this.conditions = parsed.conditions.map(c => ({ ...c, id: Date.now() + Math.random() }));
      this.renderConditions();
      document.getElementById('cond-empty').classList.add('hidden');
    }

    this.showToast('✅ Descrizione analizzata. Verifica i parametri e clicca "Genera comando".');
  },

  // ── Azione switch ──
  bindActionSwitch() {
    const radios = document.querySelectorAll('input[name="action"]');
    radios.forEach(r => {
      r.addEventListener('change', () => this.switchActionPanel(r.value));
    });
  },

  switchActionPanel(action) {
    // Hide all panels
    document.querySelectorAll('.params-panel').forEach(p => p.classList.add('hidden'));
    // Show active
    const panel = document.getElementById(`params-${action}`);
    if (panel) panel.classList.remove('hidden');
    // Reset download ext
    this.updatePlatformBadge();
  },

  // ── Rename strategy ──
  bindRenameStrategy() {
    const radios = document.querySelectorAll('input[name="rename-strategy"]');
    radios.forEach(r => {
      r.addEventListener('change', () => this.switchRenameStrategy(r.value));
    });
  },

  switchRenameStrategy(strategy) {
    const prefixRow = document.getElementById('rename-prefix-row');
    const replaceRows = document.getElementById('rename-replace-rows');
    const valueInput = document.getElementById('rename-value');

    prefixRow.classList.add('hidden');
    replaceRows.classList.add('hidden');

    switch (strategy) {
      case 'prefix':
        prefixRow.classList.remove('hidden');
        valueInput.placeholder = 'es. report_';
        break;
      case 'suffix':
        prefixRow.classList.remove('hidden');
        valueInput.placeholder = 'es. _backup';
        break;
      case 'replace':
        replaceRows.classList.remove('hidden');
        break;
      case 'date':
        // No extra params needed
        break;
    }
  },

  // ── Condizioni ──
  bindConditions() {
    document.getElementById('btn-add-condition').addEventListener('click', () => this.addCondition());
  },

  addCondition(type = 'name', operator = 'contains', value = '') {
    const cond = {
      id: Date.now(),
      type: type,
      operator: operator,
      value: value,
      // extra fields
      unit: 'MB',
      unitTime: 'giorni'
    };
    this.conditions.push(cond);
    this.renderConditions();
    document.getElementById('cond-empty').classList.add('hidden');
  },

  removeCondition(id) {
    this.conditions = this.conditions.filter(c => c.id !== id);
    this.renderConditions();
    if (this.conditions.length === 0) {
      document.getElementById('cond-empty').classList.remove('hidden');
    }
  },

  updateCondition(id, field, value) {
    const cond = this.conditions.find(c => c.id === id);
    if (cond) cond[field] = value;
  },

  renderConditions() {
    const container = document.getElementById('conditions-container');
    container.innerHTML = '';

    this.conditions.forEach(cond => {
      const card = document.createElement('div');
      card.className = 'condition-card';
      card.setAttribute('role', 'listitem');

      const typeOptions = [
        { value: 'name', label: 'Nome contiene' },
        { value: 'size', label: 'Dimensione' },
        { value: 'date', label: 'Data modifica' },
        { value: 'ext', label: 'Estensione' },
      ];

      const operatorOptions = {
        name: [
          { value: 'contains', label: 'contiene' },
          { value: 'equals', label: 'uguale a' },
          { value: 'starts', label: 'inizia con' },
          { value: 'ends', label: 'finisce con' },
        ],
        size: [
          { value: 'gt', label: 'maggiore di' },
          { value: 'lt', label: 'minore di' },
        ],
        date: [
          { value: 'older', label: 'più vecchio di' },
          { value: 'newer', label: 'più recente di' },
        ],
        ext: [
          { value: 'is', label: 'è' },
          { value: 'not', label: 'non è' },
        ],
      };

      const sizeUnits = ['KB', 'MB', 'GB'];
      const timeUnits = ['minuti', 'ore', 'giorni', 'settimane', 'mesi'];

      // Type selector
      const typeHtml = `
        <div class="condition-field">
          <label for="cond-type-${cond.id}">Tipo</label>
          <select id="cond-type-${cond.id}" data-cond-id="${cond.id}" data-field="type">
            ${typeOptions.map(o => `<option value="${o.value}" ${cond.type === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
          </select>
        </div>`;

      // Operator selector
      const ops = operatorOptions[cond.type] || operatorOptions['name'];
      const opHtml = `
        <div class="condition-field">
          <label for="cond-op-${cond.id}">Operatore</label>
          <select id="cond-op-${cond.id}" data-cond-id="${cond.id}" data-field="operator">
            ${ops.map(o => `<option value="${o.value}" ${cond.operator === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
          </select>
        </div>`;

      // Value input
      let valueHtml = '';
      if (cond.type === 'size') {
        valueHtml = `
          <div class="condition-field">
            <label for="cond-val-${cond.id}">Valore</label>
            <input type="number" id="cond-val-${cond.id}" value="${cond.value || 1}" min="0" step="0.1" data-cond-id="${cond.id}" data-field="value">
          </div>
          <div class="condition-field">
            <label for="cond-unit-${cond.id}">Unità</label>
            <select id="cond-unit-${cond.id}" data-cond-id="${cond.id}" data-field="unit">
              ${sizeUnits.map(u => `<option value="${u}" ${(cond.unit || 'MB') === u ? 'selected' : ''}>${u}</option>`).join('')}
            </select>
          </div>`;
      } else if (cond.type === 'date') {
        valueHtml = `
          <div class="condition-field">
            <label for="cond-val-${cond.id}">Valore</label>
            <input type="number" id="cond-val-${cond.id}" value="${cond.value || 7}" min="0" data-cond-id="${cond.id}" data-field="value">
          </div>
          <div class="condition-field">
            <label for="cond-unit-${cond.id}">Unità</label>
            <select id="cond-unit-${cond.id}" data-cond-id="${cond.id}" data-field="unitTime">
              ${timeUnits.map(u => `<option value="${u}" ${(cond.unitTime || 'giorni') === u ? 'selected' : ''}>${u}</option>`).join('')}
            </select>
          </div>`;
      } else {
        valueHtml = `
          <div class="condition-field">
            <label for="cond-val-${cond.id}">Valore</label>
            <input type="text" id="cond-val-${cond.id}" value="${cond.value || ''}" placeholder="${cond.type === 'name' ? 'es. report' : 'es. .txt'}" data-cond-id="${cond.id}" data-field="value">
          </div>`;
      }

      card.innerHTML = typeHtml + opHtml + valueHtml + `
        <button type="button" class="btn-remove-cond" data-cond-id="${cond.id}" aria-label="Rimuovi condizione" title="Rimuovi">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>`;

      container.appendChild(card);
    });

    // Bind events on conditions
    container.querySelectorAll('select, input').forEach(el => {
      el.addEventListener('change', (e) => {
        const id = parseInt(el.dataset.condId);
        const field = el.dataset.field;
        this.updateCondition(id, field, el.value);
        // If type changed, re-render to update operator options
        if (field === 'type') this.renderConditions();
      });
    });

    container.querySelectorAll('.btn-remove-cond').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.condId);
        this.removeCondition(id);
      });
    });
  },

  // ── Piattaforma ──
  bindPlatformSwitch() {
    document.getElementById('platform-select').addEventListener('change', () => this.updatePlatformBadge());
  },

  updatePlatformBadge() {
    const platform = document.getElementById('platform-select').value;
    const badge = document.getElementById('platform-badge');
    const downloadExt = document.getElementById('download-ext');
    const names = { bash: 'Bash', cmd: 'CMD', ps: 'PowerShell' };
    const exts = { bash: '.sh', cmd: '.bat', ps: '.ps1' };
    badge.textContent = names[platform] || 'Bash';
    downloadExt.textContent = exts[platform] || '.sh';
  },

  // ── Genera comando ──
  bindGenerate() {
    document.getElementById('btn-generate').addEventListener('click', () => this.generateCommand());
  },

  getCurrentAction() {
    const radio = document.querySelector('input[name="action"]:checked');
    return radio ? radio.value : 'rename';
  },

  getCurrentParams() {
    const action = this.getCurrentAction();
    const params = {
      renameOp: null,
      renameValue: null,
      renameSearch: null,
      renameReplace: null,
      destination: null,
      archiveName: null,
    };

    switch (action) {
      case 'rename': {
        const strat = document.querySelector('input[name="rename-strategy"]:checked');
        params.renameOp = strat ? strat.value : 'prefix';
        params.renameValue = document.getElementById('rename-value').value || null;
        params.renameSearch = document.getElementById('rename-search').value || null;
        params.renameReplace = document.getElementById('rename-replace').value || null;
        break;
      }
      case 'copy':
        params.destination = document.getElementById('copy-dest').value || 'backup';
        break;
      case 'move':
        params.destination = document.getElementById('move-dest').value || 'archivio';
        break;
      case 'delete':
        break;
      case 'compress':
        params.archiveName = document.getElementById('compress-archive').value || 'archivio.zip';
        break;
    }

    return params;
  },

  getFilePattern() {
    const action = this.getCurrentAction();
    const patternInput = document.getElementById(`${action}-pattern`);
    return patternInput ? patternInput.value || '*.*' : '*.*';
  },

  generateCommand() {
    const platform = document.getElementById('platform-select').value;
    const action = this.getCurrentAction();
    const filePattern = this.getFilePattern();
    const params = this.getCurrentParams();

    // Read current conditions from DOM
    this.syncConditionsFromDOM();

    const command = CommandGenerator.generate(platform, action, filePattern, this.conditions, params);

    // Highlight and display
    const highlighted = SyntaxHighlighter.highlight(command, platform);
    document.getElementById('terminal-code').innerHTML = `<code>${highlighted}</code>`;

    // Enable buttons
    document.getElementById('btn-copy').disabled = false;
    document.getElementById('btn-download').disabled = false;

    // Scroll to preview
    document.getElementById('preview-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  syncConditionsFromDOM() {
    const container = document.getElementById('conditions-container');
    if (!container || container.children.length === 0) return;

    // Sync from existing data
    container.querySelectorAll('.condition-card').forEach((card, i) => {
      if (this.conditions[i]) {
        const typeSelect = card.querySelector('[data-field="type"]');
        const opSelect = card.querySelector('[data-field="operator"]');
        const valInput = card.querySelector('[data-field="value"]');
        const unitSelect = card.querySelector('[data-field="unit"]');
        const unitTimeSelect = card.querySelector('[data-field="unitTime"]');

        if (typeSelect) this.conditions[i].type = typeSelect.value;
        if (opSelect) this.conditions[i].operator = opSelect.value;
        if (valInput) this.conditions[i].value = valInput.value;
        if (unitSelect) this.conditions[i].unit = unitSelect.value;
        if (unitTimeSelect) this.conditions[i].unitTime = unitTimeSelect.value;
      }
    });
  },

  // ── Copia appunti ──
  bindCopy() {
    document.getElementById('btn-copy').addEventListener('click', () => this.copyToClipboard());
  },

  copyToClipboard() {
    const codeEl = document.getElementById('terminal-code');
    const text = codeEl.textContent || '';

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.showToast('📋 Comando copiato negli appunti');
      }).catch(() => {
        this.fallbackCopy(text);
      });
    } else {
      this.fallbackCopy(text);
    }
  },

  fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      this.showToast('📋 Comando copiato negli appunti');
    } catch (e) {
      this.showToast('❌ Impossibile copiare. Seleziona e copia manualmente.');
    }
    document.body.removeChild(textarea);
  },

  // ── Download ──
  bindDownload() {
    document.getElementById('btn-download').addEventListener('click', () => this.downloadCommand());
  },

  downloadCommand() {
    const codeEl = document.getElementById('terminal-code');
    const text = codeEl.textContent || '';
    const platform = document.getElementById('platform-select').value;
    const extensions = { bash: 'sh', cmd: 'bat', ps: 'ps1' };
    const mimeTypes = { bash: 'text/x-sh', cmd: 'text/plain', ps: 'text/plain' };
    const ext = extensions[platform] || 'sh';

    const blob = new Blob([text], { type: mimeTypes[platform] || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comando.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.showToast(`💾 File comando.${ext} scaricato`);
  },

  // ── Chip esempi ──
  bindChips() {
    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const example = chip.dataset.example;
        if (example) {
          document.getElementById('desc-input').value = example;
          this.analyzeDescription();
        }
      });
    });
  },

  // ── Toast ──
  showToast(message) {
    const toast = document.getElementById('copy-toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }
};

// ── Avvio ──
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    UIController.init();
  });
}
