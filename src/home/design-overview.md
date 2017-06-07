# Design Overview

This page describes the core design decisions of the Exonum framework.

- [Transaction processing](#transaction-processing) describes the lifecycle of
  transactions and blocks in Exonum
- [Network structure](#network-structure) describes how Exonum network operates
- [Consensus](#consensus) explains how nodes agree on the blockchain
  state
- [Data storage](#data-storage) describes how data is saved locally and
  introduces the proofs mechanism
- [Modularity and services](#modularity-and-services) introduces services
  and explains what they are used for
- [Cryptography](#cryptography) briefly describes main crypto-primitives used
  in Exonum

## Transaction Processing

!!! tip
    See the [*Transactions*](../architecture/transactions.md) article
    for more details.

For an outer application, an Exonum blockchain represents a key-value
storage and an [online transaction processing][wiki:oltp] facility managing
this storage. Its core functions are processing transactions, persisting data,
and responding to read queries from external clients.

**Transactions** are the main entity Exonum works with. A transaction represents
an atomic patch that should be applied to the key-value storage.
Transactions are authenticated with the help of public-key digital signatures.
Transactions need to be verified and ordered before they are considered
accepted / committed. Ordering is performed by
[the consensus algorithm](#consensus); the algorithm is also responsible that
only successfully verified transactions are committed.

Transactions are templated; each transaction template has a set of variable parameters,
which influence the transaction execution and are used to serialize transactions
for network transmission and persistence. (Hence, transactions could be
compared to stored procedures in RDBMSs.)
Transaction templates and the processing rules for each template
are defined by [services](#modularity-and-services). In particular,
services define verification rules for transactions and the way transactions
are applied to the key-value storage.

All data in the Exonum blockchain is divided into two parts:

- **Data storage**, which contains data structured into tables
- **Trasaction log**, i.e., the complete history of all transactions ever applied
  to the data storage

As transactions include operations on the key-value storage such as creating
new value, or updating already saved values, the actual data storage state
can be restored completely from the transaction log.
When a new node in the Exonum network appears, it loads
already generated blocks and applies its transactions to the data
storage one by one. Such approach allows seeing the whole history of any
data chunk and simplify auditing.

By using a transaction log, Exonum implements [state machine
replication][wiki:state-machine-repl]. It guarantees agreement of data
storage states among nodes in the network. The same approach is often used by
non-blockchain distributed DBs, such as MongoDB or PostgreSQL.

### Blocks

Exonum gathers transactions into **blocks**; the whole block is approved
atomically. If a transaction has not been written to any block yet, it is
not regarded as accepted. After a block is approved, every transaction in it is
executed sequentially, with changes applied to the data storage.

Exonum blocks consist of the following parts:

- The hash of the previous Exonum block
- The list of the approved transactions. When the nodes execute the block,
  they execute every transaction in the given order and apply changes to
  their data storages. Every transaction type is executed by the
  appropriate Exonum service
- The hash of a new data storage state. The state itself is not
  included; however, transactions are applied deterministically and
  unequivocally. The agreement on the hash of data storage is a part of
  the Exonum consensus algorithm, so the hash is guaranteed to coincide
  for all validators

As every block includes the hash of the previous block,
it is impossible to change one block
without the appropriate changes to each of the following blocks.
This ensures immutability of the transaction log; once a transaction is committed,
it cannot be retroactively modified or evicted from the log. Similarly,
it’s impossible to insert a transaction in the middle of the log.

!!! note
    The agreement on the hash of the data storage means that not only
    full nodes execute transactions in the same order; they also
    must execute all transactions in exactly the same way. This protects against
    a scenario where execution results differ for the nodes in the network
    (e.g., because of non-deterministic instructions in the transaction
    execution code), which may lead to all sorts of trouble.

## Network Structure

!!! tip
    See separate articles for more details: [*Network*](../advanced/network.md),
    [*Clients*](../architecture/clients.md).

The Exonum network consists of *full nodes* connected via peer-to-peer connections,
and *light clients*.

### Full Nodes

**Full nodes** replicate the entire contents of the blockchain
and correspond to replicas in distributed databases.
All the full nodes are authenticated with public-key cryptography.
Full nodes are further subdivided into 2 categories:

- **Auditors** replicate the entire contents of the blockchain. They
  can generate new transactions, but cannot choose which transactions
  should be committed (i.e., cannot generate new blocks)
- **Validators** provide the network liveness. Only validators can generate
  new blocks by using a [Byzantine fault tolerant consensus algorithm](#consensus).
  Validators receive transactions, verify them, and include into a new block.
  The list of the validators is restricted by network maintainers, and normally
  should consist of 4-15 nodes

### Light Clients

**Light clients** represent clients in the client-server paradigm; they connect
to full nodes to retrieve information from the blockchain they are
interested in, and to send transactions. Exonum provides a “proofs
mechanism”, based on cryptographic commitments via Merkle / Merkle Patricia
trees. This mechanism allows verifying that a response from the full node
has been really authorized by supermajority of validators.

## Consensus

!!! tip
    See separate articles for more details: [*Consensus*](../advanced/consensus/consensus.md),
    [*Leader Election*](../advanced/consensus/leader-election.md).

Exonum uses a custom modification of Byzantine fault tolerant
consensus (similar to PBFT) to guarantee that in any time there is one agreed version
of the blockchain. It is assumed that the environment is decentralized,
i.e., any node is allowed to fail or be compromised.
Consensus is *authenticated*; consensus paritcipants (i.e., validators)
are identified with the help of public-key cryptography.

To generate a new block and vote upon it, a 3-phase approach is used.

- The consensus algorithm is divided into rounds, the beginning of which is determined
  by each validator based on its local clock.
  For every round, there is a predefined leader validator, which is determined
  based on the round number, blockchain height and other information
  from the blockchain state. The leader
  creates a *block proposal* and sends it to other validators
- Other validators check the proposal, and if it is correct, vote for
  it by broadcasting *prevote* messages to the validators
- If a validator collects prevote messages for the same proposal from a supermajority
  of validators, it executes transactions in the proposal, creates a *precommit*
  message with the resulting data storage state and broadcasts it to the validators
- Finally, if a validator receives precommits from a supermajority of validators
  for the same proposal, the proposal becomes a new block and is committed to
  the local storage of the validator

!!! note
    A block can be committed at different times for different validators.
    The consensus algorithm guarantees that validators cannot commit different blocks
    at the same height (see [the safety property](#safety-and-liveness) below).

If a validator does not receive a correct block proposal in a particular round,
it eventually moves to the next round by a timeout and is ready to
review proposals from the leader in the new round.

The consensus algorithm can withstand up to 1/3 of the validators acting maliciously,
being switched off or isolated from the rest of the network.
This is the best possible amount under the conditions in which the Exonum
consensus operates (partial synchrony, which can be roughly summarized as
the absence of reference time in the system). For example, a leader may not
generate a proposal in time, or send different proposals to different validators;
eventually, all honestly acting validators will agree on the same new block.

Validators can be changed during the blockchain operation by [updating](#configuration-update-service)
the global blockchain configuration. This mechanism can be used to rotate
validators’ keys, and to add, replace or remove validator nodes without
having to start a blockchain anew.

### Safety and Liveness

Technically speaking, the consensus algorithm used in Exonum guarantees
2 basic properties:

- **Safety** means that once a single correctly operating validator
  commits a block, all other correctly operating validators will eventually commit
  the same block at the same height; in other words, the blockchain cannot split
- **Liveness** means that correctly operating validators continue committing blocks
  from time to time

These properties are formally proven to hold for the consensus algorithm
in a partially synchronous network with up to 1/3 of validator nodes
being compromised or non-responsive. If the network is asynchronous (i.e.,
there are arbitrary high connection latencies among validators), the algorithm
guarantees safety, but may lose liveness. The same happens in most scenarios in which
more than 1/3 (but less than 2/3) of the validators are compromised.

## Data Storage

!!! tip
    See the [*Data Storage*](../architecture/storage.md) article
    for more details.

### LevelDB

[LevelDB][level-db] is used to persist locally the data that
transactions operate with. It provides high efficiency and
minimal storage overhead.
[RocksDB][rocks-db] will be also featured in the future releases.

### Table Types

Exonum supports several types of data tables, representing typed collections
(lists and maps):

- `ListTable` implements an array list
- `MapTable` represents a map / key-value storage
- [`MerkleTable`](../advanced/merkle-index) is an enhanced version of
  array storage. It implements a balanced (but not necessarily full) binary
  Merkle tree. Leaves of the tree keep the
  actual array items, while the intermediate nodes keep the hashes from concatenated
  children data. `MerkleTable` only allows to append the data or update the
  already stored items
- [`MerklePatriciaTable`](../advanced/merkle-patricia-index) extends the
  map. It is based on a Merkle Patricia tree, implemented as a binary tree.
  Leaves of the tree keep the actual
  values from the map. Intermediate nodes consist of the following four parts:

    - Hash of the left child value
    - Hash of the right child value
    - Key for the left child node
    - Key for the right child node

Both `ListTable` and `MerkleTable` support updating by index and
appending only; `MapTable` and `MerklePatriciaTable` allow inserting,
updating or deleting key-value pairs.

### Proofs

`MerkleTable` and `MerklePatriciaTable` allow efficiently
creating a proof that specific values are saved under particular keys.
To prove that, it is sufficient to return a list of hashes from
the tree root to a particular cell (a Merkle path). Merkle Patricia
tables also allow to generate proofs that there is no data in the
database with a specific key.

When a full node communicates with a light client, proofs are returned together
with the requested data. This allows to prove data authenticity efficiently.

## Modularity and Services

!!! tip
    See the [*Services*](../architecture/services.md) article
    for more details.

Besides the core, Exonum includes the framework for building **services**.
While the Core is responsible for the consensus, and provides middleware
functionality for sending and receiving transactions and blocks,
services implement all business logic of the blockchain
and are the main point to extend Exonum functionality.

Exonum services interact with the external world with the help of *endpoints*.
A service may define 3 types of endpoints:

- **Transactions** correspond to `POST`/`PUT` methods for
  RESTful web services. They transform the blockchain state. All transactions
  within the blockchain are completely ordered as described above,
  and the result of their execution is agreed among the full nodes in the
  blockchain network
- **Read requests** correspond to `GET` methods for web services. They
  retrieve information from the blockchain, possibly together with proofs.
  Read requests are executed locally, are not globally ordered,
  and cannot modify the blockchain state
- **Private endpoints** provide an administrative interface to the local
  instance of the service. They could be used to adjust local service
  configutation, e.g., manage secret keys specific to the service.
  Private endpoints are executed locally, are not globally ordered, and
  cannot modify the blockchain state directly (although they
  can generate transactions and push them to the network)

!!! note
    Another type of endpoints, *events*, [is coming soon](../dev/roadmap.md).
    Events will implement the [pub/sub architecure pattern][wiki:pubsub],
    allowing light clients and services to subscribe to events emitted
    by services.

External applications may communicate with service endpoints
via HTTP REST API, using JSON as the serialization format.
Exonum facilitates middleware tasks for services, such as listening to HTTP requests,
dispatching incoming transactions and read requests to an appropriate service,
performing conversion to and from JSON, etc.

As services are Rust modules, they can be easily reused across Exonum
projects. You may use open source services already written by the
community, or open your service for other uses.

### Smart Contracting

Endpoints defined by services fulfill the same role as smart contracts
in other blockchain platforms. They define business logic of the blockchain,
allow to retrieve data from the blockchain, and can be reused accross
different projects. Partial analogies for this execution model are
endpoints of RESTful web services and stored procedures for DBMSs.

The key points differentiating Exonum smart contracts from other models
used in blockchains are as follows:

- **Restricted environment.** Exonum executes only predefined request types,
  not allowing to execute untrusted code received from a client. This
  results in a more controlled environment, and makes it easier to argue
  about smart contract safety
- **No isolation.** Request processing is performed
  in the same execution context as the core of the system. This is beneficial
  for performance, although has certain security risks
- **Local state.** Exonum services may define a local state, which is
  specific to the node on which the service is running. The local state
  can be used to manage secret information (e.g., private keys). The local
  state may be managed by private service endpoints. By utilizing
  the local state, services can be more proactive than their counterparts
  in other blockchains. For example, [the anchoring service](#anchoring-service)
  uses the local state to fully automate anchoring transaction signing
- **Split transaction processing.** Transaction verification is a separate step
  of transaction processing. It is performed immediately after receiving
  the transaction, before applying the transaction to the blockchain state. Verification
  may include authentication checks (for example, verifying the transaction signature),
  as well as other structural checks over the transaction contents.
  At the same time, transaction verification has no access to the current
  blockchain state

!!! note
    Service execution isolation is a high-priority task
    on [the Exonum roadmap](../dev/roadmap.md).

### Existing Services

#### Configuration Update Service

!!! tip
    See the [*Configuration Update Service*](../advanced/services/configuration.md)
    article for more details.

Although every node has its own configuration file, some settings should
be changed for all nodes simultaneously. This service allows updating
configuration through the blockchain itself.

Using the configuration update service, any validator may propose new
configuration and other validators vote for it. A proposal needs approval
from the supermajority of the validators to become accepted;
however, it still is inactive and
current settings are still used. New configuration includes
`actual_from` parameter pointing to the blockchain height, upon reaching
which the new configuration activates.

#### Anchoring Service

!!! tip
    See the [*Anchoring Service*](../advanced/services/anchoring.md)
    article for more details.

The anchoring service writes the hash of the current Exonum blockchain state
to the Bitcoin blockchain with a certain time interval. The anchored data is
authenticated by the supermajority of validators using digital signature tools
available in Bitcoin.

Anchoring increases security; even if a malefactor takes
control over every validator or all validators collude,
it’s impossible to change the transaction log unnoticeably. After any change,
retroactively modified block hashes would differ from the one recorded on
the Bitcoin blockchain.
To change the data on the Exonum blockchain retroactively, an attacker would need
to compromise the Bitcoin blockchain too. The cost of such an attack would measure
in billions of US dollars.

Additionally, the anchored data together with proofs remains
verifiable even if the underlying Exonum blockchain would become inaccessible
for some reason. This property could be used to provide durable electronic receipts.

## Cryptography

### Hashing

Exonum uses [SHA-256][wiki:sha256] for all hash operations, including creating
transaction and block identifiers, computing Merkle and Merkle Patricia trees,
and mapping keys for Merkle Patricia trees to fixed-length byte buffers.

### Public-key Cryptography and Key Management

Both transactions and consensus messages are authenticated with the help
of [Ed25519 digital signatures][wiki:ed25519] implemented using [sodiumoxide][sodiumoxide]
(a [libsodium][libsodium] wrapper for Rust).
In most cases, transactions are created by the external entities
(such as light clients); these entities are assumed to manage the corresponding
signing keys. Keys can also be managed by full nodes themselves. In this case,
a private key is stored in the local configuration of the node, does not enter
the blockchain and is specific to a particular node. It’s a good practice
to manage such keys locally via private APIs of the corresponding service.

The Exonum core defines two pairs of Ed25519 keys for full nodes:

- **Consensus key** is used for signing consensus messages (for validators) and
  signing network messages (for validators and auditors)
- **Administrative key** is specific to validators and is used for administrative
  tasks (such as voting for configuration updates)

Services may utilize additional key pairs, including from other cryptosystems.
For example, the anchoring service defines an additional secp256k1 key pair
for signing anchoring transactions in Bitcoin.

**Warning.** Presently, the local configuration of the node (which includes all
its private keys, both used in consensus and by the services) is stored in plaintext.
This is going to be fixed soon.

!!! note
    Presently, the administrative keys are hot (i.e., stored in the unencrypted
    form during the node operation). In the future releases, they will be able to
    be managed as externally stored cold keys (i.e., the node would not have
    access to the administrative key at all). Additionally, the 1-to-1 correspondence
    between consensus and administrative keys will be generalized to support various
    administrative settings.

[wiki:oltp]: https://en.wikipedia.org/wiki/Online_transaction_processing
[wiki:state-machine-repl]: https://en.wikipedia.org/wiki/State_machine_replication
[level-db]: http://leveldb.org/
[rocks-db]: http://rocksdb.org/
[wiki:sha256]: https://en.wikipedia.org/wiki/SHA-2
[wiki:ed25519]: https://en.wikipedia.org/wiki/EdDSA
[libsodium]: https://download.libsodium.org/doc/
[sodiumoxide]: https://dnaq.github.io/sodiumoxide/sodiumoxide/
[wiki:pubsub]: https://en.wikipedia.org/wiki/Publish%E2%80%93subscribe_pattern
