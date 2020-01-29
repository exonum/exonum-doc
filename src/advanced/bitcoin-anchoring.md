# Anchoring Service

<!-- cspell:ignore bitcoind,blockhash,satoshis,txid,utxo,utxos -->

The anchoring service is developed to increase product security and
provide non-repudiation for Exonum applications. This service periodically
publishes the Exonum blockchain block hash to the Bitcoin blockchain, so that
it is publicly auditable by anyone having access to the Exonum blockchain.
Even in the case of validators collusion, transaction history cannot be
falsified. The discrepancy between the actual Exonum blockchain state and the
one written to the Bitcoin blockchain will be found instantly.

This document describes the **anchoring service operable with Exonum v0.10+**.
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
- Every validator node has an external sync [util][btc_anchoring_sync] that
  creates containing a new proposed anchoring transaction and its vote for
  said transaction. The validators commit these transactions to
  the Exonum blockchain
- When such transaction is executed, its signature is stored in the
  corresponding anchoring service table. When the number of signatures for the
  same anchoring proposal reaches `+2/3` value, said anchoring transaction
  appears in the table of anchoring transactions
- A sync [util][btc_anchoring_sync] performs synchronization between Exonum
  network and Bitcoin network for availability of uncommitted anchoring transactions
  and sends all such anchoring transactions to Bitcoin. Therefore, even if some
  committed anchoring transactions are lost from the network due to a fork,
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

A separate [btc_anchoring_sync][btc_anchoring_sync] utility periodically performs
two actions:

- Creation of a signature for a new anchoring transaction. It takes the actual
  anchoring transaction proposal by the node private API, signs this proposal by
  the corresponding Bitcoin key and sends this signature back to the validator
  node. Validator node creates a new vote transaction from this signature and
  broadcasts it to the other nodes.

- Synchronization of the list of Exonum anchoring transactions with those committed
  to the Bitcoin Blockchain. It takes the latest anchoring transaction and checks
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

Fresh and full maintenance guide you can alway find [here][maintenance-guide].

## Recovering Broken Anchoring

If the anchoring chain is broken, administrators must generate a new
funding transaction to the new anchoring address and add it to the
global configuration as the funding UTXO. A new anchoring chain will be
produced,
starting with this funding transaction. The very first anchoring transaction
from this chain will include the optional
[anchoring recovery data chunk](#recovery-data-chunk) in the data output.

## Available API

The service provides the following public API endpoints:

- [Get the actual anchoring address](#actual-address)
- [Get the following anchoring address](#following-address)
- [Get an anchoring transaction](#get-an-anchoring-transaction)

All REST endpoints share the same base path, denoted **{api_prefix}**,
equal to `/api/services/{btc_anchoring_instance}`.

!!! tip
    See [*Services*](../architecture/services.md) for a description of the
    types of endpoints in services.

### Actual Address

```None
GET /{api_prefix}/address/actual
```

Returns the current anchoring BTC-address.

#### Parameters

None.

#### Response

The string with a value of the anchoring address in the Base58Check format.

### Following Address

```None
GET /{api_prefix}/address/following
```

If the [change of the validators list](#transition-transaction) is
scheduled, returns the next anchoring address.
Otherwise, returns `null`.

#### Parameters

None.

#### Response

The string with a value of the anchoring address in the Base58Check format.

### Get an Anchoring Transaction

```None
GET /{api_prefix}/find-transaction
```

Returns the latest anchoring transaction if the particular height of Exonum
blockchain is not specified. Otherwise, returns the anchoring transaction with
the height that is greater or equal to the given one.

#### Parameters

- **height**: Option&lt;Height&gt;
  Optional parameter. Exonum block height.

#### Response

Example of JSON response:

<!-- markdownlint-disable MD013 -->
??? example "Response Example"
    ```JSON
    {
        "block_proof": {
            "block": {
                "height": 44307,
                "tx_count": 0,
                "prev_hash": "a75824f5075b217ffc347639fd1e239fb380c35e6da5552f3a7cbbf8c1407959",
                "tx_hash": "c6c0aa07f27493d2f2e5cff56c890a353a20086d6c25ec825128e12ae752b2d9",
                "state_hash": "644dc693d861ab5c3132d199f153bec20f22cc28eb2038fc3ede47e8df913f74",
                "error_hash": "7324b5c72b51bb5d4c180f1109cfd347b60473882145841c39f3e584576296f9",
                "additional_headers": {
                    "headers": {
                        "proposer_id": [
                            0,
                            0
                        ]
                    }
                }
            },
            "precommits": [
                "0a5e125c1093da02180122220a202a01a370a92150bde52d25fc2c5afa48b988f0ed8c06ef59d3f2761d41af36392a220a2034aec3c779c285b16fdb57a7134b2781bc8df0710e7944987a20158fee39737b320c0891c6c0f10510f3b5cbf90212220a20da06bd6dc6a364cf2364c1543704e96328fc8a3440c0479d2b90c8d2a2ccbf281a420a40bca9313f9480b801f886c52572388e40ecd9e68e9b180b7b3b0fccfe553fa23b418ba76b818e38baaef265fff2711f35755090cc847c79a9f8bb24c346657303"
            ]
        },
        "state_proof": {
            "entries": [
                {
                    "key": "anchoring.transactions_chain",
                    "value": "83619c2193da33e19f330b1a47877944f03cdf431adc59fdd3d44bf48d7d6727"
                }
            ],
            "proof": [
                {
                    "path": "0000",
                    "hash": "9ba6994fbc49833a495be9fbc75479db2be10307923b6a55be3e685cf0271be7"
                },
                {
                    "path": "0011",
                    "hash": "3a729d7831385bbb8b3e3d8a1d00d69e8b51170a97bf6d818c52dbd85d3b3394"
                },
                {
                    "path": "011",
                    "hash": "ab3dff325340881cfe76cf3abbec3796dbcc386998cc249d0042cd50a17849a7"
                },
                {
                    "path": "1",
                    "hash": "9be6b206e0cf5921a0f1dc1f79a72e5b1f7025bffe5c9a9e5442a4982904f07c"
                }
            ]
        },
        "transaction_proof": {
            "proof": [
                {
                    "index": 10,
                    "height": 4,
                    "hash": "16ccbdbcef6e934ae31332c04c5bac5cd277f8e09a8baedc722c0c6f8353be8a"
                },
                {
                    "index": 4,
                    "height": 5,
                    "hash": "8d9b92fbeb3af5defeeb5bc26039c4e061ab3911410813240b95ed26ae094fbc"
                },
                {
                    "index": 0,
                    "height": 7,
                    "hash": "052697e4f43b242624bbd72f1aa7c055adcdc54beb3f69fc07057043e69d6c87"
                }
            ],
            "entries": [
                [
                    88,
                    "020000000001013a69e4d0ff14a2af002586c86a7074a69271e8fd4f4743cdec33c785fe8d1cca0000000000ffffffff02562e0d0000000000220020f86c30b7ec3496572220f40b21096b74dc5182942b8811d1bb0b3ab21e52b1330000000000000000326a3045584f4e554d0100e0ab0000000000009d9e34f3cebd5dfbb3fc0f66b23dd1cb55c3507c7642d215fd4e12864baea18b0300483045022100f1334ff44dcb164284cc440ae96ee609bd162c3ff0a9bc99feba4822ad7c903102205176c694d8f17e72b780fef198cc803bd13eacf920751673826928ba29acfd5d0125512102d6086aaccc86e6a711ac84ff21a266684c17d188aa7c4eeab0c0f1213330858451ae00000000"
                ]
            ],
            "length": 89
        }
    }
    ```
<!-- markdownlint-enable MD013 -->

- **block_proof**: proof of the latest authorized block in the blockchain for
  the moment when the request is made
- **state_proof**: proof for the transactions index of the anchoring service
- **transaction_proof**: proof for the specific transaction
  in this index.

[anchoring-deploy]: https://github.com/exonum/exonum-btc-anchoring/blob/master/guides/newbie.md
[github-anchoring]: https://github.com/exonum/exonum-btc-anchoring
[bitcoind]: https://bitcoin.org/en/bitcoin-core/
[transaction_malleability]: https://en.bitcoin.it/wiki/Transaction_malleability#Segwit
[segwit]: https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki
[btc_anchoring_sync]: https://github.com/exonum/exonum-btc-anchoring/blob/master/src/bin/btc_anchoring_sync.rs
[maintenance-guide]: https://github.com/exonum/exonum-btc-anchoring/blob/master/guides/maintenance.md
[newbie-guide]: https://github.com/exonum/exonum-btc-anchoring/blob/master/guides/newbie.md