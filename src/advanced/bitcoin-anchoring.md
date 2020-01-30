# Anchoring Service

<!-- cspell:ignore bitcoind,blockhash,satoshis,txid,utxo,utxos -->

The anchoring service is developed to increase product security and
provide non-repudiation for Exonum applications. This service periodically
publishes the Exonum blockchain block hash to the Bitcoin blockchain, so that
it is publicly auditable by anyone having access to the Exonum blockchain.
Even in the case of validators collusion, transaction history cannot be
falsified. The discrepancy between the actual Exonum blockchain state and the
one written to the Bitcoin blockchain will be found instantly.

This document describes the **anchoring service operable with Exonum v1.0+**.
For information on the anchoring service compatible with all previous versions
of the framework, please refer to a
[separate document](bitcoin-anchoring-without-segwit.md).

!!! note
    This page mostly describes how the service functions. There is a
    separate page, describing how the service should be
    [configured and deployed][anchoring-deploy]. The source code is located
    [on GitHub][github-anchoring].

## General Idea

The service writes the hash of the latest Exonum block to the permanent
read-only persistent storage available to everyone. This block is called
_anchored block_, and its hash is referred to as _anchored hash_
further.

The service builds the _anchoring chain_ on top of the Bitcoin blockchain,
in other words, the chain consists of multiple _bitcoin
anchoring transactions_. Each anchoring transaction has at least 1
input and only 2 outputs: data output and change output. Data output
contains the stored anchored hash, while the change output transfers the
remaining money back to the Bitcoin anchoring address, so that it could be
spent on the next anchoring transaction.

```None
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

Decentralization during the anchoring process is built over the internal
Bitcoin multisignature address architecture.

When the Exonum network should be anchored, an anchoring transaction is built
based on a [deterministic algorithm](#creating-anchoring-transaction).
Its results are guaranteed to match for every honest validator. This
anchoring transaction spends one or more UTXOs from the current anchoring
multisig address. Every validator can sign this transaction without regard for
other validators, as it is allowed by Bitcoin. All signatures are
published into the Exonum blockchain.

Exonum uses `M-of-N` multisig addresses, where `N` is a number of
anchoring validators (`N <= 20` because of Bitcoin restrictions) and `M`
is the necessary amount of signatures. In the Exonum consensus, `M =
floor(2/3*N) + 1` is used as a supermajority.

!!! note
    If there are `N=10` validators, then `M=7` represents a supermajority.
    That means, 7 signatures are required to build an anchoring transaction.
    If `N=4`, then `M=3` signatures are required.

After the necessary amount of signatures is gathered, a synchronization method
commits a signed anchoring transaction to the Bitcoin blockchain.

### Transaction Malleability and SegWit

Validators signatures over anchoring transactions are openly written in the
Exonum blockchain; more than `M` signatures can be published (it is a common
case).

The anchoring service applies
[Segregated Witness][segwit] for building anchoring bitcoin transactions.
Since signature data is not a part of the SegWit transaction hash, the number
and order of signatures put over a transaction no longer influence the
[transaction identification][transaction_malleability]. In this way
anchoring transactions are fully deterministic – a new transaction is determined
based on the latest anchoring transaction and the current Exonum state hash to
be anchored.

Moreover, as it is not possible to mutate a SegWit anchoring transaction,
there is no need to wait every time for confirmations from the Bitcoin
Blockchain that a new anchoring transaction has been committed into the network.
The following anchoring transaction(s) may be safely suggested without such
confirmations.  

Exonum uses a [`bitcoind` client](#bitcoind-node), and the transaction
determined by the service is considered valid by the `bitcoind` node.

### Anchoring Transaction Proposal Detailed Structure

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
  anchored data. Such data consist of multiple [data
  chunks](#data-chunks)
- Its change output reroutes funds to the next anchoring address if the
  anchoring address [should be changed](#changing-validators-list).
  Otherwise, the current address is used.

### Data Chunks

The data output consists of the following parts:

- an OP_RETURN instruction (`0x6a`)
- a 1-byte containing the digit corresponding to the length of data in the
  script
- `EXONUM` in the ASCII encoding (`0x45 0x58 0x4f 0x4e 0x55 0x4d`)
- a 1-byte version of the current data output, currently `1`
- a 1-byte type of payload: 0 if only the anchored hash is included, 1 if
  both chunks are used
- 40 bytes of the anchored hash data chunk
- (optional) 32 bytes of a recovering data chunk

All integer chunk parts are little-endian, as per the general guidelines
of the Bitcoin Script.

In total, the anchoring transaction payload usually takes 48 bytes
and enlarges to 80 bytes when recovering is needed.

#### Anchored Hash Data Chunk

- 8-byte zero-based unsigned height of the anchored block (i.e., the
  height of the genesis block is `0`) which is used for efficient lookups.
- 32-byte block hash

#### Recovery Data Chunk

The data of the recovery chunk is a 32-byte Bitcoin
transaction hash. This hash shows that the current anchoring chain is
a prolongation of the previously stopped anchoring chain. The possible
reasons for such stops are described further.

The recovery chunk is optional and may appear in the very first Bitcoin
anchoring transaction only if the previous anchoring chain failed
(as described in [Recovering Broken Anchoring](#recovering-broken-anchoring)).

### Creating Anchoring Transaction

- Set the `anchoring_interval` - the interval in Exonum blocks between creating
  anchoring transactions
- When the corresponding height of the Exonum blockchain is reached, an
  anchoring transaction is determined based on the UTXO of the latest previous
  anchoring transaction and the hash of the corresponding Exonum block. The
  first anchoring transaction in the chain uses the UTXO of the funding
  transaction
- Every validator has an external synchronization [utility][btc_anchoring_sync] that
  creates containing a new proposed anchoring transaction and its vote for
  said transaction. The validators commit these transactions to
  the Exonum blockchain
- When such transaction is executed, its signature is stored in the
  corresponding anchoring service table. When the number of signatures for the
  same anchoring proposal reaches `+2/3` value, said anchoring transaction
  appears in the table of anchoring transactions
- A synchronization [utility][btc_anchoring_sync] performs synchronization
  between Exonum network and Bitcoin network for availability of uncommitted anchoring
  transactions and sends all such anchoring transactions to Bitcoin. Therefore, even
  if some committed anchoring transactions are lost from the network due to a fork,
  the handler will send them to Bitcoin once again.

## Setup and Configuration

Anchoring requires additional
[configuration parameters](supervisor.md#Service-Configuration) to
be set. [Here][newbie-guide] you can find setup and deploy guide for newbies.

### Local Configuration

#### Bitcoind Node

The service uses a third-party Bitcoin node to communicate with the
Bitcoin blockchain network. Currently, [Bitcoin Core][bitcoind] is supported
only.

The following settings need to be specified to access the bitcoind node:

- bitcoind host
- bitcoind rpc username
- bitcoind rpc password

!!! tip
    It is strongly advised to have a separate bitcoind node for more than one
    validator; otherwise, the single bitcoind node is a
    centralization point and presents a weakness in the anchoring process.

#### Bitcoin Private Keys

Every validator should possess its own secp256k1 EC keypair in order to
participate in the anchoring process. The private key should be strongly
secured.

#### Synchronization with Bitcoin Blockchain

A separate [utility][btc_anchoring_sync] periodically performs
two actions:

- Creation of a signature for a new anchoring transaction. The utility takes the
  actual anchoring transaction proposal by the node private API, signs this
  proposal by the corresponding Bitcoin key and sends this signature back to the
  validator node. Validator node creates a new vote transaction from this signature
  and broadcasts it to the other nodes.

- Synchronization of the list of Exonum anchoring transactions with those committed
  to the Bitcoin Blockchain. The utility the latest anchoring transaction and checks
  whether it is present in Bitcoin.
  If not, the handler checks the previous anchoring transactions one by one in the
  same manner until it finds the last anchoring transaction committed to Bitcoin
  Blockchain. The handler then pushes all the uncommitted anchoring transactions
  to Bitcoin.

### Global Configuration

#### Bitcoin Public Keys

As written earlier, every validator should store its own
[private key](#bitcoin-private-keys).
Corresponding public keys are stored in the global configuration.

#### Transaction Fees

Transaction fee represents a value in satoshis that is set as a fee for
every anchoring transaction. It is recommended to set a 2x-3x times bigger
transaction fee than the average market fee, to ensure that the anchoring
transaction does not hang if the Bitcoin network is spammed.

#### Anchoring Schedule

This parameter defines how often anchoring should be executed. It
defines the distance between anchored block heights on the Exonum blockchain.

!!! note
    If the interval is set to 1000 blocks, then blocks `#1000`, `#2000`,
    `#3000`, ... will be anchored.

!!! tip
    The interval may be chosen so that under normal conditions the
    interval between anchored blocks is between 10 minutes and 1 hour.

#### Funding UTXO

<!-- TODO: add a link to the instruction when the "Exonum launch tutorial" is
released-->

To refill the anchoring address balance, a Bitcoin funding transaction, that
sends money to the current anchoring address, should be generated.
Such transaction should be manually added to the global settings.

The funding UTXO should get enough confirmations before it can be used.
However, the network does not check the number of confirmations for the
provided funding transaction; it is the administrators’ duty.

## Maintenance

The maintenance guide is [here][maintenance-guide].

## Recovering Broken Anchoring

If the anchoring chain is broken, administrators must generate a new
funding transaction to the new anchoring address and add it to the
global configuration as the funding UTXO. A new anchoring chain will be
produced,
starting with this funding transaction. The very first anchoring transaction
from this chain will include the optional
[anchoring recovery data chunk](#recovery-data-chunk) in the data output.

## Available API

The service provides API that describes in the anchoring [crate][anchoring-crate-doc]
documentation.

[anchoring-deploy]: https://github.com/exonum/exonum-btc-anchoring/blob/master/guides/newbie.md
[github-anchoring]: https://github.com/exonum/exonum-btc-anchoring
[bitcoind]: https://bitcoin.org/en/bitcoin-core/
[transaction_malleability]: https://en.bitcoin.it/wiki/Transaction_malleability#Segwit
[segwit]: https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki
[btc_anchoring_sync]: https://github.com/exonum/exonum-btc-anchoring/blob/master/src/bin/btc_anchoring_sync.rs
[maintenance-guide]: https://github.com/exonum/exonum-btc-anchoring/blob/master/guides/maintenance.md
[newbie-guide]: https://github.com/exonum/exonum-btc-anchoring/blob/master/guides/newbie.md
[anchoring-crate-doc]: https://docs.rs/exonum-btc-anchoring/latest/exonum_btc_anchoring/api/index.html