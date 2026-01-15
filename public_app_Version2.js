async function api(path, method='GET', body) {
  const res = await fetch('/api' + path, { method, headers: body ? {'content-type':'application/json'} : undefined, body: body ? JSON.stringify(body) : undefined });
  return res.json();
}

async function refresh() {
  const list = await api('/servers');
  const container = document.getElementById('list');
  container.innerHTML = '';
  for (const s of list) {
    const div = document.createElement('div');
    div.className = 'server';
    div.innerHTML = `<strong>${s.name}</strong> <span class="${s.state}">(${s.state || 'unknown'})</span><br/>
      ${s.host}:${s.port} | bot: ${s.botUsername} | saved: ${s.save ? 'yes' : 'no'} | maxHours: ${s.maxRunHours}
      <div style="margin-top:6px">
        <button data-id="${s.id}" class="join">Join (bot)</button>
        <button data-id="${s.id}" class="del">Remove</button>
      </div>`;
    container.appendChild(div);
  }
  document.querySelectorAll('.join').forEach(b => b.onclick = async e => {
    b.disabled = true;
    await api('/servers/' + e.target.dataset.id + '/join', 'POST');
    setTimeout(()=>{ refresh(); }, 1000);
  });
  document.querySelectorAll('.del').forEach(b => b.onclick = async e => {
    await api('/servers/' + e.target.dataset.id, 'DELETE');
    setTimeout(()=>{ refresh(); }, 400);
  });
}

document.getElementById('addForm').onsubmit = async (ev) => {
  ev.preventDefault();
  const name = document.getElementById('name').value;
  const host = document.getElementById('host').value;
  const port = document.getElementById('port').value;
  const botUsername = document.getElementById('botUsername').value || undefined;
  const save = document.getElementById('save').checked;
  const maxRunHours = parseInt(document.getElementById('hours').value || '8', 10);
  await api('/servers', 'POST', { name, host, port, botUsername, save, maxRunHours });
  document.getElementById('addForm').reset();
  setTimeout(refresh, 300);
};

refresh();
setInterval(refresh, 15000);