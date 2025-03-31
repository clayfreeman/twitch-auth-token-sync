# Twitch Auth Token Sync

A WebExtension designed to exfiltrate the `auth-token` cookie value from Twitch whenever it changes.

## Building the Extension

To build the extension, run the `build.sh` script to create an `artifacts` directory containing source code and reproducible archives for both Chrome and Firefox.

## Configuration

Once installed, click the extension in the browser toolbar to configure the following settings:

1. **Destination**: The destination *must* be a URL capable of receiving Twitch EventSub-style [webhook callback notifications](https://dev.twitch.tv/docs/eventsub/handling-webhook-events/#processing-an-event). This is where the extension will send notifications.
2. **Encryption Key**: You must provide an encryption key used to encrypt the `auth-token` cookie value. This key can be any arbitrary value of your choice, and will be used later to decrypt the cookie value.
3. **Signing Key**: You must provide a `secret` value used to sign notifications. This value must be the same value used by your webhook callback for [signature verification](https://dev.twitch.tv/docs/eventsub/handling-webhook-events/#verifying-the-event-message) to succeed.

You can force the extension to send a notification by changing any one of its setting values.

The extension will not send notifications unless all of its settings have been configured.

## Usage

Upon detecting a change to the `auth-token` cookie while using Twitch, the extension will encrypt it and POST an `auth.token` event notification to the configured destination.

The `event` key of the notification payload will contain a JSON object with the following keys:
- `iterations`: The number of iterations used for key derivation.
- `ciphertext`: The encrypted `auth-token` value as a base64-encoded string.
- `salt`: The salt used for key derivation as a base64-encoded string.
- `iv`: The initialization vector used for encryption as a base64-encoded string.

To decrypt the payload your webhook callback receives:

1. Base64-decode `ciphertext`, `salt`, and `iv`
2. Compute `secret` as the result of applying PBKDF2-HMAC-SHA256 with `iterations` number of iterations to `salt`
3. Extract the last 16 bytes of `ciphertext`
   - The first substring is the new value of `ciphertext`
   - The second substring is `tag`
4. Decrypt `ciphertext` using AES-256-GCM with `secret`, `iv`, and `tag`

An example PHP function to decrypt the ciphertext follows:

```php
/**
 * Decrypt the supplied ciphertext using AES-256-GCM / PBKDF2-HMAC-SHA256.
 *
 * @param string $salt
 *   The base64-encoded salt to use to derive the secret.
 * @param string $encryption_key
 *   The encryption key to use to derive the secret.
 * @param int $iterations
 *   The number of iterations used to derive the secret.
 * @param string $iv
 *   The base64-encoded initialization vector.
 * @param string $ciphertext
 *   The base64-encoded ciphertext to decrypt.
 *
 * @return string|false
 *   The decrypted message, or FALSE on failure.
 */
function aes256gcm_decrypt(string $salt, string $encryption_key, int $iterations, string $iv, string $ciphertext) {
  // Attempt to base64-decode the inputs.
  $ciphertext = \base64_decode($ciphertext);
  $salt = \base64_decode($salt);
  $iv = \base64_decode($iv);

  if (!\in_array(FALSE, [$ciphertext, $salt, $iv], TRUE)) {
    // Derive the secret using the specified number of iterations.
    $secret = \hash_pbkdf2('sha256', $encryption_key, $salt, $iterations, binary: true);

    // Attempt to extract the tag from the ciphertext.
    @[$ciphertext, $tag] = \preg_split('/(?=.{16}$)/', $ciphertext, 2);

    if (\strlen($tag) === 16) {
      // Decrypt the ciphertext using the secret, IV, and tag.
      return \openssl_decrypt($ciphertext, 'AES-256-GCM', $secret, \OPENSSL_RAW_DATA, $iv, $tag);
    }
  }

  return FALSE;
}
```

## Disclaimers

The encryption and signing key settings are stored using the WebExtension Storage API, which is only as strong as the security of the user's browser profile and machine. Ensure that appropriate precautions are taken to protect your information.

This extension is intended for personal use and experimentation only. By using this extension, you agree that the responsibility for securely managing your Twitch authentication token lies solely with you.
