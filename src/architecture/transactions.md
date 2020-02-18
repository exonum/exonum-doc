# Transactions

A **transaction** in Exonum,
[as in usual databases](https://en.wikipedia.org/wiki/Database_transaction),
is a group of sequential operations with the data (i.e., the Exonum
[key-value storage](merkledb.md)).
Transaction processing rules are defined in [services](services.md);
these rules determine business logic of any Exonum-powered blockchain.

Exonum transactions are wrapped in [messages](#messages). Besides the
transaction payload, a message also contains a public key
of the message author and a message signature. This approach allows
the separation of the business logic and information related to authorization
within a message.

Transactions are executed
[atomically, consistently, in isolation and durably][wiki:acid].
If the transaction execution violates certain data invariants,
the transaction is completely rolled back, so that it does not have any
effect on the persistent storage.

If the transaction is correct, it can be committed, i.e., included into a block
via the [consensus algorithm](consensus.md)
among the blockchain validators. Consensus provides [total ordering][wiki:order]
among all transactions; between any two transactions in the blockchain,
it is possible to determine which one comes first.
Transactions are applied to the Exonum key-value storage sequentially
in the same order transactions are placed into the blockchain.

!!! note
    The order of transaction issuance at the client side does not necessarily
    correspond to the order of their processing. To maintain the logical order
    of processing, it is useful to
    adhere to the following pattern: send the next transaction only after
    the previous one was processed. This behavior is
    implemented in the [JS light client](https://github.com/exonum/exonum-client).

All transactions are authenticated with the help of public-key digital
signatures. The message containing the transaction includes the signature
verification key (aka public key) among its parameters. Thus, authorization
(verifying whether the transaction author actually has the right to perform the
transaction) can be accomplished with the help of building a
[public key infrastructure][wiki:pki] and/or various constraints based
on this key.

!!! tip
    In order to minimize security risks, it is recommended to decentralize
    message signing. Roughly speaking, there should not be a single
    server signing all messages in the system; this could create a security
    chokepoint. One of the options to decentralize signing is to use
    the [light client library](https://github.com/exonum/exonum-client).

!!! note "Example"
    In a sample [cryptocurrency service][cryptocurrency],
    an owner of cryptocurrency may authorize transferring his coins by signing
    a transfer transaction with a key associated with coins. Authentication
    in this case means verifying that a transaction is digitally signed with
    a specific key, and authorization means that this key is associated with
    a sufficient amount of coins to make the transaction.

## Messages

Messages are digitally signed pieces of data transmitted through the Exonum
framework. The core of the framework validates the signature over the message.
All messages have a uniform structure defined as a [Protobuf] message:

```protobuf
message SignedMessage {
  bytes payload = 1;
  exonum.crypto.PublicKey author = 2;
  exonum.crypto.Signature signature = 3;
}
```

The `payload` field varies for different messages. In general, it conforms
to the following Protobuf:

```protobuf
message CoreMessage {
  oneof kind {
    // Transaction message.
    exonum.runtime.AnyTx any_tx = 1;
    // (other message types...)
  }
}

message AnyTx {
  // Dispatch info, see below.
  CallInfo call_info = 1;
  // Information specific for the transaction type.
  bytes arguments = 2;
}

message CallInfo {
  // Unique service instance identifier. This identifier is used to
  // find the corresponding runtime to execute a transaction.
  uint32 instance_id = 1;
  // Identifier of the method in the service interface required
  // for the call.
  uint32 method_id = 2;
}
```

To summarize, the transaction payload carries the following
information:

- ID of the service for which the transaction is intended
- ID of the method within the service
- Service transaction payload

For example, the `TxTransfer` transaction type in the sample Cryptocurrency
Service is represented using the following Protobuf description:

```protobuf
message TxTransfer {
  // Public key of the receiver.
  exonum.PublicKey to = 1;
  // Amount of tokens to transfer from sender’s account to receiver.
  uint64 amount = 2;
  // Auxiliary number to guarantee non-idempotence of transactions.
  uint64 seed = 3;  
 }
```

This transaction payload is then serialized into `AnyTx.arguments`,
wrapped in `CoreMessage`, and finally into `SignedMessage`.
Note that `TxTransfer` does not need to include information about
who is transferring funds because the sender is defined
by `SignedMessage.author`.

## Serialization

All transactions in Exonum are serialized using Protobuf. See the
[Serialization](serialization.md) article for more details.

!!! note
    Each unique transaction message serialization is hashed with
    [SHA-256 hash function](https://en.wikipedia.org/wiki/SHA-2).
    A transaction hash is taken over the entire transaction serialization.
    Hashes are used as unique identifiers for transactions where such an
    identifier is needed (e.g., when determining whether a specific transaction
    has been committed previously).

## Interface

How transaction handlers are expressed, depends on
the [service runtime](services.md#runtimes). For example, in the Rust runtime
transactions are defined within traits and their handlers are defined
within a trait implementation for the service.

A transaction handler in the service receives the current blockchain state
and can modify it (but can choose not to do so if certain conditions
are not met). Technically handlers operate on a fork of the blockchain state,
which is merged to the persistent storage [under certain conditions](consensus.md).
Handlers are performed during the `Precommit` stage of the consensus.

Any additional information besides the payload is included into
the *execution context*. Besides a fork, the context provides
information about the executing service (e.g., its ID), the hash
of the message containing the transaction, and the public key
of the transaction author.

!!! note "Example"
    In the sample Cryptocurrency Service, handler for `TxTransfer` verifies
    that the sender’s and recipient’s accounts exist and the sender has enough
    coins to complete the transfer. If these conditions hold, the sender’s
    balance of coins is decreased and the recipient’s one is increased by the
    amount specified in the transaction. Additionally, the transaction is
    logged in the sender’s and recipient’s history of transactions; the logging
    is performed even if the transaction execution is unsuccessful (e.g., the
    sender has insufficient number of coins). Logging helps to ensure that
    account state can be verified by light clients.

A handler can signal that a transaction should be aborted
by returning an error. The error contains a service-specific error code
(an unsigned 1-byte integer), and an optional string description. If the handler
returns an error, all changes made in the blockchain state by the transaction
are discarded; instead, the error code and description are saved to the
blockchain.

!!! note
    Besides service-specific errors, the service may reuse some common errors
    (e.g., “unauthorized”), which are defined in the core library.
    Non-service code (i.e., runtimes and core itself) may also emit errors
    during execution of service calls; for example, the core will emit
    an error if a non-existent service is called. Consult core documentation
    on [`ExecutionError`][ExecutionError] for more details.

Erroneous transactions are still considered committed.
Such transactions can be and are included into the blockchain provided they
lead to the same result (panic or return an identical error code)
for at least 2/3 of the validators.
If transaction results differ among node in the network, the transaction
may not be included into the blockchain.

## Lifecycle

### 1. Creation

A transaction is created by an external entity (e.g., a
[light client](clients.md)) and is signed with a private key necessary to
authorize the transaction.

### 2. Submission to Network

After creation, the transaction is submitted to the blockchain network.
Usually, this is performed by a light client connecting to a full node
via [an appropriate transaction endpoint](services.md#transactions).

!!! note
    As transactions use universally verifiable cryptography (digital signatures)
    for authentication, a transaction theoretically can be submitted to the
    network by anyone aware of the transaction. There is no intrinsic upper
    bound on the transaction lifetime, either.

!!! tip
    From the point of view of a light client, transaction execution is
    asynchronous; full nodes do not return an execution status synchronously
    in response to the request of the client. To determine the transaction status,
    you may poll the transaction status using
    [read requests](services.md#read-requests) defined in the corresponding
    service or the blockchain explorer. If a transaction is valid, it is
    expected to be committed in a matter of seconds.

### 3. Verification

After a transaction is received by a full node, it is looked up
among committed transactions, using the transaction hash as the unique
identifier. If the transaction has been committed previously, it is
discarded, and the following steps are skipped.

On the next step, the transaction is deserialized from Protobuf and
its signature is checked. If the signature is invalid, the transaction
is discarded.

The core then searches for the service capable of executing the transaction.
If such a service does not exist or is not active, the transaction
is ignored.

If all above steps are successful, the transaction is added to the pool
of unconfirmed transactions.

### 4. Broadcasting

If a transaction included to the pool of unconfirmed transactions
is received by a node not from another full node,
then the transaction is broadcast to all full nodes that the node is connected
to. In particular, a node broadcasts transactions received from light clients
or generated internally by services, but does not rebroadcast
transactions that are broadcast by peer nodes or are received with the help
of [requests](../advanced/consensus/requests.md) during consensus.

### 5. Consensus

After a transaction reaches the pool of a validator, it can be included
into a block proposal (or multiple proposals).

!!! summary "Trivia"
    Presently, the order of inclusion of transactions into a proposal is
    determined by the transaction hash. An honest validator takes transactions
    with the smallest hashes when building a proposal. This behavior shouldn’t
    be relied upon; it is likely to change in the future.

The transaction executes during the lock step of the consensus algorithm.
This happens when a validator has collected all
transactions for a block proposal and certain conditions are met, which imply
that the proposal is going to be accepted in the near future.
The results of execution are reflected in `Precommit` consensus messages and
are agreed upon within the consensus algorithm. This ensures that
transactions are executed in the same way on all nodes.

### 6. Commitment

When a certain block proposal and the result of its execution gather
sufficient approval among validators, the block with the transaction is committed
to the blockchain. All transactions from the committed block are sequentially
applied to the persistent blockchain state by invoking their handlers
in the same order the transactions appear in the block.
Hence, the order of application is the same for every node in the network.

## Transaction Properties

### Sequential Consistency

[Sequential consistency](https://en.wikipedia.org/wiki/Sequential_consistency)
essentially means that the blockchain looks like a centralized system for an
external observer (e.g., a light client). All transactions in the blockchain
affect the blockchain state as if they were executed one by one in the order
specified by their ordering in blocks. Sequential consistency is guaranteed
by the [consensus algorithm](consensus.md).

### Non-replayability

Non-replayability means that an attacker cannot take an old legitimate
transaction from the blockchain and apply it to the blockchain state again.

!!! note "Example"
    Assume Alice pays Bob 10 coins using [Cryptocurrency Service][cryptocurrency].
    Non-replayability prevents Bob from taking Alice’s transaction and
    submitting it to the network again to get extra coins.

Non-replayability is also a measure against DoS attacks; it prevents an attacker
from spamming the network with his own or others’ transactions.

Non-replayability in Exonum is guaranteed by discarding transactions already
included into the blockchain (which is determined by the transaction hash),
at the verification step.

!!! tip
    If a transaction is not [idempotent][wiki:idempotent], it needs to have
    an additional field to distinguish among transactions with the same
    set of parameters. This field needs to have a sufficient length
    (e.g., 8 bytes) and can be generated deterministically (e.g., via a
    counter) or (pseudo-)randomly. See `TxTransfer.seed` in the Cryptocurrency
    Service as an example.

[wiki:acid]: https://en.wikipedia.org/wiki/ACID
[wiki:order]: https://en.wikipedia.org/wiki/Total_order
[wiki:pki]: https://en.wikipedia.org/wiki/Public_key_infrastructure
[wiki:idempotent]: https://en.wikipedia.org/wiki/Idempotence
[cryptocurrency]: https://github.com/exonum/exonum/blob/master/examples/cryptocurrency
[Protobuf]: https://developers.google.com/protocol-buffers
[ExecutionError]: https://docs.rs/exonum/1.0.0-rc.1/exonum/runtime/struct.ExecutionError.html
