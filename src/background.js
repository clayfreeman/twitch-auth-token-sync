class TwitchAuthTokenSync {

  #iterations = 600_000;

  attach = async (cookie) => {
    const { hostname: domain } = new URL(cookie.url);

    chrome.cookies.get(cookie, this.#update);
    chrome.cookies.onChanged.addListener(({ cause, cookie: data, removed }) => {
      if (cause === 'explicit' && !removed) {
        if (data.domain === domain && data.name === cookie.name) {
          this.#update(data);
        }
      }
    });

    chrome.storage.onChanged.addListener(() => {
      chrome.cookies.get(cookie, this.#update);
    });
  }

  async #doDeriveKey(baseKey, salt) {
    return await crypto.subtle.deriveKey(
      {name: 'PBKDF2', iterations: this.#iterations, hash: 'SHA-256', salt},
      baseKey,
      {name: 'AES-GCM', length: 256},
      false,
      ['encrypt'],
    );
  }

  async #doEncrypt(value, baseKey) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await this.#doDeriveKey(baseKey, salt),
      new TextEncoder().encode(value),
    );

    return {
      iterations: this.#iterations,
      ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
      salt: btoa(String.fromCharCode(...new Uint8Array(salt))),
      iv: btoa(String.fromCharCode(...new Uint8Array(iv))),
    };
  }

  async #doUpdate(value, baseKey, destination, signingKey) {
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString().replace(/Z$/, '123456Z');

    const ciphertext = await this.#doEncrypt(value, baseKey);
    const body = JSON.stringify({
      subscription: {
        id: crypto.randomUUID(),
        status: 'enabled',
        type: 'auth.token',
        version: '1',
        cost: 0,
        condition: {
          id: crypto.randomUUID(),
        },
        transport: {
          method: 'webhook',
          callback: destination,
        },
        created_at: timestamp,
      },
      event: ciphertext,
    });

    const sigData = new TextEncoder().encode(`${id}${timestamp}${body}`);
    const sig = await crypto.subtle.sign('HMAC', signingKey, sigData);

    const headers = {
      'Twitch-EventSub-Message-ID': id,
      'Twitch-EventSub-Message-Signature': `sha256=${this.#toHexString(sig)}`,
      'Twitch-EventSub-Message-Timestamp': timestamp,
      'Twitch-EventSub-Message-Type': 'notification',
      'Twitch-EventSub-Subscription-Type': 'auth.token',
      'Twitch-EventSub-Subscription-Version': '1',
    };

    await fetch(destination, {
      body,
      headers,
      method: 'POST',
    });
  }

  async #getBaseKey() {
    const { encrypt } = await chrome.storage.sync.get(['encrypt']);

    if (encrypt) {
      return await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(encrypt),
        { name: 'PBKDF2' },
        false,
        ['deriveKey'],
      );
    }

    return false;
  }

  async #getDestination() {
    const { destination } = await chrome.storage.sync.get(['destination']);

    if (destination) {
      return new URL(destination).toString();
    }

    return false;
  }

  async #getSigningKey() {
    const { sign } = await chrome.storage.sync.get(['sign']);

    if (sign) {
      return await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(sign),
        { name: 'HMAC', hash: { name: 'SHA-256' } },
        false,
        ['sign']
      );
    }

    return false;
  }

  #toHexString(arr) {
    return Array.from(new Uint8Array(arr)).map((byte) => {
      return ('0' + byte.toString(16)).slice(-2);
    }).join('');
  }

  #update = async (cookie) => {
    const { value } = cookie || {};

    const baseKey = await this.#getBaseKey();
    const destination = await this.#getDestination();
    const signingKey = await this.#getSigningKey();

    if (baseKey && destination && signingKey && value) {
      await this.#doUpdate(value, baseKey, destination, signingKey);
    }
  }

}

const initialize = async () => {
  const sync = new TwitchAuthTokenSync();

  await sync.attach({
    url: 'https://.twitch.tv',
    name: 'auth-token',
  });
};

chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);
