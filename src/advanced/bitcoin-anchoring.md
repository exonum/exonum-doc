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
read-only persistent storage available to everyone. This block is called
_anchored block_, and its hash is referred to as _anchored hash_
further.

The service builds an _anchoring chain_ on
the top of the Bitcoin blockchain, which consists of multiple _bitcoin
anchoring transactions_. Each anchoring transaction has at least 1
input and only 2 outputs: data output and change output. Data output
contains the written anchored hash, while the change output transfers money
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
used. Such inputs are necessary to refill the balance of the anchoring chain that
is spent on transaction fees.

## Anchoring transactions

### Multisig address as decentralization method

Decentralization during the anchoring process is built over the internal Bitcoin
multisignature addresses architecture.

When the Exonum network should be anchored, every validator builds an
anchoring transaction using the [deterministic
algorithm](#creating-anchoring-transaction).
Its results are guaranteed to match for every honest validator. This
anchoring transaction spends one or more UTXOs from the current anchoring
multisig address. Every validator can sign this transaction without regard for other
validators, as it is allowed by Bitcoin. All signatures are published
into the Exonum blockchain.

Exonum uses `M-of-N` multisig addresses, where `N` is a number of
anchoring validators (`N <= 15` because of Bitcoin restrictions) and `M`
is the necessary amount of signatures. In the Exonum consensus, `M =
floor(2/3*N) + 1` is used as supermajority.

!!! note
    If there are `N=10` validators, then `M=7` represents a supermajority.
    That means, 7 signatures are required to build an anchoring transaction.
    If `N=4`, then `M=3` signatures are required.

After the necessary amount of signatures is published, any participant
node can create a correct and signed anchoring transaction and broadcast
it to the Bitcoin blockchain.

### Transaction malleability

Validators' signatures are openly written in the Exonum blockchain; more
than `M` signatures can be published (it is a common situation). There
is a special algorithm selecting `M` signatures deterministically. If
all validators are legitimate, certain transactions are built
unequivocally.

However, any Byzantine node can step out from the deterministic algorithm and
use another signature list for the anchoring transaction. This node may create a
transaction with the same anchored hash (the same data-output) but another
tx-id, and broadcast it to the Bitcoin network. Such non-standard
transactions present a problem: a new anchoring transaction may be built
even if the previous one has not been included yet in any Bitcoin block. However,
there is a chance that this previous transaction or one of its ancestors
was mutated by a malicious validator as described above, and the
mutated transaction has been committed to the Bitcoin blockchain. This
would make the previous transaction ineligible for inclusion into the
Bitcoin blockchain.

To handle this problem, the consensus is used to select the appropriate previous
transaction via [LECTs](#lect).

### LECT

Every validator defines which anchoring transaction is considered to be
the latest one. This transaction should be spent in the new anchoring
transaction and is called the Latest Expected
Correct Transaction (LECT). LECTs of all validators are published in the
Exonum blockchain. While creating a new anchoring transaction, the
supermajority of validators select a common LECT and spend its change output.

Every validator refreshes its LECT with a [custom
schedule](#lect-updating-interval). To get a new LECT, the validator uses the
API of a [Bitcoin node](#bitcoind-node). The new LECT must have the following
properties:

- It is a valid anchoring transaction for the current Exonum blockchain
- It may have any amount of confirmations, in particular, 0
- Its change output should not be spent. That means that the specified
  validator believes there was no following anchoring transactions after
  this one
- Among all Bitcoin transactions satisfying the previous properties,
  LECT should have the greatest anchored Exonum block height
- If multiple transactions meet the previous requirements, any of them
  may be chosen as the LECT.

The LECT solves the transaction malleability problem, though anchoring
transactions sometimes may be orphaned and never written to the Bitcoin
blockchain. However, it is safe enough as the following anchoring
transactions effectively anchor all previous ones.

Exonum uses a [`bitcoind` client](#bitcoind-node), and only one of the
transactions that meet the requirements can be considered valid by the
bitcoind-node.

### Anchoring Transaction Proposal detailed structure

An anchoring transaction proposal is constructed as follows:

- It conforms to the Bitcoin transaction specification.
- The inputs are:

    - The change output of the selected common LECT. This input is present in
    every anchoring transaction except the first one.
    - The funding UTXO written in the global configuration (if it has not been spent yet).

- The outputs contain a data output and change output only. The
  change output goes first, and the data output goes second.
- The data output contains a single `OP_RETURN` instruction with
  anchored data. Such data consist of multiple [data
  chunks](#data-chunks)
- The change output reroutes funds to the next anchoring address if the
  anchoring address [should be changed](#changing-validators-list).
  Otherwise, the current address is used.

### Data chunks

The data output consists of the following parts:

- an OP_RETURN instruction (`0x6a`)
- 1-byte, the length of stored data
- `EXONUM` in the ASCII encoding (`0x45 0x58 0x4f 0x4e 0x55 0x4d`)
- a 1-byte version of the current data output, currently `1`.
- a 1-byte type of payload: 0 if only the anchored hash is included, 1 if
  both chunks are used
- 40 bytes of the anchored hash data chunk
- (optional) 32 bytes of a recovering data chunk

All integer chunk parts are little-endian, as per the general guidelines
of the Bitcoin Script.

In total, the anchoring transaction payload usually takes 48 bytes
and enlarges to 80 bytes when recovering is needed.

#### Anchored hash data chunk

- 8-byte zero-based unsigned height of the anchored block (i.e., the
  height of the genesis block is `0`) which is used for efficient lookups.
- 32-byte block hash

#### Recovery data chunk

The data of the recovery chunk is a 32-byte Bitcoin
transaction hash. This hash shows that the current anchoring chain is
the prolongation of a previously stopped anchoring chain. The possible
reasons for such stops are described further.

The recovery chunk is optional and may appear in the very first Bitcoin
anchoring transaction only if the previous anchoring chain failed
(as described in [Recovering the previous
chain](#recovering-broken-anchoring)).

### Creating anchoring transaction

- Say `H` is the block height of the block that should be anchored.
- Starting from this block `#H`, every validator monitors the list of
  current LECTs. As soon as there is a common LECT (that is defined by
  `+2/3` validators), **anchoring transaction proposal** (the anchoring
  transaction without validators' signatures) is completely defined and is
  agreed upon by `+2/3` validators.
- After the common LECT appears, every validator builds the anchoring
  transaction and signs its every input.
- The signatures are publicized in the Exonum blockchain
- Based on the signatures, _any_ Exonum node can create the anchoring
  transaction and broadcast it to the Bitcoin network. In particular, it is broadcasted by all
  the validators who have agreed upon the selected LECT.

#### Skipping anchoring

If Exonum should perform anchoring, but there is no LECT agreed upon `+2/3`
validators, then anchoring does not take place. The anchoring service waits until
some validators update their anchoring chain and a common LECT is
found. A new block for anchoring is the latest Exonum blockchain block
needs to be anchored. For example, the Exonum blockchain is at the height
`#11000` with an anchoring interval of `1000` blocks. If a common LECT
appears at the height `#12345`, block `#12000` is anchored, though there
will be no anchor for block `#11000`.

## Setups and configuration

Anchoring requires additional [global and local configuration
parameters](../architecture/configuration.md) to be set.

### Local configuration

#### Bitcoind node

The service uses a third-party Bitcoin node to communicate with the
Bitcoin blockchain network. As for Exonum v 0.1, [Bitcoin
Core][bitcoind] is supported only.

The following settings need to be specified to access the bitcoind node:

- bitcoind host
- bitcoind rpc username
- bitcoind rpc password

!!! tip
    It is strongly advised to have a separate bitcoind node for every
    validator; otherwise, the single bitcoind node represents a
    centralization point and presents a weakness in the anchoring process.

#### Bitcoin private keys

Every validator should possess its own secp256k1 EC keypair in order to
participate in the anchoring process. The private key should be strongly secured.

#### Observer interval

Observer interval defines an interval between Exonum blocks when a node
should refresh its view of the anchoring chain. If the observer interval is not
defined, node do not track the anchoring chain at all.

Tracking is needed to get the [nearest anchoring transaction](#nearest-lect)
for every Exonum block.

#### LECT updating interval

The frequency (in number of Exonum blocks) of checking the Bitcoin
blockchain to update the LECT of the node.

### Global settings

#### Bitcoin public keys

As it was written earlier, every validator should store its own [private
key](#bitcoin-private-keys). Corresponding public keys are stored in the
global configuration.

#### Transaction fees

Transaction fee represents a value in satoshis that is set as a fee for
every anchoring transaction. It is recommended to set a 2x-3x times bigger transaction fee
than the average market fee, to ensure that the anchoring transaction
does not hang if the Bitcoin network is spammed.

#### Anchoring schedule

This parameter defines how often anchoring should be executed. It
defines the distance between anchored block heights on the Exonum blockchain.

!!! note
    If the interval is set to 1000 blocks, then blocks `#1000`, `#2000`,
    `#3000`, ... will be anchored.

!!! tip
    The interval may be chosen so that under normal conditions the
    interval between anchored blocks is between 10 minutes and 1 hour.

Sometimes the anchoring process timetable could differ from the ideal. An example
is described [here](#skipping-anchoring).

#### Funding UTXO

To refill the anchoring address balance, a Bitcoin funding transaction, that sends money to the current anchoring address, should be generated.
Such transactions should be manually added to the global settings.

The funding UTXO should get enough confirmations before being used.
However, the network does not check the number of confirmations for the
provided funding transaction; it is the administrators’ duty.

## Changing validators list

The list of anchoring keys of validators may be changed for several
reasons:

- periodic key rotation
- changing the validators’ list: add/replace/remove some validators

Both procedures require disabling the old anchoring keys and adding the new ones. Additionally, as the anchoring Bitcoin address is a derivative from the list of
anchoring public keys, it should be changed accordingly. The pub-keys list
is stored in the global configuration; it can be updated by out-of-band
means, for example, using [Configuration Update
service](configuration-updater.md). The following properties should be taken into account:

1. New configuration is spread over nodes. It is still not active.
2. New configuration has an additional parameter that indicates the height when this
  configuration should be applied. It is chosen by the administrator. It is recommended to choose the height so that the config will be applied in ~3-6 hours
  after it is sent into the Exonum blockchain.
3. After the indicated height is reached, the new configuration is applied by
  every validator simultaneously. The list of validators is finally changed.

!!! warning
    It is important that the pause between configuration appearing and
    configuration applying is big enough. It should be defined in accordance
    with the necessary number of confirmations for the latest LECT.

### Transitional transaction

Anchoring pubkeys define the new Anchoring BTC-address. In order to prolong
an anchoring chain, a new anchoring transaction should spend the previous
anchoring address UTXO and send it to the new anchoring address. This
transaction should be committed to the blockchain **before** the list of
validators is changed. Thus the anchoring process is suspended.

- The anchoring service waits until a common LECT is committed to the Bitcoin
  blockchain.
- After a common LECT appears and is committed to the Bitcoin blockchain,
  the service waits until it gathers a sufficient number of
  confirmations (ex., `24`).
- Next, a transitional Anchoring transaction proposal is generated. That
  transaction moves money to the new anchoring address.
- As the anchoring chain has already been moved to the new anchoring address,
  Exonum nodes wait until the new validator set is applied; after that the anchoring
  process resumes.

This process can suspend the anchoring transaction for a fairly large amount of time.
For example, if the service waits for 24 confirmations, the total pause
can last for 4-6 hours.

If the latest LECT does not get enough confirmations before the Exonum
blockchain moves to the new validators list, the anchoring chain is
**BROKEN** and cannot be prolonged.
To ensure that the anchoring chain is not broken during
a change of the pubkeys list, the new configuration activating height should be
set to a big enough value.

## Recovering broken anchoring

After the anchoring chain is broken, administrators must generate a new
funding transaction to the new anchoring address and add it to the
global configuration as the funding UTXO. A new anchoring chain will be produced,
starting with this funding transaction. The very first anchoring transaction from
this chain will include the optional [anchoring-recovering data
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
    See [*Services*](../architecture/services.md) for a description of the
    types of endpoints in services.

### Actual address

```None
GET {base_path}/address/actual
```

Returns the current anchoring btc-address.

#### Parameters

None.

#### Response

The string with a value of the anchoring address in the Base58Check format.

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

The string with a value of the anchoring address in the Base58Check format.

### Actual common LECT

```None
GET {base_path}/actual_lect
```

Returns the LECT that is agreed upon by the  supermajority of validators now, if such
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
hash of the Exonum transaction published in this LECT.

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

The string the value of which is a hex-encoded content of the nearest Bitcoin
anchoring transaction.

[anchoring-deploy]: https://github.com/exonum/exonum-btc-anchoring/blob/master/DEPLOY.md
[github-anchoring]: https://github.com/exonum/exonum-btc-anchoring
[bitcoind]: https://bitcoin.org/en/bitcoin-core/
