# Exonum Light Client Tutorial

In this tutorial we describe how to use the light client to interact with Exonum
services. The tutorial extends other tutorials:
[Cryptocurrency Advanced](data-proofs.md)
and, partly, [Timestamping][timestamping-demo].

Light client is a JavaScript library used for a number of purposes:

- forming and sending transactions to the blockchain
- creating digital signatures over transactions
- obtaining and checking cryptographic proofs of data authenticity and
  integrity.

Below we will provide you with the detailed description of how said
functionality is executed in Exonum light client.

## Before You Start

To start using Exonum light client, include [exonum-client][javascript-client]
into your JavaScript application. Please refer to this detailed guide
for instructions on how to customize your client. The present tutorial will
show you the ready-made examples of the client use.

## Execute a Transaction

A transaction is an atomic operation that introduces changes to the blockchain
state. The structure, contents and number of transaction types within one
service vary depending on the business logic of each service.

The general algorithm of executing a transaction in Exonum includes 4 stages:

- define transaction schema with protobuf
- generate a signing key pair (if required)
- define data types
- define transaction data
- sign the transaction
- send transaction to the blockchain.

Below we provide two peculiar examples of transaction execution in Exonum
services.

### Define transaction schema with protobuf

As stated in our [Guide for the Light Client][javascript-client-nested-types],
a custom data type can be a field of other custom data type without limitation
as to the depth of the nested data.

In view of the above, in the Timestamping Demo we start defining the transaction
with the `TxTimestamp` entity itself. Said entity is further applied as a custom
type within `CreateTimestamp` transaction schema.
For serialization in exonum-client used [protobufjs][protobufjs-lib] library.
In this library you can using `.proto` files or `reflection only method`

In our timestamping services we have the next structures:

Hash:

- `data` is a object with SHA-256 hash of some data or file to be stamped

Timestamp:

- `content_hash` is a object of `Hash` type
- `metadata` is an optional description of the data to be stamped that is
  included into the stamp.
  
TxTimestamp:

- `content` is a object of `Timestamp` type

#### .proto files

Example of `timestamping.proto` file is below:

```proto
package timestamping;

import "google/protobuf/timestamp.proto";

message Hash { bytes data = 1; }

// Stores content's hash and some metadata about it.
message Timestamp {
  Hash content_hash = 1;
  string metadata = 2;
}

/// Timestamping transaction.
message TxTimestamp { Timestamp content = 1; }
```

After creating .proto file you need generate `*.js` file with [pbjs][pbjs-lib] library.
Sample code is below:

```json
{
  "proto": "pbjs --keep-case -t static-module timestamping.proto -o ./proto.js"
}
```

#### Reflection only method

Sample code is below:

```javascript
let Root  = protobuf.Root,
    Type  = protobuf.Type,
    Field = protobuf.Field;

let Hash = new Type("Hash").add(new Field("data", 1, "bytes"));
let root = new Root().define("timestamping").add(Hash);

let Timestamp = new Type("Timestamp").add(new Field("content_hash", 1, "timestamping.Hash"));
root.add(Timestamp);

let TxTimestamp = new Type("TxTimestamp").add(new Field("content", 1, "timestamping.Timestamp"));
root.add(TxTimestamp);
```

### Generate a signing key pair (if required)

Generate a signing key pair for signing and sending the transaction.

```javascript
const keyPair = Exonum.keyPair()
```

!!! note
    In our Timestamping Demo we generate a new signing key pair for each new
    timestamp. On the contrary, in the Service with Data Proofs we generate only
    one key pair that corresponds to a certain wallet and its user and, thus, is
    applied for signing all transactions made on its behalf.

### Define data types

Define `CreateTimestamp` transaction and field types:

```javascript
const CreateTimestamp = Exonum.newTransaction({
   author: keyPair.publicKey,
   service_id: 130,
   message_id: 0,
   schema: timestamping.TxTransaction
})
```

- `author` author’s public key
- `service_id` represents the identifier of the service. Check the identifier
  in the source code of the service (the smart-contract designed in Rust or
  Java)
- `message_id` represents the identifier of the transaction type in the
  service. Corresponds to the index number of the transaction in source code of
  the service, starting with `0`
- `schema` schema of `TxTimestamp` type defined above.

### Define transaction data

Prepare transaction data according to the above-defined schema:

```javascript
const data = {
  content: {
    content_hash: { data: Exonum.hexadecimalToUint8Array(hash) },
    metadata: metadata
  }
}
```

### Sign the transaction

Sign the transaction with the secret key from the key pair generated above:

```javascript
const signature = CreateTimestamp.sign(keyPair.secretKey, data)
```

### Send the transaction

Finally, send the resulting transaction into the blockchain using the built-in
`send` method which returns a `Promise`:

```javascript
const transactionHash = await CreateTimestamp.send(transactionEndpoint, data, keyPair.secretKey)
```

- `transactionEndpoint` represents API address of transaction handler at a
  blockchain node. Example:

    ```none
    http://127.0.0.1:8200/api/explorer/v1/transactions
    ```

### Transfer Funds Transaction

To execute this type of transaction you need to have two wallets
created in advance: a sender and a receiver. You should also generate a separate
key pair for each wallet, so that these keys could be used for defining and
signing the transfer transactions between the wallets.

Next, define `TransferFunds` transaction schema and data types as we did in the
example above:

```proto
package examples;

message TransferFunds {
  uint64 amount = 1;
  // Auxiliary number to guarantee non-idempotence of transactions.
  uint64 seed = 2;
}
```

```json
{
  "proto": "pbjs --keep-case -t static-module example.proto -o ./proto.js"
}
```

```javascript
const TransferFunds = Exonum.newTransaction({
   author: publicKey,
   service_id: 128,
   message_id: 1,
   schema: examples.TransferFunds
})
```

As you might know from our very first tutorial
[Cryptocurrency Tutorial](create-service.md),
in order to transfer funds from one wallet to another, a `seed` is included
into each such transaction. This prevents transactions from being hacked by
a third person. You can generate `seed` as follows:

```javascript
const seed = Exonum.randomUint64()
```

Prepare the transaction data according to the above-defined schema. Note that we
identify the sender by the public key of his wallet that was generated when
creating said wallet:

```javascript
const data = {
  amount: amount,
  seed: seed
}
```

Now you can sign the transaction with the sender’s secret key and send the
resulting
transaction into the blockchain. The methods applied in this case are identical
to those shown in the `CreateTimestamp` transaction described above.

## Cryptographic Proofs

The idea behind this functionality is one of the core features of the light
client. Whenever you want to check the presence of some data in the blockchain,
a request is made with the light client. The response to the request should
contain your data together with either a cryptographic proof for it or a
corresponding error, if such data is absent in the blockchain for some reason.

In other words, a [cryptographic proof](../glossary.md#merkle-proof)
is a response to the read request made through the light client that:

- validates authenticity of the data included therein
- certifies that said data is safely stored in the blockchain.

In the same way as transactions, data proofs provided by Exonum light client
have a general common structure and comprise several parts. Meanwhile,
depending on the service business logic some extra custom parts may be included
therein.

Below, we will discuss the proof from the Service with Data Proofs which in its
structure repeats the proofs from the Timestamping Demo service plus contains
some custom parts.

The proof itself comprises several levels and, when executed, unfolds from the
highest level down to the lowest one, which is represented by the requested
data. The highest level, evidently, corresponds to the blockchain state hash.

Below is the proof chart representing the proof structure. You can refer to it
while we will be further conducting the proof analyses.

![proof-chart](../images/proof-chart.png)

Thus, first of all, we check that the block containing our data is correct and
bears the state hash indicated in the proof. For this purpose we load the actual
list of public keys of validator nodes stored in the network
[configuration](../architecture/configuration.md). The keys
are applied to assert that the data received from the
blockchain was indeed agreed upon by all the member nodes in the network:

```javascript
const response = await axios.get(
  '/api/services/configuration/v1/configs/actual')
const validators = response.data.config.validator_keys.map(
  validator => validator.consensus_key)
```

Now make a request for the data on a particular wallet together with its proof.
Note, that we identify the wallet by its public key which is in fact the public
key of its holder:

```javascript
const response = await axios.get(
  `/api/services/cryptocurrency/v1/wallets/info?pub_key=${publicKey}`)
// response.data contains wallet together with its proof
```

- `publicKey` - public key of the wallet of interest.

As soon as we get the data, as mentioned above, we verify the block where it is
stored, in particular block precommits according to the downloaded set of
keys of the validators:

```javascript
if (!Exonum.verifyBlock(data.block_info, validators)) {
  throw new Error('Block can not be verified')
}
```

Next, we need to obtain the root hash of the table that bears all the
registered wallets from the table containing hashes of all tables defined
in the service (state hash aggregator) and check the presence of
the wallets table:

```javascript
const tableRootHash = Exonum.verifyTable(data.wallet_proof.to_table,
  data.block_proof.block.state_hash, SERVICE_ID, TABLE_INDEX)
```

The next proof level is devoted to the validation of existence of a particular
wallet inside the system.

First, we define the structure that we search for in the proof. In this case it
is a wallet.

```proto
package examples;

message Hash { bytes data = 1; }

message PublicKey { bytes data = 1; }

// Wallet information stored in the database.
message Wallet {
  // `PublicKey` of the wallet.
  PublicKey pub_key = 1;
  // Name of the wallet.
  string name = 2;
  // Current balance of the wallet.
  uint64 balance = 3;
  // Length of the transactions history.
  uint64 history_len = 4;
  // `Hash` of the transactions history.
  Hash history_hash = 5;
```

```javascript
const Wallet = Exonum.newType(examples.Wallet)
```

We then obtain the proof down to the required wallet:

```javascript

const walletProof = new Exonum.MapProof(data.wallet_proof.to_wallet,
  Exonum.PublicKey, Wallet)
```

Here we also check that `merkleRoot`, which is now the root hash of the wallets
table, coincides with `tableRootHash` we obtained at the previous level. In this
way we can link two parts of the proof:

```javascript
if (walletProof.merkleRoot !== tableRootHash) {
  throw new Error('Wallet proof is corrupted')
}
```

If the above is the case, we can safely extract wallet data from the proof:

```javascript
const wallet = walletProof.entries.get(publicKey)

if (typeof wallet === 'undefined') {
  throw new Error('Wallet not found')
}
```

Basically, the proof from the Timestamping Demo comprises the same validation
levels as described above. Specifically, to obtain confirmation for the
timestamp data, the proof validates the block, the root table and the table of
timestamps. The data on the timestamp can then be extracted from the validated
timestamps table.

Meanwhile, the proof we presently investigate contains another level that refers
to the validation of transactions in respect of each wallet.  

First, we obtain a proof for all transactions in the wallet. It will contain
transaction hashes as well as statuses thereof. In our example we obtain
information for the whole wallet transaction history, however, any suitable
range may be selected:

```javascript

const transactionsMetaData = Exonum.merkleProof(
  Exonum.uint8ArrayToHexadecimal(new Uint8Array(wallet.history_hash.data)),
  wallet.history_len,
  data.wallet_history.proof,
  [0, wallet.history_len],
  Exonum.Hash
)
```

Upon obtainment of the proof, make sure that the number of transactions in the
wallet history, that we extracted earlier together with other information on the
wallet, is equal to the number of transactions in the array of the proof.
Otherwise, transactions cannot be verified against the proof:

```javascript
if (data.wallet_history.transactions.length !==
    transactionsMetaData.length)
{
  throw new Error('Transactions can not be verified')
}
```

Next, we validate each transaction. For this purpose we iterate them in the
array and first check them according to their structure. This check allows us
to confirm that a transaction of a certain type is present at a definite place
in the array. In our example, for the sake of brevity, we provide structure
definition of an issue-type transaction only. However, note that all the
transaction types of the service should be defined.

Next, we validate each transaction signature with `Transaction.verifySignature`
method.

Finally, we calculate a hash from a transaction body with `Transaction.hash`
method to compare it with the corresponding hash from the proof.

```javascript
for (let transaction of data.wallet_history.transactions) {
  const hash = transactionsMetaData[index++]
  const buffer = Exonum.hexadecimalToUint8Array(transaction.message)
  const bufferWithoutSignature = buffer.subarray(0, buffer.length - 64)
  const author = Exonum.uint8ArrayToHexadecimal(buffer.subarray(0, 32))
  const signature = Exonum.uint8ArrayToHexadecimal(
    buffer.subarray(buffer.length - 64, buffer.length));

  const Transaction = getTransaction(transaction.debug, author)

  if (Exonum.hash(buffer) !== hash) {
     throw new Error('Invalid transaction hash')
  }

  // serialize transaction and compare with message
  if (!Transaction.serialize(transaction.debug).every(function (el, i) {
     return el === bufferWithoutSignature[i]
  })) {
    throw new Error('Invalid transaction message')
  }

  if (!Transaction.verifySignature(signature, author, transaction.debug)) {
     throw new Error('Invalid transaction signature')
  }

  const transactionData = Object.assign({ hash: hash }, transaction.debug)
     if (transactionData.to) {
       transactionData.to = Exonum.uint8ArrayToHexadecimal(
         new Uint8Array(transactionData.to.data)
       )
     }
   transactions.push(transactionData)
  }
```

## Conclusion

We have described all the functionality required to interact with an Exonum
service through the light client so far.

Well done! You have now equipped your application with a full-stack Exonum-based
support! At this the point you can build and run your application.

[timestamping-demo]: https://github.com/exonum/exonum/tree/master/examples/timestamping
[javascript-client]: https://github.com/exonum/exonum-client#getting-started
[javascript-client-nested-types]: https://github.com/exonum/exonum-client#nested-data-types
[protobufjs-lib]: https://github.com/dcodeIO/protobuf.js
[pbjs-lib]: https://www.npmjs.com/package/pbjs
