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
- The state transformed by transactions is **persisted** as a part of the
  overall [blockchain key-value storage](merkledb.md)
- A service may also allow [external clients](clients.md) to
  **read the relevant data** from the blockchain state using auxiliary
  APIs (for example, REST API).

Each service has an interface for communication with the external
world – essentially, a set of methods – and the implementation of said
interface.
The implementation may read and write data from the blockchain state
(usually using the schema helper for the underlying key-value storage
in order to simplify data management).

Services are executed on each validator and each auditing node of the
blockchain network. The order of transaction processing and the resulting
changes
to the service state are a part of [the consensus algorithm](consensus.md).
They are guaranteed to be the same for all nodes in the blockchain network.

!!! tip
    When developing a service, you should keep in mind that
    calls to service methods must produce an identical result
    on all nodes in the network given the same blockchain
    state. If the call results differ, the consensus algorithm may stall,
    or an audit of the blockchain by auditing nodes may fail.

During blockchain operation, services may be instantiated, stopped and resumed,
and migrated to a newer version (which may include asynchronous data migration).
The lifecycle events are managed by the core, but controlled by the supervisor
service. In the reference supervisor implementation, the lifecycle events are
authorized by the administators of the blockchain nodes.

!!! tip
    See [Service Lifecycle](service-lifecycle.md) for more details.

## Artifacts

Services are created from the *artifacts*. Artifacts are similar
to classes in object-oriented programming while services are similar to objects.
A single artifact may be used to instantiate zero or more services.

An artifact is identified by a name and a semantic version. Like services,
artifacts are attached to a [runtime](#runtimes), and their lifecycle
events are controlled via the supervisor.

## Runtimes

Services and artifacts are encapsulated in *runtimes*. Runtime provides
a single interface for the core to interact with. A runtime provides
to the core service logic by executing it in a certain environment.

Out of the box, Exonum provides two runtimes:

- **The Rust runtime** allows to implement services in Rust. These services
  are good for high-performance apps, but the runtime has some limitations.
  New artifacts may be added only by recompiling the node binary, and this
  process requires coordination among all nodes in the network. Additionally,
  service execution is not isolated from the framework core (except via API
  design), meaning that using `unsafe` code, it is possible to crash the node,
  steal secrets or otherwise break invariants regarding blockchain operation.
- **The Java runtime** uses JVM to containerize services. Unlike with Rust,
  Java artifacts may be deployed during blockchain operation. On the downside,
  Java services are less performant than their Rust counterparts.

## Service Interface

In order to communicate with external entities, services may employ
various kinds of interfaces. The core defines a single service interface
for communication with the external clients: [**transactions**](#transactions).
The core also defines and calls [**service hooks**](#service hooks)
corresponding to different events in service lifecycle.

Besides core-provided interfaces, a runtime may define service interfaces
of its own. For example, both Rust and Java services may define HTTP APIs,
despite the core knowing nothing about this kind of interface.

### Transactions

Transactions come from the entities external to the blockchain, e.g.,
[light clients](clients.md). Generally speaking, a transaction modifies the
blockchain
state if the transaction is considered “correct”. All transactions are recorded
in the blockchain as a part of the transaction log. As the name implies,
transactions are [atomic][wiki:atomicity]; they are deterministically ordered
and are executed in the same way on all nodes.

In the terms of REST services, transactions correspond to `POST` and `PUT`
HTTP methods. Transactions are asynchronous in the sense that a transaction
author
is not given an immediate response as to the result of the transaction.
Indeed, this is impossible because of how consensus works in blockchains;
a transaction is not included in the blockchain immediately, but rather bundled
with other transactions in a block.

!!! note "Example"
    Currency transfer is a classic example of a blockchain transaction.
    The transaction contains the fields corresponding to the sender’s and
    recipient’s
    public keys, the amount of transferred funds and the digital signature
    created by the sender’s private key. See the
    [Cryptocurrency Tutorial](../get-started/create-service.md)
    for more details.

### Hooks

A service may react to the following events of [its lifecycle](#lifecycle):

- Service initialization
- Service being resumed

Both these events accept service-specific arguments, which can be
used for service (re-)configuration.

A service also receives notifications before any transactions
in every block are processed and after all transactions in it are processed.
All these service handlers may modify the blockchain state.

Depending on the runtime implementation, services may also receive
a notification after eeach block is been committed.

### Read Requests

Read requests, or simply reads, are analogous to constant methods in C++ or
`GET` requests in the REST paradigm. They cannot modify the blockchain state
and are not recorded in the blockchain. Unlike transactions, reads are not a
part of the consensus algorithm; they are processed locally by the node that
received the request.

The core does not presently provide a unified mechanism for read requests
accessible to external clients. However, both Rust and Java runtime
provide such a mechanism via HTTP API. *Internal* clients (that is,
other services) may read service state via a public part of its schema.

One of distinguishing features of the Exonum framework is that it provides
a rich set of tools to bundle responses to reads with cryptographic proofs.
Proofs allow light clients
to minimize their trust to the responding node. Essentially, a retrieved
response
is as secure as if the client queried a supermajority of blockchain validators.

!!! summary "Trivia"
    In cryptographic terms, a proof opens a [commitment][wiki:crypto-commit]
    to data in the blockchain, where the commitment is stored in the block header
    in the form of a state hash. The use of Merkle trees and Merkle Patricia trees
    allows to make proofs compact enough to be processed by light clients.

!!! note "Example"
    Retrieving information on a particular wallet (e.g., the current
    wallet balance) is implemented as a read request in the cryptocurrency
    tutorial.

### Data Migrations

The goal of a **data migration** is to prepare data of an Exonum service
for use with an updated version of the service business logic.
In this sense, migrations fulfil the same role as migrations
in traditional database management systems.

Migrations are performed via *migration scripts*. A script takes data
of a service and uses the [MerkleDB tools](merkledb.md#migrations)
to transform it to a new version. Migration is non-destructive,
i.e., does not remove the old versions of migrated indexes.
Instead, new indexes are created in a separate namespace, and atomically
replace the old data when the migration is flushed.

The problems solved by the migration workflow are:

- Allowing for migration to be performed in background, while
  the node continues to process transactions and other requests.
- Ensuring that migrations finish at finite time (i.e., at some
  blockchain height).
- Allowing concurrent migrations for different services.
- Ensuring that all nodes in the network have arrived at the same data
  after migration is completed.

Similar to other service lifecycle events, data migrations are managed
by the core logic, but are controlled by the supervisor service.

## Implementation Details

### Service Data

Usually, a service needs to persist some data. For example, the sample
cryptocurrency service persists account balances, which are changed by transfer
and issuance transactions.

Exonum persists blockchain state in a global key-value storage implemented with
[RocksDB][rocksdb]. Each service needs to define a set of data collections
(*indexes*), in which the service persists the service-specific data;
these indexes abstract away the need for the service to deal with the blockchain
key-value storage directly. The built-in collections supported by Exonum are
maps (`MapIndex`), sets (`ValueSetIndex`, `KeySetIndex`) and lists
(`ListIndex`).

Exonum also provides helpers for *merkelizing* data collections, i.e.,
making it possible to efficiently compute proofs for read requests that involve
the items of the collection. Merkelized versions of maps and lists are
`ProofMapIndex` and `ProofListIndex`, respectively.

Naturally, the items of collections (and keys, in case of maps) need to be
serializable. Exonum uses Protobuf for (de)serialization and conversion of
Exonum datatypes to JSON for communication with light clients.

### Fault Tolerance in Migration Scripts

Migration scripts may be stopped at any time, simply because
a node executing the script may be stopped by the admin or crash because of
unrelated reasons. It is important to ensure that migration scripts
are *fault-tolerant* under these conditions, that is, if a node is restarted
and the script is resumed, it still arrives at a correct outcome.

The simplest way to ensure fault tolerance is to never merge changes to
the database within the script. In this case, the script will either complete
and the changes will be merged atomically by the core, or the script
will just restart from scratch after failure. This approach, however,
may lead to out-of-memory errors for large migrations.

To handle more avanced cases, MerkleDB provides tools to contract the number
of initial states for the script, such as *persistent iterators*.
A persistent iterator is an iterator over a MerkleDB index with the position
stored in the database. A typical pattern involving persistent iterators
is to process elements in the index in chunks of reasonable size
and merge changes to the database after each chunk. In this case, if the script
crashes during processing, it will resume from the latest chunk.
If the script has finished processing the index, processing will be skipped
on restart since the iterator position is still persisted.

!!! tip
    [The testkit](../advanced/service-testing.md) provides automated tools
    to test script fault tolerance for the Rust runtime.

## Service Development

!!! note
    You can code Exonum services in [Rust](http://rust-lang.org/) or Java.
    Rust has been chosen as probably the safest general-purpose programming
    language, but it is not very easy to master. To develop Exonum services in
    Java, use the [Java Binding tool][java-binding].

Here is a list of things to figure out when developing an Exonum service:

- What types of actions will the service perform? What variable parameters
  do these actions have? (Determines the endpoints the service will have.)
- Who will authorize each of these actions? (You might want to use some kind
  of [public key infrastructure][wiki:pki] 
  in order to make the security of the blockchain fully decentralized.)
- What data will the service persist? What are the main persisted entities?
  How are these entities organized into data collections (maps
  and append-only lists)?
- Are there any foreign key relationships among stored entities? (Exonum data
  model supports relationships among entities via hash links;
  see organization of wallet history in the
  [Cryptocurrency Tutorial](../get-started/create-service.md)
  for more details.)
- What persistent data will be returned to external clients? (You might want
  to use Merkelized data collections for this data and create corresponding
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
    [The Cryptocurrency Tutorial](../get-started/create-service.md)
    provides a hands-on guide how to build an Exonum service that implements
    a minimalistic crypto-token.

### Limitations

There are some temporary limitations on what you can do
with Exonum services. Please consult [the Exonum roadmap](../roadmap.md)
on when and how these limitations are going to be lifted.

#### Interaction Among Services

Services may call each other's transactions, but the support of such
*internal calls* is limited so far. In particular, the internal calls
are not isolated, meaning that the changes made to the database state
in an internal call cannot be rolled back on an error unless the entire
enclosing transaction errors.

Additionally, there is no IDL to describe service interface, which makes
interaction among services written in different languages rather clunky. 

#### No Unified Read Requests

Services may read each other's schemas via publicly declared schema
descriptions. For external clients, a different mechanism is used;
a service may provide runtime-specific APIs to get service data.
The unification of these two interfaces is one of roadmap goals.

## Tips and Tricks

### Communication with External World

Services may access the external world (read and write files from the
filesystem, send/receive data on the network, and so on), but should do it only
in the non-consensus code (i.e., code that is not executed during transaction
execution). A good place for such code is event handlers.

!!! note "Example"
    [The anchoring service implementation](https://github.com/exonum/exonum-btc-anchoring)
    uses the commit event handler extensively to communicate with the Bitcoin
    Blockchain network.

### Services vs Smart Contracts

Services are “larger” than smart contracts in Ethereum. For example, in
Ethereum multi-signature contracts are instantiated for each specific configuration
of participants; in Exonum, all multi-signature functionality can be contained
within a single service.
This makes services more manageable and improves performance and access control
management.

### Transaction Processing Peculiarities

When programming a service, you should keep in mind that the service can both
process transactions in real time and retrospectively (for example, when a node
performs an initial blockchain synchronization). This is another reason not to
use non-blockchain data sources in the transaction processing code – it could
be difficult to keep them synchronized at all times.

Furthermore, keep in mind that services may run on both validators and auditing
nodes. Hence, a good idea is to make all secret information used in the local
configuration (e.g., private keys) optional; then, it is kept in mind that a node
running the service might not know this information.

[wiki:atomicity]: https://en.wikipedia.org/wiki/Atomicity_(database_systems)
[wiki:crypto-commit]: https://en.wikipedia.org/wiki/Commitment_scheme
[rocksdb]: http://rocksdb.org
[wiki:pki]: https://en.wikipedia.org/wiki/Public_key_infrastructure
[service.rs]: https://github.com/exonum/exonum/blob/master/exonum/src/blockchain/service.rs
[core-schema.rs]: https://github.com/exonum/exonum/blob/master/exonum/src/blockchain/schema.rs
[java-binding]: https://exonum.com/doc/version/latest/get-started/java-binding/
