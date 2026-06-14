const fs = require('fs');
const readline = require('readline');

async function readLogs() {
    const rl = readline.createInterface({
        input: fs.createReadStream('C:/Users/artis/.gemini/antigravity-ide/brain/a6ce97d5-2880-446a-b170-d249b22ca8a3/.system_generated/logs/transcript.jsonl'),
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        if (line.includes('capture_browser_console_logs')) {
            console.log('--- FOUND ENTRY ---');
            console.log(line.substring(0, 1000) + '...[TRUNCATED]');
        }
    }
}

readLogs();
