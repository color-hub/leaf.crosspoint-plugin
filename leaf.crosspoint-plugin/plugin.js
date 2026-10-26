// Leaf for CrossPoint (LEAF_CROSSPOINT_V1): the card on the reader's web
// Settings page. It trades the code Leaf shows for this reader's token and
// keeps the token in /.crosspoint/.leaf-token.json — outside the plugin's
// folder, which /plugin serves to anyone on the network.
CrossPoint.registerPlugin(async (container, api) => {
  const SERVER = 'https://readersync-485315818927.us-central1.run.app';
  const TOKEN_FILE = '/.crosspoint/.leaf-token.json';
  const PAIRED_FILE = api.dir + '/paired.json';

  const b64 = (text) => btoa(unescape(encodeURIComponent(text)));
  const el = (tag, props, children) => {
    const node = Object.assign(document.createElement(tag), props || {});
    (children || []).forEach((child) => node.append(child));
    return node;
  };

  async function pairedAt() {
    try {
      const response = await fetch(api.pluginFile('paired.json'), {cache: 'no-store'});
      if (!response.ok) return null;
      return (await response.json()).pairedAt || null;
    } catch (e) {
      return null;
    }
  }

  async function deviceId() {
    try {
      const status = await (await fetch('/api/status?plugin=' + encodeURIComponent(api.name))).json();
      return status.deviceId || 'reader';
    } catch (e) {
      return 'reader';
    }
  }

  async function pair(code, message) {
    message.textContent = 'Connecting…';
    let response;
    try {
      response = await api.relay('POST', SERVER + '/v1/pair',
          {'Content-Type': 'application/json'},
          JSON.stringify({code, deviceId: await deviceId()}));
    } catch (e) {
      message.textContent = 'No connection to Leaf. Check the reader’s Wi-Fi and try again.';
      return;
    }
    if (response.status === 404) {
      message.textContent = 'This code is unknown. Check it and try again.';
      return;
    }
    if (response.status === 410) {
      message.textContent = 'This code has expired. Get a new one in Leaf.';
      return;
    }
    if (response.status !== 200) {
      message.textContent = 'Leaf did not answer (' + response.status + '). Try again later.';
      return;
    }
    const {token} = JSON.parse(response.body);
    await api.writeFile(TOKEN_FILE, b64(JSON.stringify({token})));
    await api.writeFile(PAIRED_FILE, b64(JSON.stringify({pairedAt: new Date().toISOString()})));
    await render();
  }

  async function unpair() {
    // An empty file is refused by the device, so the token is overwritten
    // with an object that carries none.
    await api.writeFile(TOKEN_FILE, b64('{}'));
    await api.writeFile(PAIRED_FILE, b64('{}'));
    await render();
  }

  async function render() {
    const since = await pairedAt();
    const title = el('h2', {textContent: 'Leaf'});

    if (since) {
      const date = new Date(since).toLocaleString();
      const button = el('button', {textContent: 'Disconnect', type: 'button'});
      button.addEventListener('click', unpair);
      container.replaceChildren(title,
          el('p', {textContent: 'Connected ' + date + '. Your reading sessions go to Leaf ' +
              'when the reader connects to Wi-Fi or goes to sleep.'}),
          button);
      return;
    }

    const input = el('input', {
      type: 'text', placeholder: 'Code from Leaf', autocomplete: 'off', maxLength: 12,
    });
    input.style.textTransform = 'uppercase';
    const message = el('p');
    const button = el('button', {textContent: 'Connect', type: 'submit'});
    const form = el('form', {}, [input, button]);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const code = input.value.trim();
      if (code.length === 0) return;
      pair(code, message);
    });
    container.replaceChildren(title,
        el('p', {textContent: 'In Leaf, open Settings → E-reader → Connect a reader and ' +
            'type the code here.'}),
        form, message);
  }

  await render();
});
