import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const file=new URL('../.local/plex-auth.json',import.meta.url);
const saved=existsSync(file)?JSON.parse(readFileSync(file)):{};
const client=saved.client || randomUUID();
const headers={'Accept':'application/json','X-Plex-Product':'CleanFrame LG','X-Plex-Client-Identifier':client};
const mode=process.argv[2] || 'start';
if(mode==='start') {
 const r=await fetch('https://plex.tv/api/v2/pins',{method:'POST',headers:{...headers,'Content-Type':'application/x-www-form-urlencoded'},body:'strong=true'});
 if(!r.ok) throw new Error('Plex PIN HTTP '+r.status);
 const p=await r.json();
 writeFileSync(file,JSON.stringify({client,id:p.id,code:p.code}),{mode:0o600});
 console.log('https://app.plex.tv/auth#?'+new URLSearchParams({clientID:client,code:p.code,'context[device][product]':'CleanFrame LG'}));
} else {
 const r=await fetch('https://plex.tv/api/v2/pins/'+saved.id+'?'+new URLSearchParams({code:saved.code}),{headers});
 if(!r.ok) throw new Error('Plex auth HTTP '+r.status);
 const p=await r.json();
 if(!p.authToken){console.log('Awaiting Plex authorization');process.exit(2);}
 writeFileSync(file,JSON.stringify({...saved,token:p.authToken}),{mode:0o600});
 console.log('Plex authorization saved securely.');
}
