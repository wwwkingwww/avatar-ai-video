const BASE = 'http://localhost:3099';
async function test() {
    // Create session
    const s = await (await fetch(BASE+'/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();
    console.log('Session:',s.sessionId);
    // Submit
    const r = await fetch(BASE+'/api/sessions/'+s.sessionId+'/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    const d = await r.json();
    console.log('Submit:',JSON.stringify(d));
}
test().catch(e=>console.log('ERR:',e.message));
