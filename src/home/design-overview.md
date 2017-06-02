# Design Overview

This page describes the core design decisions of the Exonum framework.

- [Transaction processing](#transaction-processing) describes Exonum blocks
  and transactions lifecycle
- [Network structure](#network-structure) describes how Exonum network operates
- [Consensus](#consensus) explains how nodes agree on the blockchain
  state
- [Data storage](#data-storage) describes how data is saved locally and
  introduces the proofs mechanism
- [Smart contracts](#smart-contracts) shows how Exonum execute custom
  logic
- [Modularity and services](#modularity-and-services) introduces services
  and explains what they are used for
- [Cryptography](#cryptography) briefly describes main crypto-primitives used
  in Exonum

## Transaction Processing

**Tip.** See the [*Transactions*](../architecture/transactions.md) article
for more details.

For an outer application, an Exonum blockchain represents a key-value
storage. Its core functions are persisting data and responding to
read queries from external clients.

**Transactions** are the main entity Exonum works with. A transaction represents
an atomic patch that should be applied to the key-value storage. Transactions need
to be verified and ordered before they are considered accepted / committed.
Both these tasks are performed by [the consensus algorithm](#consensus).

All data in the Exonum blockchain is divided into two parts:

- **Data storage**, which contains data structured into tables
- **Trasaction log**, i.e., the complete history of all transactions ever applied
  to the data storage

As transactions include operations on the key-value storage such as creating
new value, or updating already saved values, the actual data storage state
can be restored completely from the list of the transactions.
When a new node in the Exonum network appears, it loads
already generated blocks and applies its transactions to the data
storage one by one. Such approach allows seeing the whole history of any
data chunk and simplify auditing.

By using a transaction log, Exonum implements [state machine
replication][wiki:state-machine-repl]. It guarantees agreement of data
storage states among nodes in the network. The same approach is often used by
non-blockchain distributed DBs, such as Mongo or PostgreSQL.

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
without the appropriate changes for the each of the following blocks.
This ensures immutability of the transaction log; once a transaction is committed,
it cannot be retroactively modified or evicted from the log. Similarly,
it's impossible to insert a transaction in the middle of the log.

## Network Structure

**Tip.** See separate articles for more details: [*Network*](../advanced/network.md),
[*Clients*](../architecture/clients.md).

The Exonum network consists of *full nodes* connected via peer-to-peer connections,
and *thin clients*.

### Full Nodes

**Full nodes** replicate the entire contents of the blockchain
and correspond to replicas in distributed databases.
All the full nodes are authenticated with public-key cryptography.
Full nodes are further subdivided into 2 categories:

- **Auditors** replicate the entire contents of the blockchain. They
  can generate new transactions but cannot choose which transactions
  should be committed (i.e., cannot generate new blocks)
- **Validators** provide the network liveness. Only validators can generate
  new blocks by using a [Byzantine fault tolerant consensus algorithm](#consensus).
  Validators receive transactions, verify them, and include into a new block.
  The list of the validators is restricted by network maintainers, and normally
  should consist of 4-15 nodes

### Thin Clients

**Thin clients** represent clients in the client-server paradigm; they connect
to full nodes to retrieve information from the blockchain they are
interested in, and to send transactions. Exonum provides a "proofs
mechanism", allowing thin clients to check if the full-node answered
fairly. Based on cryptographic commitments via Merkle / Merkle Patricia trees,
this mechanism allows verifying that a response from the full node
has been really authorized by supermajority of validators.

## Consensus

**Tip.** See separate articles for more details: [*Consensus*](../advanced/consensus/consensus.md),
[*Leader Election*](../advanced/consensus/leader-election.md).

Exonum uses the custom modification of Byzantine fault tolerant
consensus (similar to PBFT) to guarantee that in any time there is one agreed version
of the blockchain. It is assumed that the environment is decentralized,
i.e., any node is allowed to fail or be compromised.

To generate a new block and vote upon it, a 3-phase approach is used.

- The consensus algorithm is divided into rounds, the beginning of which is determined
  by each validator based on its local clock.
  For every round, there is a predefined leader validator. The leader
  creates a *block proposal* and sends it to other validators
- Other validators check the proposal, and if it is correct, vote for
  it by broadcasting *prevote* messages to the validators
- If a validator collects prevote messages for the same proposal from a supermajority
  of validators, it executes transactions in the proposal, creates a *precommit*
  message with the resulting data storage state and broadcasts it to the validators
- Finally, if there are precommits from a supermajority of validators for a common
  proposal, the proposal becomes a new block

The consensus algorithm can withstand up to 1/3 of the validators acting maliciously,
being switched off or isolated from the rest of the network.
This is the best possible amount under the conditions in which the Exonum
consensus operates (partial synchrony, which can be roughly summarized as
the absence of reference time in the system). For example, a leader may not
generate a proposal in time, or send different proposals to different validators;
eventually, all honestly acting validators will agree on the same new block.

## Data Storage

**Tip.** See the [*Data Storage*](../architecture/storage.md) article
for more details.

### LevelDB

[LevelDB][level-db] is used to persist locally the data that
transactions operate with. It provides high efficiency and
minimal storage overhead.
[RocksDB][rocks-db] will be also featured in the future releases.

### Table Types

Exonum supports multiple types of data tables, representing typed collections:
lists and maps:

- `ListTable` implements an array list
- `MapTable` represents a usual key-value storage
- [`MerkleTable`](../advanced/merkle-index) is an enhanced version of
  array storage. It implements a balanced (but not necessarily full) binary
  Merkle tree. Leaves of the tree keep the
  actual array items, while the nodes keep the hashes from concatenated
  children data. It is allowed only to append the data or update the cells
  already stored
- [`MerklePatriciaTable`](../advanced/merkle-patricia-index) extend the
  map. It is based on the Merkle Patricia Tree. Leaves keep the actual
  values. The intermediary nodes values consist of the following four parts:

    - Hash from the left child value
    - Hash from the right child value
    - Key for the left child node
    - Key for the right child node

Both `ListTable` and `MerkleTable` support updating by index and
appending only; `MapTable` and `MerklePatriciaTable` allow inserting,
updating or deleting key-value pairs.

### Proofs

`MerkleTable` and `MerklePatriciaTable` allow
creating a proof that specific values are saved under particular keys.
To prove that, it is sufficient to return a list of hashes from
the tree root to the particular cell (a Merkle path). Merkle Patricia
Tables also allow to generate proofs that there is no data in the
database with a specific key `K`.

When a full node communicates with a thin client, proofs are returned together
with the requested data. This allows to prove data authenticity efficiently.

## Smart Contracts

Here should be a deep text about smart contracts. **TODO: do**

## Modularity and Services

**Tip.** See the [*Services*](../architecture/services.md) article
for more details.

Exonum includes the Core and the set of optional pluggable
services. While the Core is responsible for the consensus, and provides middleware
functionality for sending and receiving transactions and blocks,
services implement all
the custom logics and are the main point to extend Exonum functionality.

Services have two main purposes:

- Services define types of transactions processed by Exonum, and implement
  the execution logics for each type. The application may include multiple
  independent services, and each of them processes its own transactions
  list
- Services may implement event handlers and listen for the different
  blockchain actions. For example, `handle_commit` is executed after new
  block applies to the data storage.

Outer applications may communicate with services via HTTP REST API.

As services are just Rust modules, they can be reused in the different Exonum
projects. You may take a open source services already written by the
community, or open your service for other users.

### Existing Services

#### Configuration Update Service

**Tip.** See the [*Configuration Service*](../advanced/services/configuration.md)
article for more details.

Although every node has its own configuration file, some setups should
be changed for all nodes simultaneously. This service allows updating
configuration through the blockchain itself.

Using the configuration update service, any validator may propose new
configuration and other validators vote for it. Proposal needs validators
supermajority to become accepted; however, it still is inactive and
current settings are still used. New configuration includes
`actual_from` parameter pointing to the blockchain height, upon reaching
which the new configuration activates.

#### Anchoring Service

**Tip.** See the [*Anchoring Service*](../advanced/services/anchoring.md)
article for more details.

The anchoring service writes the hash of the current Exonum blockchain state
to the Bitcoin blockchain with a certain time interval. The anchored data is
authenticated by the supermajority of validators using digital signature tools
available in Bitcoin.

Anchoring increases security; even if a malefactor takes
control over every validator or all validators collude,
it's impossible to change the transaction log unnoticeably. After any change,
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
the blockchain and is specific to a particular node. It's a good practice
to manage such keys locally via private APIs of the corresponding service.

The core uses two pairs of Ed25519 keys:

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

**Notice.** Presently, the administrative keys are hot (i.e., stored in the unencrypted
form during the node operation). In the future releases, they will be able to
be managed as externally stored cold keys (i.e., the node would not have
access to the administrative key at all). Additionally, the 1-to-1 correspondence
between consensus and administrative keys will be generalized to support various
administrative settings.

[wiki:state-machine-repl]: https://en.wikipedia.org/wiki/State_machine_replication
[level-db]: http://leveldb.org/
[rocks-db]: http://rocksdb.org/
[wiki:sha256]: https://en.wikipedia.org/wiki/SHA-2
[wiki:ed25519]: https://en.wikipedia.org/wiki/EdDSA
[libsodium]: https://download.libsodium.org/doc/
[sodiumoxide]: https://dnaq.github.io/sodiumoxide/sodiumoxide/
