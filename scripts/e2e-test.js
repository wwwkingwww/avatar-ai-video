const BASE = 'http://localhost:3099';
async function main() {
    // Create session
    const s = await (await fetch(BASE + '/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
    console.log('Session:', s.sessionId);
    
    // Send message
    const res = await fetch(BASE + '/api/sessions/' + s.sessionId + '/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '你好，请问你能帮我做什么？', attachments: [] })
    });
    
    const text = await res.text();
    console.log('Response length:', text.length);
    console.log('Response:', text.substring(0, 800));
}
main().catch(e => console.error('ERROR:', e.message));
