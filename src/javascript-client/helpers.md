# Helpers

## Generate key pair

```javascript
var pair = Exonum.keyPair();
```

```javascript
{
    publicKey: "...", // 32-byte public key
    secretKey: "..." // 64-byte secret key
}
```

**Exonum.keyPair** function generates a new random [Ed25519](../glossary/#digital-signature) signing key pair using the
[TweetNaCl][tweetnacl:key-pair] cryptographic library.

## Get random number

```javascript
var rand = Exonum.randomUint64();
``` 

**Exonum.randomUint64** function generates a new random `Uint64` number of cryptographic quality using the
[TweetNaCl][tweetnacl:random-bytes] cryptographic library.

## Converters

### Hexadecimal to Uint8Array

```javascript
var hex = '674718178bd97d3ac5953d0d8e5649ea373c4d98b3b61befd5699800eaa8513b';

Exonum.hexadecimalToUint8Array(hex); // [103, 71, 24, 23, 139, 217, 125, 58, 197, 149, 61, 13, 142, 86, 73, 234, 55, 60, 77, 152, 179, 182, 27, 239, 213, 105, 152, 0, 234, 168, 81, 59]
```

### Hexadecimal to String

```javascript
var hex = '674718178bd97d3ac5953d0d8e5649ea373c4d98b3b61befd5699800eaa8513b';

Exonum.hexadecimalToBinaryString(hex); // '0110011101000111000110000001011110001011110110010111110100111010110001011001010100111101000011011000111001010110010010011110101000110111001111000100110110011000101100111011011000011011111011111101010101101001100110000000000011101010101010000101000100111011'
```

### Uint8Array to Hexadecimal

```javascript
var arr = new Uint8Array([103, 71, 24, 23, 139, 217, 125, 58, 197, 149, 61, 13, 142, 86, 73, 234, 55, 60, 77, 152, 179, 182, 27, 239, 213, 105, 152, 0, 234, 168, 81, 59]);

Exonum.uint8ArrayToHexadecimal(arr); // '674718178bd97d3ac5953d0d8e5649ea373c4d98b3b61befd5699800eaa8513b'
```

### Binary String to Uint8Array

```javascript
var str = '0110011101000111000110000001011110001011110110010111110100111010110001011001010100111101000011011000111001010110010010011110101000110111001111000100110110011000101100111011011000011011111011111101010101101001100110000000000011101010101010000101000100111011';

Exonum.binaryStringToUint8Array(str); // [103, 71, 24, 23, 139, 217, 125, 58, 197, 149, 61, 13, 142, 86, 73, 234, 55, 60, 77, 152, 179, 182, 27, 239, 213, 105, 152, 0, 234, 168, 81, 59]
```

### Binary String to Hexadecimal

```javascript
var str = '0110011101000111000110000001011110001011110110010111110100111010110001011001010100111101000011011000111001010110010010011110101000110111001111000100110110011000101100111011011000011011111011111101010101101001100110000000000011101010101010000101000100111011';

Exonum.binaryStringToHexadecimal(str); // '674718178bd97d3ac5953d0d8e5649ea373c4d98b3b61befd5699800eaa8513b'
```

### String to Uint8Array

```javascript
var str = 'Hello world';

Exonum.stringToUint8Array(str); // [72, 101, 108, 108, 111, 32, 119, 111, 114, 108, 100]
```

[tweetnacl:key-pair]: https://github.com/dchest/tweetnacl-js#naclsignkeypair
[tweetnacl:random-bytes]: https://github.com/dchest/tweetnacl-js#random-bytes-generation
