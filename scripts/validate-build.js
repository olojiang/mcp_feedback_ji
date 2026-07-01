const fs = require('fs');
const path = require('path');
const vm = require('vm');

const panelPath = path.join(__dirname, '../out/webview/panel.html');

if (!fs.existsSync(panelPath)) {
    console.error('Error: panel.html not found at', panelPath);
    process.exit(1);
}

const html = fs.readFileSync(panelPath, 'utf8');

const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];

if (scriptMatches.length === 0) {
    console.error('Error: No <script> tag found in panel.html');
    process.exit(1);
}

console.log(`Found ${scriptMatches.length} script blocks.`);

scriptMatches.forEach((match, index) => {
    const scriptContent = match[1];
    console.log(`Validating script block ${index + 1}...`);

    // 2. Syntax Check using vm
    try {
        new vm.Script(scriptContent, { filename: `webview-script-${index + 1}.js` });
        console.log(`✅ Script ${index + 1} Passed`);
    } catch (err) {
        console.error(`❌ Syntax Error detected in Script ${index + 1}:`);
        console.error(err.message);
        // Print context
        if (err.stack) {
            const match = err.stack.match(/webview-script-\d+\.js:(\d+)/);
            if (match) {
                const line = parseInt(match[1]);
                const lines = scriptContent.split('\n');
                console.error('Context (Line ' + line + '):');
                for (let i = Math.max(0, line - 3); i < Math.min(lines.length, line + 2); i++) {
                    console.error((i + 1) + ': ' + lines[i]);
                }
            }
        }
        process.exit(1);
    }
});

// 3. Check external panelState.js exists and is valid
const panelStatePath = path.join(__dirname, '../out/webview/panelState.js');
if (!fs.existsSync(panelStatePath)) {
    console.error('Error: panelState.js not found at', panelStatePath);
    process.exit(1);
}
try {
    const psCode = fs.readFileSync(panelStatePath, 'utf8');
    new vm.Script(psCode, { filename: 'panelState.js' });
    console.log('Validated external panelState.js');
} catch (err) {
    console.error('Syntax Error in panelState.js:', err.message);
    process.exit(1);
}

// 4. Check for unfinished templates or placeholders
if (html.includes('{{ ')) {
    console.error('Error: Found unreplaced placeholders with spaces (e.g. {{ SERVER_URL }})');
    process.exit(1);
}

console.log('Build validation complete.');
