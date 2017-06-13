# Services

**Services** are the main extension point for the Exonum framework.
By itself, Exonum provides building blocks for creating blockchains;
it does not come with any concrete transaction processing rules.
This is where services come into play.
If you want to create an instance of the Exonum blockchain,
services are *the* way to go.

## Overview

Like smart contracts in some other blockchain platforms, Exonum services
encapsulate business logic of the blockchain application.

- A service specifies **the rules of transaction processing**, namely, how
  [transactions](transactions.md) influence the state of the service
- The state transformed by transactions is **persisted** as a part of the overall
  [blockchain key-value storage](storage.md)
- A service may also allow [external clients](clients.md) to
  **read the relevant data** from the blockchain state

Each service has a well-defined interface for communication with the external
world – essentially, a set of endpoints – and the implementation of the said interface.
The implementation may read and write data from the blockchain state
(usually using the schema helper for the underlying key-value storage
in order to simplify data management) and can also access the local node configuration.

Services are executed on each validator and each auditing node of the
blockchain network. The order of transaction processing and the resulting changes
to the service state are a part of [the consensus algorithm](consensus.md).
They are guaranteed to be the same for all nodes in the blockchain network.

!!! tip
    When developing a service, you should keep in mind that
    calls to service endpoints must produce an identical result
    on all nodes in the network given the same blockchain
    state. If the call results differ, the consensus algorithm may stall,
    or an audit of the blockchain by auditing nodes may fail.

!!! note
    Unlike smart contract in certain blockchains, services in Exonum
    are not isolated in a virtual machine environment and are not containerized.
    This makes Exonum services more efficient and flexible in their capabilities,
    but at the same time requires more careful service programming. Service isolation
    is on [the Exonum roadmap](../roadmap.md).

## Service Interface

In order to communicate with external entities, services employ three kinds of endpoints:

- [Transactions](#transactions)
- [Read requests](#read-requests) (together with transactions, form public API)
- [Private API](#private-api)

Service endpoints are automatically aggregated and dispatched by the Exonum
middleware layer.

!!! note
    Exonum uses [the Iron framework][iron] to specify service endpoints,
    both public and private. Public and private API endpoints are served on different
    sockets, which allows to specify stricter firewall rules for private APIs.

### Transactions

Transactions come from the entities external to the blockchain, e.g.,
[thin clients](clients.md). Generally speaking, a transaction modifies the blockchain
state if the transaction is considered “correct”. All transactions are recorded
in the blockchain as a part of the transaction log. As the name implies,
transactions are [atomic][wiki:atomicity]; they are deterministically ordered
and are executed in the same way on all nodes.

In the terms of RESTful services, transactions correspond to `POST` and `PUT`
HTTP methods. Transactions are asynchronous in the sense that a transaction author
is not given an immediate response as to the result of the transaction.
Indeed, this is impossible because of how consensus works in blockchains;
a transaction is not included in the blockchain immediately, but rather bundled
with other transactions in a block.

!!! note "Example"
    Currency transfer is a classic example of a blockchain transaction.
    The transaction contains the fields corresponding to the sender’s and recipient’s
    public keys, the amount of transferred funds and the digital signature
    created by the sender’s private key. See [the cryptocurrency tutorial](../get-started/create-service.md)
    for more details.

### Read Requests

Read requests, or simply reads, are analogous to constant methods in C++ or `GET`
requests in the REST paradigm. They cannot modify the blockchain state
and are not recorded in the blockchain. Unlike transactions, reads are not the part
of the consensus algorithm; they are processed locally by the node that
received the request.

One of distinguishing features of the Exonum framework is that it provides
a rich set of tools to bundle responses to reads with cryptographic proofs;
see [Merkle index](../advanced/merkle-index.md) and [Merkle Patricia index](../advanced/merkle-patricia-index.md)
for more details. Proofs allow thin clients
to minimize their trust to the responding node. Essentially, a retrieved response
is as secure as if the client queried a supermajority of blockchain validators.

!!! summary "Trivia"
    In cryptographic terms, a proof opens a [commitment][wiki:crypto-commit]
    to data in the blockchain, where the commitment is stored in a block header
    in the form of a state hash. The use of Merkle trees and Merkle Patricia trees
    allows to make proofs compact enough to be processed by thin clients.

!!! note "Example"
    Retrieving information on a particular wallet (e.g., the current
    wallet balance) is implemented as a read request in the cryptocurrency tutorial.

### Private API

Unlike transactions and read requests, private API calls denote the interaction
of the service not with the external clients, but rather with the administrator
of the Exonum node, on which the service is running. Private API should not
be accessible from the outside world.

Similar to read requests, private APIs cannot change the blockchain state;
however, they can create transactions and broadcast them to the network.

!!! note "Example"
    In [the configuration update service](../advanced/configuration-updater.md),
    private API is used to obtain the information about the current configuration
    and update proposals.

## Implementation Details

### Data Schema

Usually, a service needs to persist some data. For example, the sample
cryptocurrency service persists account balances, which are changed by transfer
and issuance transactions.

Exonum persists blockchain state in a global key-value storage implemented
using [LevelDB][leveldb]. Each service needs to define a set of data collections
(*tables*), in which the service persists the service-specific data;
these tables abstract away the need for the service to deal with the blockchain
key-value storage directly. The built-in collections supported by Exonum are
maps and append-only lists (`MapTable` and `ListTable`, respectively).

Exonum also provides helpers for *merklizing* data collections, i.e.,
making it possible to efficiently compute proofs for read requests that involve
the items of the collection. Merklized versions of maps and lists are
`MerklePatriciaTable` and `MerkleTable`, respectively.

Naturally, the items of collections (and keys in the case of maps) need to be
serializable. Exonum provides a simple and robust [binary serialization format](serialization.md),
and the corresponding set of tools for (de)serialization and conversion of
Exonum datatypes to JSON for communication with thin clients.

### Configuration

Besides blockchain, a service may read or write data in [the local configuration](configuration.md).
Logically, the local configuration represents parameters local to a specific
node instance. A good example is a private anchoring key used in
[the anchoring service](../advanced/bitcoin-anchoring.md);
naturally, nodes have different private keys and they cannot be put on the blockchain
for security reasons.

Local configuration can be changed via private API.

## Lifecycle

Service lifecycle contains the following remarkable events.

### Deployment

At the very beginning of the lifecycle, the service is registered
with the blockchain. During deployment, the service creates an initial
service configuration and initializes its persistent storage.

!!! note
    As of Exonum 0.1, services may be deployed only during the blockchain
    initialization (i.e., before the blockchain network starts creating any blocks).
    In the future releases, services will be able to be deployed dynamically as
    shared libraries.

### Initialization

Each time a validating or auditing node is started, it initializes all
deployed services. Initialization passes local and public blockchain configuration
to the service, so it can properly initialize its state.
If the configuration is updated, the services are automatically restarted.

### Transaction Processing

A service is responsible for verifying the structural integrity of incoming transactions
and executing transactions (i.e., applying them to the blockchain state).
Transactions are executed during [the precommit stage](consensus.md)
of the consensus (this concerns validators only) or when a node receives a block.

### Event handling

Services may subscribe to events (such as a block being committed) and perform
some work in the event handler. The event handlers cannot modify the blockchain
state, but can be used for various tasks such as logging, data migrations,
updating local parameters, and/or generating and broadcasting transactions to the
blockchain network

!!! note
    As of Exonum 0.1, the only built-in event is block commit. More events
    will be added in the future, including possibility for services to define
    and emit events and for services and thin clients to subscribe to events
    emitted by the services.

## Service Development

!!! note
    As of Exonum 0.1, you can only code services in [Rust](http://rust-lang.org/).
    Rust is probably the safest general-purpose programming language, but it’s
    not very easy to master. Java binding [is a high-priority task](../roadmap.md).

Here’s a list of things to figure out when developing an Exonum service:

- What types of actions will the service perform? What variable parameters
  do these actions have? (Determines the endpoints the service will have.)
- Who will authorize each of these actions? (You might want to use some kind
  of [public key infrastructure][wiki:pki] for serious applications
  in order to make the security of the blockchain fully decentralized.)
- What data will the service persist? What are the main persisted entities?
  How are these entities organized into data collections (maps
  and append-only lists)?
- Are there any foreign key relationships among stored entities? (Exonum data model
  supports relationships among entities via hash links;
  see organization of wallet history in [the cryptocurrency tutorial](../get-started/create-service.md)
  for more details.)
- What persistent data will be returned to external clients? (You might want
  to use merklized data collections for this data and create corresponding
  read request endpoints.)
- Are there any maintenance tasks needed for the service? Do the tasks need
  to be invoked automatically, or authorized by system administrators?
  (These tasks could be implemented in the commit event handler of the service,
  or as private API endpoints.)
- What parameters do maintenance tasks require? Are these parameters local
  to each node that the service runs on, or do they need to be agreed
  by the blockchain maintainers? (The answer determines whether a parameter
  should be a part of the local configuration or stored in the blockchain.)

!!! tip
    [The cryptocurrency tutorial](../get-started/create-service.md)
    provides a hands-on guide how to build an Exonum service that implements
    a minimalistic crypto-token.

## Interface with Exonum Framework

Internally, services communicate with the Exonum framework via an interface
established in [the `Service` trait][service.rs].
This trait defines the following methods that need to be implemented by
a service developer.

### Service Identifiers

```rust
fn service_id(&self) -> u16;
fn service_name(&self) -> &'static str;
```

`service_id` returns a 2-byte service identifier, which needs to be unique
within a specific Exonum blockchain. `service_name` is similarly a unique identifier,
only it is a string instead of an integer.

`service_id` is used:

- To identify [transactions](transactions.md) hosted by the service.
- Within the blockchain state. See [`state_hash`](#state-hash) below and
  [*Storage*](storage.md)
- In [the configuration](configuration.md). Service configuration
  is stored in the overall configuration under the key obtained
  by converting `service_id` to a string via `format("{}", service_id)`

`service_name` is used:

- To compute API endpoints for the service. All service endpoints
  are mounted on `/api/services/{service_name}`.

### State Hash

```rust
fn state_hash(&self, view: &View)
              -> Result<Vec<Hash>, StorageError> {
    Ok(Vec::new())
}
```

The `state_hash` method needs to return a list of hashes for all
Merklized tables defined by the service, which are calculated based on the
current blockchain state `view`. 
The core uses this list to aggregate
hashes of tables defined by all services, into a single Merklized meta-map.
The hash of this meta-map is considered the hash of the entire blockchain state
and is recorded as such in blocks and [`Precommit` messages](../advanced/consensus/consensus.md).

The default trait implementation returns an empty list. This corresponds to
the case when a service doesn't have any Merklized tables.

!!! note
    The keys of the meta-map are defined as pairs `(service_id, table_id)`,
    where `service_id` is a 2-byte [service identifier](#service-identifiers)
    and `table_id` is a 2-byte identifier of a table within the service.
    Keys are then stretched to 32 bytes using SHA-256 in order to provide
    a more even key distribution (which results in a more balanced
    Merkle Patricia tree).

### Parse Raw Transaction

```rust
fn tx_from_raw(&self, raw: RawTransaction)
               -> Result<Box<Transaction>, MessageError>;
```

The `tx_from_raw` method is used to parse raw transactions received from the network
into specific transaction types defined by the service. The core uses this method
to dispatch incoming transactions to services that host transaction implementations.
The `service_id` field in the transaction serialization is used to determine
the service, whose `tx_from_raw` method is called by the core.

A parsed transaction returned by the method is then used in further
transaction processing.

## Tips and Tricks

### Communication with External World

Services may access the external world (read and write files from the filesystem,
send/receive data on the network, and so on), but should do it only
in the non-consensus code (i.e., code that is not executed during transaction execution).
A good place for such code is event handlers.

!!! note "Example"
    [The anchoring service implementation](https://github.com/exonum/exonum-btc-anchoring)
    uses the commit event handler extensively to communicate with the Bitcoin Blockchain
    network.

### Services vs Smart Contracts

Services are “larger” than smart contracts in Ethereum. For example, in Ethereum
multi-signature contracts are instantiated for each specific configuration of participants;
in Exonum, all multi-signature functionality can be contained within a single service.
This makes services more manageable and improves performance and access control
management.

### Transaction Interface

Transactions in Exonum are separate entities, rather than datatypes consumed
by the methods of the service object. This may seem complicated at first, but makes
transaction handling more flexible. For example, it could be possible
(and there are plans) to add management of transaction ordering in the unconfirmed
transactions pool via an extra method of the transaction interface.

### Transaction Processing Peculiarities

When programming a service, you should keep in mind that the service can both
process transactions in real time and retrospectively (for example, when a node
performs an initial blockchain synchronization). This is another reason not to
use non-blockchain data sources in the transaction processing code – it could
be difficult to keep them synchronized at all times.

Furthermore, keep in mind that services may run on both validators and auditing nodes.
Hence, a good idea is to make all secret information used in the local configuration
(e.g., private keys) optional; then, it’s kept in mind that a node
running the service might not know this information.

[iron]: http://ironframework.io/
[wiki:atomicity]: https://en.wikipedia.org/wiki/Atomicity_(database_systems)
[wiki:crypto-commit]: https://en.wikipedia.org/wiki/Commitment_scheme
[leveldb]: http://leveldb.org/
[wiki:pki]: https://en.wikipedia.org/wiki/Public_key_infrastructure
