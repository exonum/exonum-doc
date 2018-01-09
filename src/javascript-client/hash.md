# Hash

Exonum uses [cryptographic hashes](../glossary/#hash) of certain data for [transactions](transactions) and
[proofs](proofs).

Different signatures of the `hash` function are possible:

```javascript
Exonum.hash(data, type);
```

```javascript
type.hash(data);
```

| Argument | Description | Type |
|---|---|---|
| **data** | Data to be processed using a hash function. | `Object` |
| **type** | Definition of the data type. | [Custom data type](data-types/#define-data-type) or [transaction](transactions/#define-transaction). |

An example of hash calculation:

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

// Data that has been hashed
var data = {
    firstName: 'John',
    lastName: 'Doe',
    age: 28,
    balance: 2500
};

// Get a hash
var hash = user.hash(data); // 1e53d91704b4b6adcbea13d2f57f41cfbdee8f47225e99bb1ff25d85474185af
```

It is also possible to get a hash from byte array:

```javascript
Exonum.hash(buffer);
```

| Argument | Description | Type |
|---|---|---|
| **buffer** | Byte array. | `Array` or `Uint8Array`. |

An example of byte array hash calculation:

```javascript
var arr = [132, 0, 0, 5, 89, 64, 0, 7];

var hash = Exonum.hash(arr); // 9518aeb60d386ae4b4ecc64e1a464affc052e4c3950c58e32478c0caa9e414db
```
