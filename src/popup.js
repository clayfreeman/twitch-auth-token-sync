chrome.storage.sync.get(['destination', 'encrypt', 'sign'], (items) => {
  destination.value = items.destination || '';
  encrypt.value = items.encrypt || '';
  sign.value = items.sign || '';
});

encrypt.addEventListener('focus', () => encrypt.type = 'text');
encrypt.addEventListener('blur', () => encrypt.type = 'password');

sign.addEventListener('focus', () => sign.type = 'text');
sign.addEventListener('blur', () => sign.type = 'password');

save.addEventListener('click', () => {
  chrome.storage.sync.set({
    destination: destination.value,
    encrypt: encrypt.value,
    sign: sign.value,
  });
});
