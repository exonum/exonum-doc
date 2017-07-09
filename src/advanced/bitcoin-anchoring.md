# Anchoring service

The anchoring service is developed to increase product security and
provide non-repudiation for Exonum applications. Service publishes
Exonum blockchain state hash to the bitcoin blockchain, so that it is
publicly auditable by anyone having access to the Exonum blockchain. Even in
the case of validators collusion old transactions can not be
falsified; disrepancy between actual Exonum blockchain state and the
one written to the bitcoin blockchain would be found instantly.

!!! note "Another pages about anchoring service"
    This page describe mostly how the service do work; however, there is a
    separate page, describing how the service should be [configured and
    deployed][anchoring-deploy]. The sources are located [on the
    GitHub][github-anchoring].

## General idea

The service writes the hash of the last Exonum block to the permanent
read-only persistent storage available to everyone. The block is called
_anchored block, and its hash is referred as _blockchain state hash_
further.

To write a blockchain state hash, the service builds a _anchoring chain_ on
the top of bitcoin blockchain. Such chain consists of multiple _bitcoin
anchoring transactions_. Each anchoring transaction have at least 1
input and only 2 outputs: data output and change output. Data output
contains written data storage hash, while change output transfers money
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
used. Such input is necessary to refill balance of anchoring chain, that
is spending to transaction fees.

## Anchoring transactions

### Multisig address as decentralization method

Decentralization during anchoring process is built over internal bitcoin
multisignature addresses architecture.

When Exonum network should be anchored, every validator builds an
anchoring transaction using [deterministic algorithm](#creating-anchoring-transaction).
Its results should are guaranteed to
match for every legitimate node. Such an anchoring transaction spend one
or more UTXOs from the current anchoring multisig address. Bitcoin
allows different validators sign this transactions separately from each
other, thus every validator can sign it without regard for other
validators. All signatures are published into Exonum blockchain.

Exonum uses `M-of-N` multisig addresses, where `N` is a number of
anchoring validators (`N` <= 15 because of bitcoin restrictions) and `M`
is the necessary amount of signatures. In Exonum PBFT consensus, `M =
2/3*N + 1` is used as supermajority.

!!! note Example
    If there are `N=10` validators, then `M=7` represents a supermajority.
    That means, 7 signatures are required to build an anchoring transaction.
    If `N=4`, then `M=3` signatures are required.

After the necessary amount of signatures is published, any participant
node can create correct and signed anchoring transaction and broadcast
it to the bitcoin blockchain.

### Transaction malleability

As it was told, we need `M` signatures out of `N` validators to spend
bitcoins from previous change-output. These signatures are publicly
available for every validator (as they are openly written in
Exonum blockchain). More than `M` signatures can be published (and it is
common situation); thus there is a special algorithm allowing to select
`M` signatures deterministically. If all validators are legitimate,
certain transaction is built unequivocally.

But any Byzantine node could step out from deterministic algorithm and
change signature of anchoring transaction. Thus it creates transaction
with the same anchor hash (the same data-output) but another tx-id and
spread it to the bitcoin network. Such non-standard transactions make a
problem: we want to build new anchoring transaction even if previous is
still not included in any bitcoin block. But previous transaction could
be substituted by non-standard one with another tx-id. That makes all later
(already created) anchoring transactions useless.

To handle this problem, the process of selecting appropriate previous
transaction is moved under the consensus ([LECT](#lect) section).

### LECT

Every anchoring transaction should spent a previous anchoring tx. By a
multiple reasons such a transaction cannot be defined deterministically;
thus, it is an object for validators' consensus.

Every validator defines which anchoring transaction is considered to be
the last one; this transaction should be spend in the new anchoring
transaction in its opinion. Such transaction is called Last Expected
Correct Transaction (LECT). LECT of all validators are published in the
Exonum blockchain. While creating a new anchoring transaction, the
validators' supermajority select common LECT and spend its change output.

Every validator refresh its LECT with a custom schedule. To get
new LECT, the validator uses [bitcoin node's](#bitcoind-node) API. New
LECT must have the following properties:

- It is valid anchoring transaction for the current Exonum blockchain
- It may have any amount of confirmations, in particular, 0
- Its change output should be not spent. That means that the specified
  validator believes there was no following anchoring transactions after
  this one
- Among all bitcoin transactions satisfying the previous properties,
  LECT should have the greatest anchored Exonum block height
- If multiple transactions respond to previous conditions, any of them
  may be chosen as a LECT.

The LECT solves transaction malleability problem, though anchoring chain
may sometimes rollback and skip some anchoring transactions.

### Anchoring Transaction Proposal detailed structure

An anchoring transaction proposal is constructed as follows:

- It conform to the Bitcoin transaction specification.
- The inputs are:

    - The change output of the selected common LECT. This input present in
    every anchoring transaction except the first one.
    - Funding UTXO written in the global configuration and not included in
    a previous anchoring transaction.

- The outputs contain a data output and the change output only. The
  change output is first, and the data output is second.
- The data output consist of multiple [data chunks](#data-chunks)
- The change output reroutes funds to the next anchoring address if the
  new anchoring is defined by the accepted configuration change proposal.
  Otherwise, the change output puts funds to the same anchoring address.
- The amount of rerouted funds is exactly the sum of inputs minus the
  transaction fee, specified at the service settings.

### Data chunks

The data output consists of the following parts:

- an OP_RETURN instruction (`0x6a`)
- `EXONUM` at the ASCII-code (`0x45 0x58 0x4f 0x4e 0x55 0x4d`)
- a version of the current data output, 1 byte
- blockchain-state data chunk, encoded as described further
- (optional) a recovering data chunk, encoded as described further

Every data chunk is encoded as per Bitcoin Script spec (1-byte chunk
length + byte sequence). All integer chunk parts are little-endian, as
per the general guidelines of Bitcoin Script.

- **TODO: is there any separator byte between two chunks?**
- **TODO: does every chunk includes its own length or there is a one
  data-output length value right after `OP_RETURN`?**

#### Blockchain-state data chunk

The chunk must be present in every anchoring transaction.

- 8-byte zero-based unsigned height of the anchored block (i.e., the
  height of the genesis block is `0`)
- Block hash (variable length)

Block height allows for efficient lookups.

The Exonum uses a SHA-256 to hash blocks; thus, the data chunk size is
`8 + 32 = 40` bytes.

#### Recovery data chunk

Recovery chunk is be encoded as per Bitcoin Script spec (1-byte chunk
length + byte sequence).

The data of the recovery chunk is structured as follows:

- 32-byte bitcoin transaction hash. This hash shows that the current
  anchoring chain is the prolongation of previously stopped anchoring
  chain. The possible reasons of such stops are described further.

The recovery chunk is optional and may appear in the very first bitcoin
anchoring transaction only if the previous anchoring chain was failed
(as described in the [Recovering the previous
chain](#recovering-broken-anchoring)).

Todos. **TODO: what length does recovery chunk have?**

### Creating anchoring transaction

- Say `H` is the block height of the block that must be anchored (recall
  that determining the nearest `H` is fully deterministic given the
  blockchain data).
- Starting from this block `#H`, every validator monitors list of
  current LECTs. As soon as there is a common LECT (that is defined by
  `+2/3` validators), **anchoring transaction proposal** (the anchoring
  transaction without validators' sigs) is completely defined and is
  agreed upon by `+2/3` validators.
- After common LECT appears, every validator builds the anchoring
  transaction and sign every its input.
- The signatures are publicated at the Exonum blockchain. All signatures
  have `SIGHASH_ALL` sighash type.
- Based on the signatures, _any_ party with sufficient access to the
  blockchain can create anchoring transaction and broadcast it to the
  Bitcoin network. Because of deterministic algorithm of selecting
  necessary signatures for new anchoring transaction every legitimate node
  must get the same anchoring tx (with the same tx-id).
- Every legitimate validator agreed with the selected LECT (and
  accordingly signed anchoring transaction proposal) updates its LECT with
  the hash of new complete anchoring transaction. Also every such
  validator send complete anchoring transaction to the Bitcoin network.
- If at the block `#H` there is no common LECT (that is agreed upon
  `+2/3` validators) than no anchoring happened. Exonum blockchain
  continue creating new blocks. All validators wait until some of them
  would update its anchoring chain and common LECT would be found. By the
  reason of uncertainty in the bitcoin blockchain common LECT could be
  found even after new time for anchoring comes. New state for anchoring
  is the last Exonum blockchain state we need to anchor. For example now
  we are at the height `#11000` and anchoring should be held every `1000`
  blocks. But common LECT appeared only at the height `#12345`. In that
  case we anchor block `#12000` but there would be no anchor for block
  `#11000`

## Setups and configuration

Anchoring requires additional settings to be set. There are both local
and global [configuration settings](../architecture/configuration.md).
Local are accepted just to the current node, while global are shared
between all the validators.

The settings can be updated in the same way as other configuration
parameters do; for example, the global configuration should be updated
through the [Configuration Update service](configuration-updater.md)

### Local settings

#### Bitcoind node

The service uses third-party bitcoin node to communicate with the
bitcoin blockchain network. As for Exonum v 0.1, [Bitcoin
Core][bitcoind] is supported only.

You need to specify the following settings to access the bitcoind node:

- bitcoind host
- bitcoind rpc username
- bitcoind rpc password

!!! tip
    It is strongly advised to have a separate bitcoind node for every
    validator; otherwise the single bitcoind node represents a
    centralization point and brings a weakness into the anchoring process.

#### Bitcoin private keys

Every validator should possess its own secp256k1 EC keypair in order to
participate in anchoring process. This is the standard (and currently
the only supported) key format for bitcoin transactions. While the
private keys should be secured by every validator, the [public
keys](#bitcoin-public-keys) are shared among them and are written into
Exonum blockchain.

### Global settings

#### Bitcoin public keys

As it was written earlier, every validator should store its own [private
key](#bitcoin-private-keys). According public keys are stored in the
global configuration.

#### Transaction fees

A transaction fee represent a value in satoshis that is set as a fee for
every anchoring transaction. It is advised to be a 2x-3x times bigger
than average market fee, in order to be sure that anchoring transaction
does not hang if the bitcoin network is spammed.

This value is written to the global configuration and is applied by all
the validators.

#### Anchoring schedule

This parameter defines how often anchoring should be executed. It
defines the difference between block heights for anchored data states.

!!! note Example
    If the interval is set to 1000 blocks, then blocks `#1000`, `#2000`,
    `#3000`, ... would be anchored.

!!! tip "Choosing the interval"
    The interval may be chosen in a way that under normal conditions the
    interval between anchored blocks is between 10 minutes and 1 hour.

Sometimes anchoring process timetable could differ from ideal. Such
variations could be triggered by byzantine behavior of nodes, forking of
bitcoin blockchain, or changing list of validators. For example, at the
necessary height (`#1000` because of bitcoin blockchain fork nodes could
not agree upon which anchoring transaction is the last one (and should
be spent in the next anchoring tx). If so, nodes will wait until bitcoin
network do not resolve its fork.

#### Funding UTXO

To refill anchoring address balance, the bitcoin funding transaction
should be generated that sends money to the current anchoring address.
Such transaction should be manually written to the global settings to
ensure all validators include it further.

The funding UTXO should get enough confirmations before being used.
However, the network do not check number of confirmations for the
provided funding transaction; it is on administrators' duty.

## Changing validators list

The list of validators' anchoring keys may be changed by a multiple
reasons:

- periodic key rotation
- changing the validators’ list: add/replace/remove some validators

Both ways require disabling old anchoring keys and add new ones. As well
as the anchoring bitcoin address is a derivative from the list of
anchoring public keys, it should be changed accordingly. Pub-keys list
is stored in the global configuration; it can be updated by out-of-band
means, for example, using [Configuration Update
service](configuration-updater.md). We may notice only the following
properties:

1. New configuration is spread over nodes. It is still not active.
2. New configuration have additional parameter `height when this
  configuration should be applied`. It is chosen by administrator. The
  good sense is to choose height so config would be applied in ~3-6 hours
  after it was sent into Exonum blockchain.
3. After mentioned height takes place, new configuration is applied by
  every validator simultaneously. The list of validators finally is
  changed.

!!! warning Pause should be big
    It is important that pause between configuration appearing and
    configuration applying is big enough. It should be defined in accordance
    with necessary number of confirmations for the last LECT.

### Transitional transaction

Anchoring pubkeys define new Anchoring BTC-address. In order to prolong
anchoring chain, new anchoring transaction should spend previous
anchoring address UTXO and send it to the new anchoring address. We must
be confident such transaction would be written to the blockchain
**before** we really change the list of validators. Thus we need suspend
anchoring process.

- The anchoring service wait until common LECT is written to the Bitcoin
  blockchain.
- After common LECT appears and is written to the Bitcoin blockchain,
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

If last LECT does not get enough confirmations before the Exonum
blockchain moves to the new validators list then anchoring chain is
**BROKEN** and could not be prolonged. Anchoring service would log a lot
of warnings. To ensure anchoring chain would not be broken during
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
- [Get actual lect for this validator](#actual-lect-for-this-validator)
- [Get actual lect for another validator](#actual-lect-for-another-validator)

All REST endpoints share the same base path, denoted **{base_path}**,
equal to `/api/services/btc_anchoring/v1`.

!!! tip
    See [*Services*](../architecture/services.md) for a description of
    types of endpoints in services.

### Actual address

``` None
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

If the network plans to [change the validators list in
future](#transitional-transaction), then the next anchoring address is
returned. Otherwise, `null` is returned.

#### Parameters

None.

#### Response

The same format as for the actual anchoring address, the string with a
value of anchoring address in Base58Check format.

### Actual LECT for this validator

```None
GET {base_path}/actual_lect
```

The current LECT for this validator is returned.

#### Parameters

None.

#### Response

JSON object of such format:

        {
          "payload": {
            "block_hash": "03c5d221357d5d10c20792d480ba29267f3895575fbe36bef175abab9e9c9f5a",
            "block_height": 0,
            "prev_tx_chain": null
          },
          "txid": "021dd89bd3343a8a6ad259fbe1eed638217358b262db66a9619af2ca92fb89d9"
        }

- **payload.blockhash**: the hash of the anchored Exonum block
- **payload.block_height**: the height of the anchored Exonum block
- **payload.prev_tx_chain**: the tx-id for the anchoring transaction
  which is spent by the specified LECT. **TODO: yes?**
- **txid**: the hash for the anchoring bitcoin transaction, which is
  considered to be a LECT.

Returns an error if the current node is not a validator.

### Actual LECT for another validator

```None
GET {base_path}/actual_lect/{id}
```

The actual LECT for the specified validator is returned, along with the
hash of Exonum transaction published this LECT.

#### Parameters

`id`: unsigned 32-bit integer

#### Response

JSON object with the following fields:

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

- **hash**: the hash of Exonum transaction, where the specified
  validator published this LECT
- **content**: the LECT in the same format as in `actual_lect` API
- **content.payload.blockhash**: the hash of the anchored Exonum block
- **content.payload.block_height**: the height of the anchored Exonum
  block
- **content.payload.prev_tx_chain**: the tx-id for the anchoring
  transaction which is spent by the specified LECT. **TODO: yes?**
- **content.txid**: the hash for the anchoring bitcoin transaction,
  which is considered to be a LECT.

Returns an error if the specified `id` is greater or equal to validators amount.

[anchoring-deploy]: https://github.com/exonum/exonum-btc-anchoring/blob/master/DEPLOY.md
[github-anchoring]: https://github.com/exonum/exonum-btc-anchoring
[bitcoind]: https://bitcoin.org/en/bitcoin-core/
