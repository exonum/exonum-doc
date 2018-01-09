# Signature

The procedure for [**signing data**](#sign-data) using signing key pair and [**verifying of obtained signature**](#verify-signature) is commonly used
in the process of data exchange between the client and the service.  

!!! tip
    Built-in [**Exonum.keyPair**](helpers/#generate-key-pair) helper function can be used to generate
    a new random signing key pair.

## Sign data

The signature can be obtained using the **secret key** of the signing pair.

There are two possible signatures of the `sign` function:

```javascript
Exonum.sign(secretKey, data, type);
```

```javascript
type.sign(secretKey, data);
```

| Argument | Description | Type |
|---|---|---|
| **secretKey** | Secret key as hexadecimal string. | `String` |
| **data** | Data to be signed. | `Object` |
| **type** | Definition of the data type. | [Custom data type](data-types/#define-data-type) or [transaction](transactions/#define-transaction). |

The `sign` function returns value as hexadecimal `String`.

An example of data signing:

```javascript
// Define a data type
var user = Exonum.newType({
    size: 21,
    fields: {
        firstName: {type: Exonum.String, size: 8, from: 0, to: 8},
        lastName: {type: Exonum.String, size: 8, from: 8, to: 16},
        age: {type: Exonum.Uint8, size: 1, from: 16, to: 17},
        balance: {type: Exonum.Uint32, size: 4, from: 17, to: 21}
    }
});

// Data to be signed
var data = {
    firstName: 'John',
    lastName: 'Doe',
    age: 28,
    balance: 2500
};

// Define the signing key pair 
var publicKey = 'fa7f9ee43aff70c879f80fa7fd15955c18b98c72310b09e7818310325050cf7a';
var secretKey = '978e3321bd6331d56e5f4c2bdb95bf471e95a77a6839e68d4241e7b0932ebe2b' +
 'fa7f9ee43aff70c879f80fa7fd15955c18b98c72310b09e7818310325050cf7a';

// Sign the data
var signature = Exonum.sign(secretKey, data, user); // '41884c5270631510357bb37e6bcbc8da61603b4bdb05a2c70fc11d6624792e07c99321f8cffac02bbf028398a4118801a2cf1750f5de84cc654f7bf0df71ec00'
```

## Verify signature

The signature can be verified using the **author's public key**.

There are two possible signatures of the `verifySignature` function:

```javascript
Exonum.verifySignature(signature, publicKey, data, type);
```

```javascript
type.verifySignature(signature, publicKey, data);
```

| Argument | Description | Type |
|---|---|---|
| **signature** | Signature as hexadecimal string. | `String` |
| **publicKey** | Public key as hexadecimal string. | `String` |
| **data** | Data that has been signed. | `Object` |
| **type** | Definition of the data type. | [Custom data type](data-types/#define-data-type) or [transaction](transactions/#define-transaction). |

The `verifySignature` function returns value of `Boolean` type.

An example of signature verification:

```javascript
// Define a data type
var user = Exonum.newType({
    size: 21,
    fields: {
        firstName: {type: Exonum.String, size: 8, from: 0, to: 8},
        lastName: {type: Exonum.String, size: 8, from: 8, to: 16},
        age: {type: Exonum.Uint8, size: 1, from: 16, to: 17},
        balance: {type: Exonum.Uint32, size: 4, from: 17, to: 21}
    }
});

// Data that has been signed
var data = {
    firstName: 'John',
    lastName: 'Doe',
    age: 28,
    balance: 2500
};

// Define a signing key pair 
var publicKey = 'fa7f9ee43aff70c879f80fa7fd15955c18b98c72310b09e7818310325050cf7a';
var secretKey = '978e3321bd6331d56e5f4c2bdb95bf471e95a77a6839e68d4241e7b0932ebe2b' +
 'fa7f9ee43aff70c879f80fa7fd15955c18b98c72310b09e7818310325050cf7a';

// Signature obtained upon signing using secret key
var signature = '41884c5270631510357bb37e6bcbc8da61603b4bdb05a2c70fc11d6624792e07' +
 'c99321f8cffac02bbf028398a4118801a2cf1750f5de84cc654f7bf0df71ec00';

// Verify the signature
var result = Exonum.verifySignature(signature, publicKey, data, user); // true
```
