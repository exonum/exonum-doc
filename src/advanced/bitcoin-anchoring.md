# Anchoring Service

<!-- cspell:ignore bitcoind,satoshis,txid,utxo,utxos -->

The anchoring service is developed to increase product security and
provide non-repudiation for Exonum applications. This service periodically
publishes the Exonum blockchain block hash to the Bitcoin blockchain, so that
it is publicly auditable by anyone having access to the Exonum blockchain.
Even in the case of validators collusion, transaction history cannot be
falsified. The discrepancy between the actual Exonum blockchain state and the
one written to the Bitcoin blockchain will be found instantly.

!!! note
    This page mostly describes how the service functions. There is a
    separate page, describing how the service should be
    [configured and deployed][anchoring-deploy]. The source code is located
    [on GitHub][github-anchoring].

## General Idea

The service writes the hash of the latest Exonum block to the permanent
read-only persistent storage available to everyone. This block is called
_anchored block_, and its hash will be referred to as _anchored hash_.

The service builds the _anchoring chain_ on top of the Bitcoin blockchain,
which consists of multiple _anchoring transactions_.
Each anchoring transaction has at least 1
input and only 2 outputs: the data output and the change output.
The data output contains the stored anchored hash,
and the change output transfers the remaining bitcoins back to
the Bitcoin anchoring address, so that it could be
spent on the next anchoring transaction.

```none
             funding tx
                       \
      tx1        tx2    \   tx3        tx4
.. --> change --> change --> change --> change --> ..
   \          \          \          \
    -> data    -> data    -> data    -> data
```

Sometimes additional inputs called [funding UTXO](#funding-utxo) are
used. Such inputs are necessary to refill the balance of the anchoring chain
that is spent on transaction fees.

## Anchoring Transactions

### Multisig Address as Decentralization Method

Anchoring process is decentralized using Bitcoin multi-signatures.
Namely, the anchoring transactions are jointly authorized
by the *anchoring nodes*. The set of anchoring nodes can change
over the network evolution.

Nodes performing anchoring are not necessarily [validator nodes](../glossary.md#validator).
A validator node can abstain from anchoring,
and vice versa: an anchoring node is not required to be a validator.
However, it is recommended to keep one-to-one relationship between
the anchoring and validator nodes in order to maximize fault tolerance
and security of the network.

When an Exonum blockchain should be anchored, the anchoring transaction
is built using a [deterministic algorithm](#creating-anchoring-transaction).
Its results are guaranteed to match for every honest anchoring node. The
anchoring transaction spends one or more UTXOs from the current anchoring
multisig address. Every anchoring node can sign this transaction independently,
as specified by Bitcoin. All signatures are published into the Exonum blockchain.
After the necessary amount of signatures is gathered, the anchoring nodes
commit the signed anchoring transaction to the Bitcoin blockchain.

The anchoring service uses `M`-of-`N` multisig addresses, where `N` is a number of
anchoring nodes (`N <= 20` because of Bitcoin restrictions) and `M`
is the necessary amount of signatures. By analogy with the Exonum consensus,
it is recommended to set `M = floor(2/3*N) + 1`
for [Byzantine fault-tolerance](../glossary.md#byzantine-node).

!!! example
    If there are `N = 10` anchoring nodes, then `M = 7` represents a supermajority.
    That means, 7 signatures are required to build an anchoring transaction.
    If `N = 4`, then `M = 3` signatures are required.

### Transaction Malleability and SegWit

Signatures over anchoring transactions produced by the anchoring nodes
are openly written in the Exonum blockchain. More than `M` signatures
can be published per transaction (in fact, this is a common case).

The anchoring service applies
[Segregated Witness][segwit] to build anchoring bitcoin transactions.
Since signatures are not a part of the SegWit transaction hash, the number
and order of signatures over a transaction do not influence the
[transaction identifier][transaction_malleability]. In this way
anchoring transactions are fully deterministic – a new transaction is determined
based on the latest anchoring transaction and the current Exonum state hash to
be anchored.

Moreover, as it is not possible to mutate a SegWit anchoring transaction,
there is no need to wait until it is confirmed in Bitcoin to continue
with anchoring. The following anchoring transaction(s) may be safely suggested
without such confirmations.  

### Anchoring Transaction Proposal

An anchoring transaction proposal is constructed as follows:

- It conforms to the Bitcoin transaction specification.
- Its inputs are:

    - The change output of the new anchoring transaction. This input is present
    in every anchoring transaction except the first one.
    - The funding UTXO written in the global configuration (if it has not been
    spent yet).

- Its outputs contain data output and change output only. The
  change output goes first, and the data output goes second.
- Its data output contains a single `OP_RETURN` instruction with the
  anchored data. Such data consist of multiple [data chunks](#data-chunks)
- Its change output reroutes funds to the next anchoring address if the
  anchoring address should be changed. Otherwise, the current address is used.

### Data Chunks

The data output consists of the following parts:

- an OP_RETURN instruction (`0x6a`)
- 1 byte containing the length of data in the script
- `EXONUM` in the ASCII encoding (`0x45 0x58 0x4f 0x4e 0x55 0x4d`)
- a 1-byte version of the current data output, currently `1`
- a 1-byte type of payload: `0` if only the anchored hash is included,
  `1` if both chunks are used
- 40 bytes of the anchored hash data chunk
- (optional) 32 bytes of a recovery data chunk

All integer chunk parts are little-endian, as per the general guidelines
of the Bitcoin Script.

In total, the anchoring transaction payload usually takes 48 bytes
and enlarges to 80 bytes when recovery is needed.

#### Anchored Hash Data Chunk

- 8-byte zero-based height of the anchored block (i.e., the
  height of the genesis block is `0`) which is used for efficient lookups.
- 32-byte block hash

#### Recovery Data Chunk

The data of the recovery chunk is a 32-byte Bitcoin
transaction hash. This hash shows that the current anchoring chain is
a prolongation of the previously stopped anchoring chain. The possible
reasons for such stops are described further.

The recovery chunk is optional and may appear in the very first Bitcoin
anchoring transaction only if the previous anchoring chain failed,
as described in [*Recovering Broken Anchoring*](#recovering-broken-anchoring).

### Creating Anchoring Transaction

- Set the `anchoring_interval` - the interval in Exonum blocks between creating
  anchoring transactions.
- When the corresponding height of the Exonum blockchain is reached, an
  anchoring transaction is determined based on the UTXO of the latest
  anchoring transaction and the hash of the corresponding Exonum block. The
  first anchoring transaction in the chain uses the UTXO of the funding
  transaction.
- Every anchoring node has an external [synchronization utility][btc_anchoring_sync]
  that produces signatures over the new anchoring transaction.
  The anchoring nodes submit these signatures within transactions to the
  anchoring service.
- When the anchoring service receives a signature, it is checked and (if correct)
  stored in the service state. When the number of signatures for the
  new anchoring transaction reaches the required threshold `M`,
  the anchoring transaction appears in the table of anchoring transactions
- The [synchronization utility][btc_anchoring_sync] performs syncs
  the signed anchoring transactions with the Bitcoin network. Even
  if some committed anchoring transactions are lost from the network due to a fork,
  the utility will send them to Bitcoin once again.

## Setup and Configuration

Anchoring requires additional
[configuration parameters](supervisor.md#service-configuration) to
be set. The setup and deploy guide is
in the [GitHub repository of the service][newbie-guide].

### Local Configuration

#### Bitcoin Node

The service uses a third-party Bitcoin node to communicate with the
Bitcoin blockchain network. Currently, only [Bitcoin Core][bitcoind]
(aka `bitcoind`) is supported.

The following settings need to be specified to access a `bitcoind` node:

- RPC host
- RPC username
- RPC password

!!! tip
    It is strongly advised to have a separate Bitcoin node for each
    anchoring node. Otherwise, a single Bitcoin node becomes
    a centralization point and presents a weakness in the anchoring process.

#### Bitcoin Private Keys

Every anchoring node should possess its own secp256k1 EC keypair in order to
participate in the anchoring process. The private key should be strongly
secured.

#### Synchronization with Bitcoin Blockchain

A separate [utility][btc_anchoring_sync] periodically performs
the following actions:

1. Creates a signature for a new anchoring transaction. The utility takes the
  current anchoring transaction proposal using the [private API](../glossary.md#private-api),
  signs it with the corresponding Bitcoin key and sends the resulting signature
  back to the anchoring node. Anchoring node creates a new Exonum transaction
  from this signature and broadcasts it to the other nodes.

2. Synchronizes the list of Exonum anchoring transactions with those committed
  to the Bitcoin Blockchain. The utility takes the latest anchoring transaction
  and checks whether it is committed in Bitcoin.
  If not, the handler checks the previous anchoring transactions one by one
  until it finds the last anchoring transaction committed to the Bitcoin
  blockchain. The handler then pushes all the uncommitted anchoring transactions
  to Bitcoin.

### Global Configuration

#### Bitcoin Public Keys

Public keys corresponding to [private keys](#bitcoin-private-keys)
of the anchoring nodes.

#### Transaction Fees

Transaction fee represents a value in satoshis that is set as a fee for
every anchoring transaction. It is recommended to set a 2x-3x times bigger
transaction fee than the average market fee to ensure that the anchoring
transaction does not hang if the Bitcoin network is congested.

#### Anchoring Schedule

This parameter defines the distance between anchored block heights
on the Exonum blockchain.

!!! example
    If the interval is set to 1000 blocks, then blocks `#1000`, `#2000`,
    `#3000`, ... will be anchored.

!!! tip
    The interval may be chosen so that under normal conditions the
    interval between anchored blocks is between 10 minutes and 1 hour.

#### Funding UTXO

To refill the anchoring address balance, a Bitcoin funding transaction that
sends money to the current anchoring address should be generated.
Such transaction should be manually added to the service configuration.

The funding UTXO should get enough confirmations before it can be used.
However, the anchoring service does not check the number of confirmations
for the provided funding transaction; it is the administrators’ duty.

## Maintenance

The maintenance guide can be found [in the GitHub repository][maintenance-guide]
of the service.

## Recovering Broken Anchoring

If the anchoring chain is broken, administrators must generate a new
funding transaction to the new anchoring address and add it to the
global configuration as the funding UTXO. A new anchoring chain will be
produced,
starting with this funding transaction. The very first anchoring transaction
from this chain will include the optional
[anchoring recovery data chunk](#recovery-data-chunk) in the data output.

## HTTP API

The service provides HTTP API described in
the anchoring [crate documentation][anchoring-crate-doc].

[anchoring-deploy]: https://github.com/exonum/exonum-btc-anchoring/blob/master/guides/newbie.md
[github-anchoring]: https://github.com/exonum/exonum-btc-anchoring
[bitcoind]: https://bitcoin.org/en/bitcoin-core/
[transaction_malleability]: https://en.bitcoin.it/wiki/Transaction_malleability#Segwit
[segwit]: https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki
[btc_anchoring_sync]: https://github.com/exonum/exonum-btc-anchoring/blob/master/src/bin/btc_anchoring_sync.rs
[maintenance-guide]: https://github.com/exonum/exonum-btc-anchoring/blob/master/guides/maintenance.md
[newbie-guide]: https://github.com/exonum/exonum-btc-anchoring/blob/master/guides/newbie.md
[anchoring-crate-doc]: https://docs.rs/exonum-btc-anchoring/latest/exonum_btc_anchoring/api/index.html
