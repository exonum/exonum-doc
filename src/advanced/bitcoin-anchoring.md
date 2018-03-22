# Anchoring service

<!-- cspell:ignore bitcoind,blockhash,lects,satoshis,txid,utxo,utxos -->

The anchoring service is developed to increase product security and
provide non-repudiation for Exonum applications. This service periodically publishes the
Exonum blockchain block hash to the Bitcoin blockchain, so that it is
publicly auditable by anyone having access to the Exonum blockchain. Even in
the case of validators' collusion, transaction history cannot be
falsified. The discrepancy between the actual Exonum blockchain state and the
one written to the Bitcoin blockchain will be found instantly.

!!! note
    This page mostly describes how the service functions. There is a
    separate page, describing how the service should be [configured and
    deployed][anchoring-deploy]. The source code is located [on
    GitHub][github-anchoring].

## General idea

The service writes the hash of the latest Exonum block to the permanent
read-only persistent storage available to everyone. The block is called
_anchored block_, and its hash is referred as _anchored hash_
further.

The service builds an _anchoring chain_ on
the top of Bitcoin blockchain, which consists of multiple _bitcoin
anchoring transactions_. Each anchoring transaction has at least 1
input and only 2 outputs: data output and change output. Data output
contains written anchored hash, while change output transfers money
to the next anchoring transaction.

```None
             funding tx
                       \
      tx1        tx2    \   tx3        tx4
.. --> change --> change --> change --> change --> ..
   \          \          \          \
    -> data    -> data    -> data    -> data
```

Sometimes additional inputs called [funding UTXO](#funding-utxo) are
used. Such input is necessary to refill balance of anchoring chain that
is spending to transaction fees.

## Anchoring transactions

### Multisig address as decentralization method

Decentralization during anchoring process is built over internal Bitcoin
multisignature addresses architecture.

When Exonum network should be anchored, every validator builds an
anchoring transaction using [deterministic
algorithm](#creating-anchoring-transaction).
Its results are guaranteed to match for every honest validator. Such an
anchoring transaction spend one or more UTXOs from the current anchoring
multisig address. Every validator can sign it without regard for other
validators as it is allowed by Bitcoin. All signatures are published
into Exonum blockchain.

Exonum uses `M-of-N` multisig addresses, where `N` is a number of
anchoring validators (`N <= 15` because of Bitcoin restrictions) and `M`
is the necessary amount of signatures. In Exonum consensus, `M =
floor(2/3*N) + 1` is used as supermajority.

!!! note
    If there are `N=10` validators, then `M=7` represents a supermajority.
    That means, 7 signatures are required to build an anchoring transaction.
    If `N=4`, then `M=3` signatures are required.

After the necessary amount of signatures is published, any participant
node can create correct and signed anchoring transaction and broadcast
it to the Bitcoin blockchain.

### Transaction malleability

Validators signatures are openly written in Exonum blockchain; more
than `M` signatures can be published (and it is common situation). There
is a special algorithm selecting `M` signatures deterministically. If
all validators are legitimate, certain transaction is built
unequivocally.

But any Byzantine node could step out from deterministic algorithm and
use another signatures list for anchoring transaction. It may create a
transaction with the same anchored hash (the same data-output) but another
tx-id and broadcast it to the Bitcoin network. Such non-standard
transactions make a problem: new anchoring transaction may be built
even if previous is still not included in any Bitcoin block. However,
there is a chance that this previous transaction or one of its ancestors
were mutated by a malicious validator as described above, and the
mutated transaction has been committed on the Bitcoin blockchain. This
would make the previous transaction ineligible for inclusion into the
Bitcoin blockchain.

To handle this problem, the consensus is used to select appropriate previous
transaction via [LECTs](#lect).

### LECT

Every validator defines which anchoring transaction is considered to be
the latest one; this transaction should be spend in the new anchoring
transaction in its opinion. Such transaction is called Latest Expected
Correct Transaction (LECT). LECT of all validators are published in the
Exonum blockchain. While creating a new anchoring transaction, the
supermajority of validators select a common LECT and spend its change output.

Every validator refresh its LECT with a [custom
schedule](#lect-updating-interval). To get new LECT, the validator uses
API of a [Bitcoin node](#bitcoind-node). New LECT must have the following
properties:

- It is valid anchoring transaction for the current Exonum blockchain
- It may have any amount of confirmations, in particular, 0
- Its change output should be not spent. That means that the specified
  validator believes there was no following anchoring transactions after
  this one
- Among all Bitcoin transactions satisfying the previous properties,
  LECT should have the greatest anchored Exonum block height
- If multiple transactions respond to previous conditions, any of them
  may be chosen as a LECT.

The LECT solves transaction malleability problem, though anchoring
transactions sometimes may be orphaned and never written to the Bitcoin
blockchain. However, it is safe enough as the following anchoring
transactions effectively anchor all previous ones.

Exonum uses a [`bitcoind` client](#bitcoind-node), and only one of the
transactions satisfying conditions can be considered as valid by
bitcoind-node.

### Anchoring Transaction Proposal detailed structure

An anchoring transaction proposal is constructed as follows:

- It conform to the Bitcoin transaction specification.
- The inputs are:

    - The change output of the selected common LECT. This input present in
    every anchoring transaction except the first one.
    - Funding UTXO written in the global configuration (if it not spent yet)

- The outputs contain a data output and the change output only. The
  change output is first, and the data output is second.
- The data output contains a single `OP_RETURN` instruction with
  anchored data. Such a data consist of multiple [data
  chunks](#data-chunks)
- The change output reroutes funds to the next anchoring address if the
  anchoring address [should be changed](#changing-validators-list).
  Otherwise, the current address is used.

### Data chunks

The data output consists of the following parts:

- an OP_RETURN instruction (`0x6a`)
- 1-byte, the length of stored data
- `EXONUM` in the ASCII encoding (`0x45 0x58 0x4f 0x4e 0x55 0x4d`)
- a 1-byte version of the current data output, currently is `1`.
- a 1-byte type of payload: 0 if only anchored hash is included, 1 if
  both chunks are used
- 40 bytes of anchored hash data chunk
- (optional) 32 bytes of a recovering data chunk

All integer chunk parts are little-endian, as per the general guidelines
of Bitcoin Script.

In total, anchoring transaction payload takes 48 bytes in regular way
and enlarges to 80 bytes when recovering is needed.

#### Anchored hash data chunk

- 8-byte zero-based unsigned height of the anchored block (i.e., the
  height of the genesis block is `0`) which is used for efficient lookups.
- 32-byte block hash

#### Recovery data chunk

The data of the recovery chunk is a 32-byte Bitcoin
transaction hash. This hash shows that the current anchoring chain is
the prolongation of previously stopped anchoring chain. The possible
reasons of such stops are described further.

The recovery chunk is optional and may appear in the very first Bitcoin
anchoring transaction only if the previous anchoring chain was failed
(as described in the [Recovering the previous
chain](#recovering-broken-anchoring)).

### Creating anchoring transaction

- Say `H` is the block height of the block that must be anchored.
- Starting from this block `#H`, every validator monitors list of
  current LECTs. As soon as there is a common LECT (that is defined by
  `+2/3` validators), **anchoring transaction proposal** (the anchoring
  transaction without validators signatures) is completely defined and is
  agreed upon by `+2/3` validators.
- After common LECT appears, every validator builds the anchoring
  transaction and sign its every input.
- The signatures are publicized at the Exonum blockchain
- Based on the signatures, _any_ Exonum node can create anchoring
  transaction and broadcast it to the Bitcoin network. In particular, all
  agreed validators broadcast it.

#### Skipping anchoring

If Exonum should make anchoring, but there is no LECT agreed upon `+2/3`
validators, than no anchoring happened. Anchoring service waits until
some validators update its anchoring chain and common LECT would be
found. New block for anchoring is the latest Exonum blockchain block
needed to be anchored. For example, Exonum blockchain is at the height
`#11000` with anchoring interval in `1000` blocks. If common LECT
appears at the height `#12345`, block `#12000` is anchored, though there
would be no anchor for block `#11000`.

## Setups and configuration

Anchoring requires additional [global and local configuration
parameters](../architecture/configuration.md) to be set.

### Local configuration

#### Bitcoind node

The service uses third-party Bitcoin node to communicate with the
Bitcoin blockchain network. As for Exonum v 0.1, [Bitcoin
Core][bitcoind] is supported only.

The following settings need to be specified to access the bitcoind node:

- bitcoind host
- bitcoind rpc username
- bitcoind rpc password

!!! tip
    It is strongly advised to have a separate bitcoind node for every
    validator; otherwise the single bitcoind node represents a
    centralization point and brings a weakness into the anchoring process.

#### Bitcoin private keys

Every validator should possess its own secp256k1 EC keypair in order to
participate in anchoring process. The private key should be strongly secured.

#### Observer interval

Observer interval defines an interval between Exonum blocks when node
should refresh its view of anchoring chain. If observer interval is not
defined, than node do not track anchoring chain at all.

Tracking is needed to get the [nearest anchoring transaction](#nearest-lect)
for every Exonum block.

#### LECT updating interval

The frequency (in number of Exonum blocks) between checking the Bitcoin
blockchain to update the LECT of the node.

### Global settings

#### Bitcoin public keys

As it was written earlier, every validator should store its own [private
key](#bitcoin-private-keys). According public keys are stored in the
global configuration.

#### Transaction fees

Transaction fee represents a value in satoshis that is set as a fee for
every anchoring transaction. It is advised to be a 2x-3x times bigger
than average market fee, in order to be sure that anchoring transaction
does not hang if the Bitcoin network is spammed.

#### Anchoring schedule

This parameter defines how often anchoring should be executed. It
defines the distance between anchored block heights on the Exonum blockchain.

!!! note
    If the interval is set to 1000 blocks, then blocks `#1000`, `#2000`,
    `#3000`, ... would be anchored.

!!! tip
    The interval may be chosen in a way that under normal conditions the
    interval between anchored blocks is between 10 minutes and 1 hour.

Sometimes anchoring process timetable could differ from ideal. Example
is described [here](#skipping-anchoring).

#### Funding UTXO

To refill anchoring address balance, the Bitcoin funding transaction
should be generated that sends money to the current anchoring address.
Such transaction should be manually written to the global settings.

The funding UTXO should get enough confirmations before being used.
However, the network does not check number of confirmations for the
provided funding transaction; it is administrators’ duty.

## Changing validators list

The list of anchoring keys of validators may be changed by a multiple
reasons:

- periodic key rotation
- changing the validators’ list: add/replace/remove some validators

Both ways require disabling old anchoring keys and add new ones. As well
as the anchoring Bitcoin address is a derivative from the list of
anchoring public keys, it should be changed accordingly. Pub-keys list
is stored in the global configuration; it can be updated by out-of-band
means, for example, using [Configuration Update
service](configuration-updater.md). The following properties should be noticed:

1. New configuration is spread over nodes. It is still not active.
2. New configuration have additional parameter height when this
  configuration should be applied. It is chosen by administrator. The
  good sense is to choose height so config would be applied in ~3-6 hours
  after it was sent into Exonum blockchain.
3. After mentioned height takes place, new configuration is applied by
  every validator simultaneously. The list of validators finally is
  changed.

!!! warning
    It is important that pause between configuration appearing and
    configuration applying is big enough. It should be defined in accordance
    with necessary number of confirmations for the latest LECT.

### Transitional transaction

Anchoring pubkeys define new Anchoring BTC-address. In order to prolong
anchoring chain, new anchoring transaction should spend previous
anchoring address UTXO and send it to the new anchoring address. Such
transaction should be committed to the blockchain **before** the list of
validators is changed. Thus the anchoring process is suspended.

- The anchoring service wait until common LECT is committed to the Bitcoin
  blockchain.
- After common LECT appears and is committed to the Bitcoin blockchain,
  the service waits until it will gather sufficient number of
  confirmations (ex., `24`).
- Further transitional Anchoring transaction proposal is generated. That
  transaction moves money to the new anchoring address.
- As anchoring chain is already moved to the new anchoring address,
  Exonum nodes wait until new validator set is applied. The anchoring
  process is resumed after.

Such process could suspend anchoring transaction on fairly a big time.
For example, if the service waits until 24 confirmations, total pause
could last for 4-6 hours.

If latest LECT does not get enough confirmations before the Exonum
blockchain moves to the new validators list then anchoring chain is
**BROKEN** and could not be prolonged.
To ensure anchoring chain would not be broken during
changing pubkeys list, the new configuration activating height should be
set big enough.

## Recovering broken anchoring

After anchoring chain was broken administrators must generate new
funding transaction to the new anchoring address and add it to the
global configuration as funding UTXO. New anchoring chain will produced,
starting with this funding tx. The very first anchoring transaction from
this chain would include optional [anchoring-recovering data
chunk](#recovery-data-chunk) in the data output.

## Available API

The service provides the following public API endpoints:

- [Get actual anchoring address](#actual-address)
- [Get next anchoring address](#following-address)
- [Get actual common LECT](#actual-common-lect)
- [Get actual LECT for specific validator](#actual-lect-for-specific-validator)

All REST endpoints share the same base path, denoted **{base_path}**,
equal to `/api/services/btc_anchoring/v1`.

!!! tip
    See [*Services*](../architecture/services.md) for a description of
    types of endpoints in services.

### Actual address

```None
GET {base_path}/address/actual
```

Returns the current anchoring btc-address.

#### Parameters

None.

#### Response

The string with a value of anchoring address in Base58Check format.

### Following address

```None
GET {base_path}/address/following
```

If the [change the validators list](#transitional-transaction) is
scheduled, returns the next anchoring address.
Otherwise, returns `null`.

#### Parameters

None.

#### Response

The string with a value of anchoring address in Base58Check format.

### Actual common LECT

```None
GET {base_path}/actual_lect
```

Returns the LECT that is agreed by validators supermajority now, if such
exists. Otherwise, returns `null`.

#### Parameters

None.

#### Response

Example of JSON response:

```JSON
{
  "payload": {
    "block_hash": "03c5d221357d5d10c20792d480ba29267f3895575fbe36bef175abab9e9c9f5a",
    "block_height": 0,
    "prev_tx_chain": null
  },
  "txid": "021dd89bd3343a8a6ad259fbe1eed638217358b262db66a9619af2ca92fb89d9"
}
```

- **payload.blockhash**: the hash of the anchored Exonum block
- **payload.block_height**: the height of the anchored Exonum block
- **content.payload.prev_tx_chain**: last tx-id of previous chain of
  anchoring transactions if it has been broken. Otherwise, `null`.
- **txid**: the hash for the anchoring Bitcoin transaction, which is
  considered to be a LECT.

### Actual LECT for specific validator

```None
GET {base_path}/actual_lect/{id}
```

Returns the actual LECT for the specified validator, along with the
hash of Exonum transaction published this LECT.

If the specified `id` is greater or equal to validators
amount, returns an error.

#### Parameters

`id`: unsigned 32-bit integer

#### Response

Example of JSON response:

```JSON
{
  "hash": "c1b20563e3db4041bfb30da589b6f25a22bb19d02ed8c81abf32461f0634b784",
  "content": {
    "payload": {
      "block_hash": "03c5d221357d5d10c20792d480ba29267f3895575fbe36bef175abab9e9c9f5a",
      "block_height": 0,
      "prev_tx_chain": null
    },
    "txid": "021dd89bd3343a8a6ad259fbe1eed638217358b262db66a9619af2ca92fb89d9"
  }
}
```

- **hash**: the hash of Exonum transaction, where the specified
  validator published this LECT
- **content**: the LECT in the same format as in `actual_lect` API
- **content.payload.blockhash**: the hash of the anchored Exonum block
- **content.payload.block_height**: the height of the anchored Exonum
  block
- **content.payload.prev_tx_chain**: last tx-id of previous transactions
  chain if it has been broken. Otherwise, `null`.
- **content.txid**: the hash for the anchoring Bitcoin transaction,
  which is considered to be the current LECT by the validator.

### Nearest LECT

```None
GET {base_path}/nearest_lect/{height}
```

Requires [observer interval](#observer-interval) to be set.

Returns the content of the anchoring transaction which anchors the
specific block. If the asked block was not anchored yet or if the
[observer interval](#observer-interval) is not set, returns `null`.

#### Parameters

`height`: unsigned 64-bit integer

#### Response

The string which value is a hex-encoded content of the nearest Bitcoin
anchoring transaction.

[anchoring-deploy]: https://github.com/exonum/exonum-btc-anchoring/blob/master/DEPLOY.md
[github-anchoring]: https://github.com/exonum/exonum-btc-anchoring
[bitcoind]: https://bitcoin.org/en/bitcoin-core/
