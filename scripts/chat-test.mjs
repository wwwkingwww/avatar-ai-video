const BASE = 'http://localhost:3099';
async function main() {
    const s = await (await fetch(BASE+'/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();
    console.log('Session:',s.sessionId);
    const res = await fetch(BASE+'/api/sessions/'+s.sessionId+'/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:'hi',attachments:[]})});
    const t = await res.text();
    console.log('Len:',t.length,'\n'+t.substring(0,800));
}
main().catch(e=>console.log('ERR:',e.message));
