# Data types 

The definition of data structures is the main part of each application based on Exonum blockchain.

On the one hand, each transaction must be [signed](signature#sign-data) before sending into blockchain.
Before the transaction is signed it is converted into byte array under the hood.

On the other hand, the data received from the blockchain should be converted into byte array under the hood
before it will be possible to [verify proof of its existence](proofs) using cryptographic algorithm.

Converting data into a byte array is called [serialization](serialization).
To get the same serialization result on the client and on the [service](../architecture/services) side,
there must be a strict serialization rules. This rules are formed by the data structure definition.

## Define data type

```javascript
var type = Exonum.newType({
  size: 12,
  fields: {
    balance: {type: Exonum.Uint32, size: 4, from: 0, to: 4},
    name: {type: Exonum.String, size: 8, from: 4, to: 12}
  }
});
```

**Exonum.newType** function requires a single argument of `Object` type with next structure:

| Property | Description | Type |
|---|---|---|
| **size** | The total length in bytes. | `Number` |
| **fields** | List of fields. | `Object` |

Field structure:

| Field | Description | Type |
|---|---|---|
| **type** | Definition of the field type. | [Built-in primitive](#built-in-primitives), [array](#arrays) or [custom data type](#nested-data-types) defined by the developer. | 
| **size** | Total length of the field in bytes. | `Number` |
| **from** | The beginning of the field segment in the byte array. | `Number` |
| **to** | The end of the field segment in the byte array. | `Number` |

## Built-in primitives

There are several primitive types are built it into the library.
These types must be used when constructing custom data types.

| Name | Size | Description | Type |
|---|---|---|---|
| **Int8** | 1 | Number in a range from `-128` to `127`. | `Number` |
| **Int16** | 2 | Number in a range from `-32768` to `32767`. | `Number` |
| **Int32** | 4 | Number in a range from `-2147483648` to `2147483647`. | `Number` |
| **Int64** | 8 | Number in a range from `-9223372036854775808` to `9223372036854775807`. | `Number` or `String`\* |
| **Uint8** | 1 | Number in a range from `0` to `255`. | `Number` |
| **Uint16** | 2 | Number in a range from `0` to `65535`. | `Number` |
| **Uint32** | 4 | Number in a range from `0` to `4294967295`. | `Number` |
| **Uint64** | 8 | Number in a range from `0` to `18446744073709551615`. | `Number` or `String`\* |
| **String** | 8\*\* | A string of variable length consisting of UTF-8 characters. | `String` |
| **Hash** | 32 | Hexadecimal string. | `String` |
| **PublicKey** | 32 | Hexadecimal string. | `String` |
| **Digest** | 64 | Hexadecimal string. | `String` |
| **Bool** | 1 | Value of boolean type. | `Boolean` |

*\*JavaScript limits minimum and maximum integer number.
Minimum safe integer in JavaScript is `-(2^53-1)` which is equal to `-9007199254740991`.
Maximum safe integer in JavaScript is `2^53-1` which is equal to `9007199254740991`.
For unsafe numbers out of the safe range use `String` only.
To determine either number is safe use built-in JavaScript function
[Number.isSafeInteger()][is-safe-integer].*

*\*\*Size of 8 bytes is due to the specifics of string [serialization](../architecture/serialization/#segment-pointers)
using segment pointers.
Actual string length is limited only by the general message size limits which is depends on OS, browser and
hardware configuration.*

## Nested data types

Custom data type defined by the developer can be a field of other custom data type.

A nested type, regardless of its real size, always takes **8 bytes** in the parent type due to the specifics of its
[serialization](../architecture/serialization/#segment-pointers) using segment pointers.

An example of a nested type:

```javascript
// Define a nested data type
var date = Exonum.newType({
  size: 4,
  fields: {
    day: {type: Exonum.Uint8, size: 1, from: 0, to: 1},
    month: {type: Exonum.Uint8, size: 1, from: 1, to: 2},
    year: {type: Exonum.Uint16, size: 2, from: 2, to: 4}
  }
});

// Define a data type
var payment = Exonum.newType({
  size: 16,
  fields: {
    date: {type: date, size: 8, from: 0, to: 8},
    amount: {type: Exonum.Uint64, size: 8, from: 8, to: 16}
  }
});
```

There is no limitation on the depth of nested data types.

## Arrays

The array in the light client corresponds to the [vector structure](https://doc.rust-lang.org/std/vec/struct.Vec.html)
in the Rust language.

**Exonum.newArray** function requires a single argument of `Object` type with next structure:

| Property | Description | Type |
|---|---|---|
| **size** | Length of the nested field type. | `Number` |
| **type** | Definition of the field type. | [Built-in primitive](#built-in-primitives), array or [custom data type](#nested-data-types) defined by the developer. |

An array, regardless of its real size, always takes **8 bytes** in the parent type due to the specifics of its
[serialization](../architecture/serialization/#segment-pointers) using segment pointers.

An example of an array type field: 

```javascript
// Define an array
var year = Exonum.newArray({
    size: 2,
    type: Exonum.Uint16
});

// Define a data type
var type = Exonum.newType({
    size: 8,
    fields: {
        years: {type: year, size: 8, from: 0, to: 8}
    }
});
```

An example of an array nested in an array:

```javascript
// Define an array
var distance = Exonum.newArray({
    size: 4,
    type: Exonum.Uint32
});

// Define an array with child elements of an array type
var distances = Exonum.newArray({
    size: 8,
    type: distance
});

// Define a data type
var type = Exonum.newType({
    size: 8,
    fields: {
        measurements: {type: distances, size: 8, from: 0, to: 8}
    }
});
```

[is-safe-integer]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isSafeInteger
