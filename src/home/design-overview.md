# About this page

The Exonum framework is structured as follows: 

- [Transaction processing](#transaction-processing) describes **TODO**
- [The network structure](#the-network-structure) lists types on which
  Exonum nodes are divided.
- [Consensus](#consensus) explains how nodes agree on the blockchain
  state.
- [Data Storage](#data-storage) describes how data is saved locally and
  introduces the proofs mechanism.
- [Smart contracts](#smart-contracts) shows how Exonum execute custom
  logic.
- [Modularity and services](#modularity-and-services) introduces services
  and explains what they are used for.

This page describes the operation of these components and how they can be used in the development on top of Exonum.

## Transaction processing

Blockchain is literally a chain of blocks. Every next block includes the
hash of the previous block; so, it is impossible to change one block
without the appropriate changes for the each of the following blocks. In
the matter, a blockchain is just a data storage with additional
properties and requirements for the underlying data.

Different to the usual databases, a blockchain do not hold the data
tables content directly. Instead, it holds every transaction that
creates a new data value or changes the already existed data. Therefore,
we can see the whole history of any data chunk. However, for the outer
application, the blockchain represents just a usual Key-Value storage.

Exonum blocks consist of the following parts:

1. The hash of the previous exonum block.
2. The list of the approved transactions. When the other nodes execute
  the block, they execute every transaction in the given order and apply
  changes to their data storages. Every transaction type is executed by
  the appropriate Exonum service.
3. The hash of a new data storage state. The state itself is not
  included; however, transactions are applied deterministically and
  unequivocally. The agreement on the hash of data storage is a part of
  the Exonum consensus algorithm, so it is guaranteed to coincide for all
  validators.

## The network structure

The network consist of a big amount of the connected peer-to-peer nodes.
These nodes have different rights and different functionality.

1. The full-nodes replicate the entire contents of the blockchain. They
  can generate new transactions but they cannot choose which transactions
  should be adopted. They cannot generate new blocks.
2. The validators provide the network liveness. Despite of the big
  amount of the nodes presented in the network, only validators can
  generate new blocks or vote for other block proposals. Other nodes just
  create business transactions and send them to the network. Validators
  receive these txs, check them, and include into the new block. The list
  of the validators is strictly limited, and normally should consist of
  4-15 nodes.
3. Thin clients do not need an every byte of the blockchain, so they
  held only part they are interested in. To get new (or absent)
  information they call to the full-nodes. Exonum provides a "proofs
  mechanism", allowing Thin clients to check if the full-node answered
  fairly. Basing on Merkle / Merkle Patricia tables, such mechanism allow
  checking if the node really keeps a shown value in its data storage.
  Full-node cannot generate "fake" answer or fool around the client.

## Consensus

Exonum uses the custom modification of Byzantine Fault-Tolerance
Consensus to guarantee that in any time there is just one true version
of the blockchain. To do so, the consensus between validators is needed
in a decentralized environment where any node is allowed to fail.

When the validator generates a new block proposal, it sends it to the
other validators. Every other validator checks the proposal and vote for
it. After the new block proposal gets supermajority of votes, this block
is considered to be adopted. Validators broadcast it to other
full-nodes.

To generate a new block and vote upon it, the time is divided into the
rounds. For every round, there is predefined Leader node. The Leader
creates its block proposal in his round and sends it to other
validators. Others check the proposal, and if it is correct, vote for
it. If there is a supermajority of validators voted for any common
proposal, the one is appointed to be a new block.

If the Leader is turned off or did not generate appropriate block
proposal, then the new round starts and the new Leader node appears.

If you are interested in the Consensus, Leader Election procedure or
Block Generation procedure, you may refer to [Consensus
details](../advanced/consensus/consensus), [Leader Election
algorithm](../advanced/consensus/leader-election)

## Data Storage

### LevelDB

LevelDB is used to keep locally the data that transactions operate with.
It was chosen for its high efficiency and minimal storage overhead.
Other databases will be also featured in the future releases.

### Data storage table types

Two types of data tables may be used in the project: Array and Key-Value
storage. Both of them support persistency and proofs mechanism.

Arrays are stored in the [Merkle Tree](../advanced/merkle-index) tables.
Such a tree is binary and balanced, although not necessarily efficiently
binary. The leafs keep the actual values, while the nodes keep the
hashes from concatenated children data. It is allowed only to append the
data or update the cells already stored.

Key-Value Storages are stored in the [Merkle Patricia
Tree](../advanced/merkle-patricia-index) tables. The leafs keep the
actual values. The intermediary nodes values consist of the following 4
parts:

- Hash from the left child value
- Hash from the right child value
- Key for the left child node
- Key for the right child node

KVS allow inserting, updating or deleting key-value pairs.

### Proofs

Tree structures allows creating a proof that specific values are saved
in the particular data cells. To prove that, it is sufficient to return
a list of hashes from the tree root to the particular cell. Wherein, the
Merkle Patricia Tables also allow to generate proofs that there is no
data in the database with specific key `K`. That is, when the full nodes
send info to the thin client, it also add a proof that actual value is
shown one.

You may delve into the details about data storage and proofs mechanism
here: [Data Storage, Merkle trees and proofs](../architecture/storage)

## Smart contracts

Here should be a deep text about smart contracts. **TODO: do**

## Modularity and services

Exonum Framework includes the Core and the set of optional pluggable
services. While the Core is responsible for the consensus, and provides
transactions and blocks to be sent and received, services implement all
the custom logics and are the main point to extend Exonum functionality.

Services are used for two main purposes:

1. They define types of transactions proceeded by Exonum, and implement
  its execution logics. The application may include multiple independent
  services, and each of them processes its own transactions list.
2. Services may implement event handlers and listen for the different
  blockchain actions. For example, `handle_commit` is executed after new
  block applies to the data storage. Outer applications may communicate
  with services using REST-API written on [IRON][iron].

We represent the following optional services just now:

1. Configuration Update service. Although every node has its own
  configuration file, some setups should be changed for every node
  simultaneously. This service allows updating configuration through the
  blockchain itself. In addition, administrators may apply new
  configuration values without node restarting. More detailed description
  can be found here: [Configuration
  service](../advanced/services/configuration).
2. Anchoring service. It writes the hash of the current blockchain state
  to the bitcoin blockchain. It brings new guarantees: even if the
  malefactor takes control over every validator, he cannot rebuild
  blockchain and change old transactions quietly. If he tries so, then the
  hash of the new block would differ from the one written in the bitcoin
  blockchain. Every other node would check it and alert about a mismatch.
  Therefore, the anchoring service gives additional durability: to change
  the data retroactively the hacker should hack bitcoin blockchain, and it
  is impossible just now. To get more about anchoring, you may refer to
  [Anchoring service specification](../advanced/services/anchoring.md).

To get more how services may be written, you may refer to [Services
section](../architecture/services).

[iron]: http://ironframework.io/

