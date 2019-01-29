# Anchoring Service

<!-- cspell:ignore bitcoind,blockhash,satoshis,txid,utxo,utxos -->

The anchoring service is developed to increase product security and
provide non-repudiation for Exonum applications. This service periodically
publishes the Exonum blockchain block hash to the Bitcoin blockchain, so that
it is publicly auditable by anyone having access to the Exonum blockchain.
Even in the case of validators collusion, transaction history cannot be
falsified. The discrepancy between the actual Exonum blockchain state and the
one written to the Bitcoin blockchain will be found instantly.

This document describes the **anchoring service operable with Exonum v0.10**.
For information on the anchoring service compatible with all previous versions
of the framework, please refer to a
[separate document](../bitcoin-anchoring-without-segwit.md).

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

As of Exonum 0.10 version the anchoring service applies
[Segregated Witness][segwit] for building anchoring bitcoin transactions. Now,
since signature data is no longer a part of the transaction hash, the number
and order of signatures put over a transaction no longer influence the
[transaction identification][transaction_malleability]. In this way
anchoring transactions are fully deterministic - a new transaction is determined
based on the latest anchoring transaction and the current Exonum state hash to
be anchored.

Moreover, as it is not possible to mutate an anchoring transaction any more,
there is no need to wait every time for confirmations from the Bitcoin
Blockchain that a new anchoring transaction has been committed into the network.
The following anchoring transaction may be safely suggested without such
confirmations.  

Exonum uses a [`bitcoind` client](#bitcoind-node), and the transaction
determined by the service is considered valid by the bitcoind-node.

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
- Every validator creates an Exonum transaction containing a new proposed
  anchoring transaction and its vote for said transaction. The validators commit
  these transactions to the Exonum blockchain
- When such transaction is executed, its signature is stored in the
  corresponding anchoring service table. When the number of signatures for the
  same anchoring proposal reaches `+2/3` value, said anchoring transaction
  appears in the table of anchoring transactions
- A handler performs synchronization between Exonum network and Bitcoin network
  for availability of uncommitted anchoring transactions and sends all such
  anchoring transactions to Bitcoin. Therefore, even if some committed anchoring
  transactions are lost from the network due to a fork, the handler will send
  them to Bitcoin once again.

## Setup and Configuration

Anchoring requires additional
[global and local configuration parameters](../architecture/configuration.md) to
be set.

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

A separate [method][handler] performs regular synchronization of the list of
Exonum anchoring transactions with those committed to the Bitcoin Blockchain. It
takes the latest
anchoring transaction and checks whether it is present in Bitcoin. If not, the
handler checks the previous anchoring transactions one by one in the same manner
until it finds the last anchoring transaction committed to Bitcoin Blockchain.
The handler then pushes all the uncommitted anchoring transactions to Bitcoin.

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

## Changing Validators List

The list of anchoring keys of validators may be changed for several
reasons:

- periodic key rotation
- changing the validators list: add/replace/remove some validators

Both procedures require disabling the old anchoring keys and adding the new
ones.
Additionally, as the anchoring Bitcoin address is a derivative from the list of
anchoring public keys, it should be changed accordingly. The pub-keys list
is stored in the global configuration; it can be updated by out-of-band
means, for example, using
[Configuration Update service](configuration-updater.md). The following
properties should be taken into account:

1. New configuration is spread over nodes. At this point it is not active yet.
2. New configuration has an additional parameter that indicates the height when
   this configuration should be applied. The height is set by the
   administrator.
3. After the indicated height is reached, the new configuration is applied by
   all validators simultaneously. At this point the list of validators is
   finally changed.

!!! tip
    The administrator should make the interval between the moment a new
    configuration is proposed and the height when it will be applied sufficient
    for validators to vote for the new configuration.

!!! warning
    When switching anchoring to a different address, the administrator should
    make sure that the service has enough funds to create a
    [transition transaction](#transition-transaction) to the new address.
    Therefore, the service will continue the old
    anchoring chain at a new address. Otherwise, the old anchoring chain will be
    [lost](#recovering-broken-anchoring).  

### Transition Transaction

Anchoring pubkeys define the anchoring BTC-address. In order to
prolong the anchoring chain at a new address, a new anchoring transaction should
spend the
previous anchoring address UTXO and send it to the new anchoring address. This
transaction should be committed to the Bitcoin blockchain **before** the updated
list of validators comes into force. Thus the anchoring process is suspended.

- After the latest anchoring transactions is committed to the Bitcoin
  blockchain, a transitional anchoring transaction proposal is generated. That
  transaction moves money to the new anchoring address.
- As the anchoring chain has already been moved to the new anchoring address,
  Exonum nodes wait until the new validators set comes into force; after that
  the anchoring process resumes at the new address.

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
- [Get a proof for an Exonum block](#cryptographic-proof-for-an-exonum-block)

All REST endpoints share the same base path, denoted **{api_prefix}**,
equal to `/api/services/btc_anchoring`.

!!! tip
    See [*Services*](../architecture/services.md) for a description of the
    types of endpoints in services.

### Actual Address

```None
GET /{api_prefix}/v1/address/actual
```

Returns the current anchoring BTC-address.

#### Parameters

None.

#### Response

The string with a value of the anchoring address in the Base58Check format.

### Following Address

```None
GET /{api_prefix}/v1/address/following
```

If the [change of the validators list](#transitional-transaction) is
scheduled, returns the next anchoring address.
Otherwise, returns `null`.

#### Parameters

None.

#### Response

The string with a value of the anchoring address in the Base58Check format.

### Get an Anchoring Transaction

```None
GET /{api_prefix}/v1/transaction
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
      "latest_authorized_block": {
        "block": {
          "proposer_id": 3,
            "height": 1186,
            "tx_count": 0,
            "prev_hash": "877b19ef10bfbf2ba7d0a221bd76819e9dc40f481536af77cb6f27af27267576",
            "tx_hash": "0000000000000000000000000000000000000000000000000000000000000000",
            "state_hash": "e7cc38e5d921f970e15504c70149311355414324e5681a3b21697b38082b22d5"
        },
        "precommits": ["f6c69953071c0ed8f4d1f29f0e2e643e97e4fdd30df68d95e20432a7eda054b60100080210a209180122220a20a8278c5723039c8ec6a765ea1ee6cf706455c6d741ddb80ead99d63246912b102a220a200f8a82e554f51926cc1383f6758d7340480b535d8844579d9db39db3db5d66f3320b088bb0bde10510e8ef8d7bb5acf7bd852ddb5ba971772d7f0de37d241ef8b05a17bcab6bf725ce30d1e946558a459d9c8d7f7135aa3e1c66294083a864fb54a3999a2cd8ac42a624467a07", "fbff5671e95c1d832034de16e4857fcef6bfb9c2b8eccd09a98288435687dd1f0100080310a209180122220a20a8278c5723039c8ec6a765ea1ee6cf706455c6d741ddb80ead99d63246912b102a220a200f8a82e554f51926cc1383f6758d7340480b535d8844579d9db39db3db5d66f3320b088bb0bde10510c0e7a879015b258ac7b83576804c2317ba65c2469223cb4e58cc23cb4166e327c8edd97853f50f1b664a908fdb5edf7f31fd18af828860f1e7042680ebe6e932ed014e0f", "90c7e8edbd9f7b078a27b59be9d70aa325f69d02e70ac54ee719d0ec50f80a33010010a209180122220a20a8278c5723039c8ec6a765ea1ee6cf706455c6d741ddb80ead99d63246912b102a220a200f8a82e554f51926cc1383f6758d7340480b535d8844579d9db39db3db5d66f3320b088bb0bde10510f8c3927918bf55157f42d4afe39741b424b68c4123a969d4a4f8edb9ee06d5eb95ac5906b67571741d7501bd2668beb2b6cb334fc369b0d9287b39d91a76ac596d992b0a"]
      },
      "to_table": {
        "entries": [{
          "key": "9d9f290527a6be626a8f5985b26e19b237b44872b03631811df4416fc1713178",
          "value": "50794e6aaec5aef3e36bb65372cfa92138797b3b1f77da0f6204b6c57a145290"
        }],
        "proof": [{
            "path": "000010",
            "hash": "c6739df63f4048aab2cbf256bf4f9c30872417b9256ce4b9390884790a6cc837"
        }, {
            "path": "11",
            "hash": "e37771c9dd31005d91644593a023d21e1753a1149d65a62570b713b8e76a0aae"
        }]
      },
      "to_transaction": {
        "left": {
          "left": "d3c254f7bf83ea21aabd17746cefb1f97536d1794377b413c21ccfff5e7d5373",
          "right": {
            "val": "0200000000010147a80b58d234dee9884563b9b281ddd7f29a1a5e0cbdaf1832aaabcd454397af0000000000ffffffff0250ab0400000000002200209d09ef2cbd7c5d0c834be93522b921e6fbe57da840faaf0bc0a120ebb9b4e8100000000000000000326a3045584f4e554d010032000000000000004decf109f4e02dbd858cb4b4e17ed0bc117d4199351f26ee41b6e12309f6720d0500483045022100be59f77a3c8da98c67cf024f8ba3c9212dd729e5910a7f326f7f1c4cbc2bf936022062033d1ae16492a09b0774ec3a9de7a12ca718431b88ee4dfe15b6a2928939bd01483045022100b112302828e0f1a47e7282ffc75aea3430e3b21aa10fcdefa7e942e81152c97c02201133a34f673b891f5cddd4234e6c6cfa557fe9708d5d49e4732e3c62d52a1a71014730440220053150ccb5c286f306d8bc7ce0c8962390a105aa690d4f2a47a03b0b1b3ff3dc0220796836ca472c2389fad29ef74aa66c4d714c4e32c99da4b1b9a3a30ab5111307018b532103064058d9778b2bd541e9abdbbd1d4d147c05ba2442fea3fb8497e39081977ef72103a5686e28160f7f795103520217a4448c55cd47cb6faf025484b04060f8e0477621033305e3c442443115b5985ca88a107900e2b163e027e2a6aae38e6a5fada230332103d8f593492d2315d6f778fc549c69c84fd6eaf2c422c4152ba3ecb8f14ed1709654ae00000000"
          }
        },
        "right": "b08ac62294268a77df881391fdf91e13b5ac2f91ae0651af86352ee507b88c35"
      },
      "transactions_count": 4
    }
    ```
<!-- markdownlint-enable MD013 -->

- **latest_authorized_block**: the latest authorized block in the blockchain for
  the moment when the request is made
- **latest_authorized_block.block**: field description of the mentioned Exonum
  block  
- **latest_authorized_block.block.proposer_id**: ID of the validator that
  proposed said Exonum block
- **latest_authorized_block.block.height**: height of the Exonum block
- **latest_authorized_block.block.tx_count**: number of transactions in the
  block  
- **latest_authorized_block.block.prev_hash**: previous Exonum block hash
- **latest_authorized_block.block.tx_hash**: root hash of the transactions
  merkle tree in the block
- **latest_authorized_block.block.state_hash**: Exonum state hash
- **latest_authorized_block.precommits**: precommits for the Exonum block
- **to_table**: proof for the whole database table of
  the anchoring service
- **to_transaction**: proof for the specific transaction
  in this table
- **transactions_count**: total number of anchoring  
  transactions

### Cryptographic Proof for an Exonum Block

```None
GET /{api_prefix}/v1/block_header_proof?height={height}
```

Provides cryptographic proofs for Exonum blocks including those also anchored to
the Bitcoin blockchain. The proof is an apparent evidence of availability of a
certain Exonum block in the blockchain.

#### Parameters

- **height**: u64
  Exonum block height.

#### Response

Example of JSON response:

<!-- markdownlint-disable MD013 -->
??? example "Response Example"
    ```JSON
    {
      "latest_authorized_block": {
        "block": {
          "proposer_id": 1,
          "height": 680,
          "tx_count": 0,
          "prev_hash": "fd36da3fcaa5234d59776c9ff74a0159cb749ed2b7df5857798f587701d8cc10",
          "tx_hash": "0000000000000000000000000000000000000000000000000000000000000000",
          "state_hash": "60afd65e8c4e5b20f8b325b6bc3d6191e642bf92bc221acf781214b1a257ab91"
        },
        "precommits": ["f6c69953071c0ed8f4d1f29f0e2e643e97e4fdd30df68d95e20432a7eda054b60100080210a805180122220a20adbb944cc6c1e64e296b8ca6146c194ea5fd740c9dfacd6b6415666b8e9d972e2a220a20c7c9d8aeb3241d19a8dba2af8d637a85b39922b154c7c5050afe60ccfdd22432320c089cafbde1051080c3ebbb031f8aad14d2fdcf8807af1c6984924206ba24841581662eae23cd303c7e7f928bf7cd19c3a9fa9b2eaa1c9010192d9cd39ca6e3905979ec21297d7debc7ef6f0d", "90c7e8edbd9f7b078a27b59be9d70aa325f69d02e70ac54ee719d0ec50f80a33010010a805180122220a20adbb944cc6c1e64e296b8ca6146c194ea5fd740c9dfacd6b6415666b8e9d972e2a220a20c7c9d8aeb3241d19a8dba2af8d637a85b39922b154c7c5050afe60ccfdd22432320c089cafbde105109888ffba031c5d0ceda9fa551060b28fcc99bd96d61269aae782014a63c02a9caead7e41a30857470cb5baed7532e4864baeec2a124d6a76c78f8816e013861d568cf0ba01", "99d61cff132db5d2f75012f4b0350c3f2deda293520da44a456544004858387c0100080110a805180122220a20adbb944cc6c1e64e296b8ca6146c194ea5fd740c9dfacd6b6415666b8e9d972e2a220a20c7c9d8aeb3241d19a8dba2af8d637a85b39922b154c7c5050afe60ccfdd22432320c089cafbde10510c8d789bb03b1fd1a0f7a785b8baa9dd67ded4e9c3b16d190d69cc9038200c1afb194aede93a7b04bf6cbda4f269618f30894b4b9bdf301de2adf1b064c5f8bc07dd8028200"]
      },
      "to_table": {
        "entries": [{
          "key": "905c3e0e1bf85991fc02bb18a99f986ec86d99daf813aa29f256d3d6209a7465",
          "value": "9701e23a1b6cd4fd3b95aa559df0a7b34cd13995e6047311cf2edd372e45de98"
        }],
        "proof": [{
          "path": "0000101010101110110000001010110110011000000001100011001110110111000101011001101100100100000010011111001000011101110010101110111001111111101111101110100011111110000111011111101111110011011010100100110101110010101000101110101000100110011100100010101101100001",
          "hash": "0000000000000000000000000000000000000000000000000000000000000000"
        }, {
          "path": "1",
          "hash": "970b28e318ce0a5247cddba4d12906f1f6de40f68adbf5517501b64be69d84ec"
        }]
      },
      "to_block_header": {
        "left": {
          "left": {
            "left": {
              "left": {
                "left": {
                  "left": {
                    "left": {
                      "left": {
                        "left": {
                          "left": "f5921b8da64e74ab2df43d21940a09706c27ff2c5831b0408f24bd3a069dd03e",
                          "right": {
                            "val": "adf3f0eaca749b34830e96057c62b9699f233c1bbb0ecac86f29d76027ff94cd"
                              }
                            },
                            "right": "d59ee5803213d63925a297f86c99f89c842e3c1d859ee7b69977516a842dae69"
                          },
                          "right": "03af5696cee24af698bc4d4103219db859f8e944907b63e4a25a69b6c7c83f5c"
                        },
                        "right": "f3283144e91ff7079f494afba3dcb68293ccbe1833d5eb63a76de9db3e4fefc7"
                      },
                      "right": "d1f3229e45eee8e41ca231cf2c3b35de39f3d84c5be3be675aad4bbb2d5de585"
                    },
                    "right": "29436a82b3fabac71ce3bdf3c2ae5472d01af1556cc1b95054b29a30af3b2157"
                  },
                  "right": "6530c37bf35ee4b12c1aa24c95a893bc0ab096f012da9e99ddd6b6045c61f385"
                },
                "right": "b88fc2eb7cac6502bffbef5b72de8cc6299be77e097eb6cb5ed7e0486fb035a4"
              },
              "right": "978d39c6b92c9385847718b1aeb6c34896869c6df1bdc933cc5e4d7bffd4bd44"
            },
            "right": "c21a5ebca5880cef3512c853599251780e78d8a8313aec91aaf6520665bfbb43"
        }
    }
    ```
<!-- markdownlint-enable MD013 -->

- **latest_authorized_block**: the latest authorized block in the blockchain
  for the moment when the request is made
- **latest_authorized_block.block**: field description of the mentioned Exonum
  block
- **latest_authorized_block.block.proposer_id**: ID of the validator that
  proposed said Exonum block
- **latest_authorized_block.block.height**: height of the Exonum block
- **latest_authorized_block.block.tx_count**: number of transactions in the
  block  
- **latest_authorized_block.block.prev_hash**: previous Exonum block hash
- **latest_authorized_block.block.tx_hash**: root hash of the transactions
  merkle tree in the block
- **latest_authorized_block.block.state_hash**: Exonum state hash
- **latest_authorized_block.precommits**: precommits for the Exonum block
- **to_table**: proof for the whole database table of
  the anchoring service
- **to_block_header**: proof for the specific block header in this table

[anchoring-deploy]: https://github.com/exonum/exonum-btc-anchoring#deployment
[anchoring-parameters]: https://github.com/exonum/exonum-btc-anchoring/blob/master/DEPLOY.md#change-configuration-parameters
[github-anchoring]: https://github.com/exonum/exonum-btc-anchoring
[bitcoind]: https://bitcoin.org/en/bitcoin-core/
[transaction_malleability]: https://en.bitcoin.it/wiki/Transaction_malleability#Segwit
[segwit]: https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki
[handler]: https://github.com/exonum/exonum-btc-anchoring/blob/master/src/handler.rs
