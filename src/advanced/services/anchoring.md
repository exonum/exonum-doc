# Anchoring service

The anchoring service is developed to increase product security and provide non-repudiation for Exonum applications. Service publishes assets-blockchain state hash to the bitcoin blockchain, and every concerned participant can audit the blockchain over the history. Even in the case of validators collusion old transactions can not be falcificated; disrepancy between actual Exonum blockchain state and the one written to the bitcoin blockchain would be found instantly.

!!! note "Another pages about anchoring service"
	This page describe mostly how the service do work; however, there is a separate page, describing how the service should be [configured and deployed][anchoring-deploy]. The sources are located [at the github][github-anchoring].

## Anchoring chain, anchoring transaction. Rough description

To write a data state hash, the service builds a _anchoring chain_ on the top of bitcoin blockchain. Such chain consists of multiple _bitcoin anchoring transactions_. Each anchoring transaction have at least 1 input and only 2 outputs: data output and change output. Data output contains written data storage hash, while change output transfers money to the next anchoring transaction.

```
             funding tx
                       \
      tx1        tx2    \   tx3        tx4
.. --> change --> change --> change --> change --> ..
   \          \          \          \
    -> data    -> data    -> data    -> data
```

Sometimes additional inputs called [funding UTXO](#funding-utxo) are used. Such input is necessary to refill balance of anchoring chain, that is spending to transaction fees.

## Setups and configuration

Anchoring requires additional settings to be set. There are both local and global configuration settings. Local are accepted just to the current node, while global are shared between all the validators.

The settings can be updated in the same way as other configuration parameters do; for example, the global configuration should be updated through the [Configuration Update service](configuration.md)

### Bitcoind node

The service uses third-party bitcoin node to communicate with the bitcoin blockchain network. As for Exonum v 0.1, [Bitcoin Core][bitcoind] is supported only.

You need to specify the following settings to access the bitcoind node:

- bitcoind host
- bitcoind rpc username
- bitcoind rpc password

It is strongly advised to have a separate bitcoind node for every validator; otherwise the single bitcoind node represents a centralization point and brings a weakness into the anchoring process.

### Anchoring private keys

Every validator should possess its own secp256k1 EC keypair in order to participate in anchoring process. This is the standard (and currently the only supported) key format for bitcoin transactions. While the private keys should be secured by every validator, the public keys are shared among them and are written into Exonum blockchain.

To create an anchoring transactions `+2/3` of validators' signatures are needed.

### Transaction fees

A transaction fee represent a value in satoshis that is set as a fee for every anchoring transaction. It is advised to be a 2x-3x times bigger than average market fee, in order to be sure that anchoring transaction does not hang if the bitcoin network is spammed.

This value is written to the global configuration and is applied by all the validators.

### Anchoring schedule

This parameter defines how often anchoring should be executed. It defines the difference between block heights for anchored data states.

!!! note Example
	It is recommended to anchor with fixed interval between block heights (e.g., blocks `#1000`, `#2000`, `#3000`, ...). The interval may be chosen in a way that under normal conditions the interval between anchored blocks is between 10 minutes and 1 hour.
	
	Consider the following example: there is an Exonum blockchain with the normal interval between blocks equal to 3 seconds. If the blockchain is anchored each 1000 blocks, the interval between anchoring transactions is approximately 3000 seconds, or 50 minutes, i.e., within acceptable limits. The same blockchain could be anchored each 500 blocks (=25 minutes), or 200 blocks (=10 minutes).

Sometimes anchoring process timetable could differ from ideal. Such variations could be triggered by byzantine behavior of nodes, forking of bitcoin blockchain, or changing list of validators (anchoring PubKeys, see _Section 9.3_). For example, at the necessary height (`#1000` because of bitcoin blockchain fork nodes could not agree upon which anchoring transaction is the last one (and should be spent in the next anchoring tx). If so, nodes will wait until bitcoin network do not resolve its fork. Such situation is described in more details in the _Section 7_.	

### Bitcoin public keys

As it was written earlier, every validator should store its own private key. According public keys are stored in the global configuration.

### Funding UTXO

To refill anchoring address balance, system maintainers should generate bitcoin funding transaction that sends money to the current anchoring address. Such transaction should be manually written to the global settings to ensure all validators include it further. 

The funding UTXO should get enough confirmations before being used. However, the network do not check number of confirmations for the provided funding transaction; it is on administrators' duty.

## Anchoring transactions

### Multisig address as decentralization method

Decentralization during anchoring process is built over internal bitcoin multisignature addresses architecture.

When Exonum network should be anchored, every validator builds an anchoring transaction using [deterministic and unequivocal algorithm] (#build-anchoring-transaction). Its results should are guaranteed to match for every legitimate node. Such an anchoring transaction spend one or more UTXOs from the current anchoring multisig address. Bitcoin allows different validators sign this transactions separately from each other, thus every validator can sign it without regard for other validators.  All signatures are published into Exonum blockchain.

Exonum uses `M-of-N` multisig addresses, where `N` is a number of anchoring validators (`N` <= 15 because of bitcoin restrictions) and `M` is the necessary amount of signatures. In Exonum PBFT consensus, `M = 2/3*N + 1` is used as supermajority.

!!! note Example
	If there are `N=10` validators, then `M=7` represents a supermajority. That means, 7 signatures are required to build an anchoring transaction. If `N=4`, then `M=3` signatures are required.

After the necessary amount of signatures is published, any participant node can create correct and signed anchoring transaction and broadcast it to the bitcoin blockchain.

### Transaction malleability

As it was told, we need `M` signatures out of `N` validators to spend bitcoins from previous change-output. These signatures are publicly available for every validator (as they are openly written in assets-blockchain). More than `M` signatures can be published (and it is common situation); thus there is a special algorithm allowing to select `M` signatures deterministically. If all validators are legitimate, certain transaction is built unequivocally.

But any Byzantine node could step out from deterministic algorithm and change signature of anchoring transaction. Thus it creates transaction with the same anchor hash (the same data-output) but another tx-id and spread it to the bitcoin network. Such byzantine transactions make a problem: we want to build new anchoring transaction even if previous is still not included in any bitcoin block. But previous transaction could be substituted by byzantine one with another tx-id. That makes all later (already created) anchoring transactions useless.

To handle this problem, the process of selecting appropriate previous transaction is moved under the consensus ([LECT](#lect) section).

### LECT

Every anchoring transaction should spent a previous anchoring tx. By a multiple reasons such a transaction cannot be defined deterministically; thus, it is an object for validators' consensus.

Every validator defines which transaction should be spend in its opinion. Such transaction is called Last Expected Correct Transaction (LECT). LECT of all validators are published in the Exonum blockchain. While creating a new anchoring transaction, the network chooses common LECT (which is selected by validators' supermajority) and spend its change output.

Every validator should refresh its LECT with a custom schedule.
To get new LECT, the validator uses [bitcoin node's](#bitcoin-node) API. New LECT must have the following properties:

- It is valid anchoring transaction for the current Exonum blockchain
- It may have any amount of confirmations, in particular, 0
- Its change output should be not spent. That means that the specified validator believes there was no following anchoring transactions after this one
- Among all bitcoin transactions satisfying the previous properties, LECT should have the greatest anchored Exonum block height
- If multiple transactions respond to previous conditions, any of them may be chosen as a LECT.

The LECT solves transaction malleability problem, though anchoring chain may sometimes rollback and skip some anchoring transactions.


### Creating anchoring transaction

- Say `H` is the block height of the block that must be anchored (recall that determining the nearest `H` is fully deterministic given the blockchain data).
- Starting from this block `#H`, every validator monitors list of current LECTs. As soon as there is a common LECT (that is defined by `+2/3` validators), **anchoring transaction proposal** (the anchoring transaction without validators' sigs) is completely defined and is agreed upon by `+2/3` validators.
- Each signature have `SIGHASH_ALL` sighash type.
- Based on the signatures, _any_ party with sufficient access to the blockchain can create anchoring transaction and broadcast it to the Bitcoin network. Because of deterministic algorithm of selecting necessary signatures for new anchoring transaction every legitimate node must get the same anchoring tx (with the same tx-id).
- Every legitimate validator agreed with the selected LECT (and accordingly signed anchoring transaction proposal) updates its LECT with the hash of new complete anchoring transaction. Also every such validator send complete anchoring transaction to the Bitcoin network.
- If at the block `#H` there is no common LECT (that is agreed upon `+2/3` validators) than no anchoring happened. Exonum blockchain continue creating new blocks. All validators wait until some of them would update its anchoring chain and common LECT would be found. By the reason of uncertainty in the bitcoin blockchain common LECT could be found even after new time for anchoring comes. New state for anchoring is the last assets-blockchain state we need to anchor. For example now we are at the height `#11000` and anchoring should be held every `1000` blocks. But common LECT appeared only at the height `#12345`. In that case we anchor block `#12000` but there would be no anchor for block `#11000`

### Anchoring Transaction Proposal detailed structure

An anchoring transaction proposal is constructed as follows:

- It conform to the Bitcoin transaction specification
- The inputs are:

  - The change output of the selected common LECT. This input present in every anchoring transaction except the first one.
  - Funding UTXO written in the global configuration and not included in a previous anchoring transaction.

- The outputs contain a data output and the change output only. The change output is first, and the data output is second.

- The data output consist of multiple [data chunks](#data-chunks)

- The change output reroutes funds to the next anchoring address if the new anchoring is defined by the accepted configuration change proposal. Otherwise, the change output  puts funds to the same anchoring address

- The amount of rerouted funds is exactly the sum of inputs minus the transaction fee, specified at the service settings

### Data chunks

The data output consists of the following parts:

- an OP_RETURN instruction (`0x6a`)
- `EXONUM` at the ASCII-code (`0x45 0x58 0x4f 0x4e 0x55 0x4d`)
- a version of the current data output, 1 byte
- blockchain-state data chunk, encoded as described further
- (optional) a recovering data chunk, encoded as described further

Every data chunk is encoded as per Bitcoin Script spec (1-byte chunk length + byte sequence). All integer chunk parts are little-endian, as per the general guidelines of Bitcoin Script. 

- **TODO: is there any separator byte between two chunks?**
- **TODO: does every chunk includes its own length or there is a one data-output length value right after `OP_RETURN`?**

#### Blockchain-state data chunk

The chunk must be present in every anchoring transaction. 

- 8-byte zero-based unsigned height of the anchored block (i.e., the height of the genesis block is `0`)
- Block hash (variable length)

Block height allows for efficient lookups.

The hash function for the block hash is the function used internally in the blockchain. With SHA-256 is used, the data chunk size is `8 + 32 = 40` bytes. 

#### Recovery data chunk

Recovery chunk is be encoded as per Bitcoin Script spec (1-byte chunk length + byte sequence).

The data of the recovery chunk is structured as follows:

- 32-byte bitcoin transaction hash. This hash shows that the current anchoring chain is the prolongation of previously stopped anchoring chain. The possible reasons of such stops are described further.

The recovery output is optional and may appear in the very first bitcoin anchoring transaction only if the previous anchoring chain was failed (as described in the [Recovering the previous chain](#recovering-the-previous-chain)). 

**TODO: what length does recovery chunk have?**

## Verification

**TODO: is verification implemented anywhere?**

Anchors can be verified both in real time and retrospectively. The real-time verification is simpler, but it is insufficient for long-term non-repudiation.

### Real-Time Verification

Real-time verification should be held to ensure that anchoring process is going normally. All the parties replicating blockchain may do such verification; naturally, the validators must verify anchors.

1. The verifier monitors all spending transactions from the current anchoring address. Let `tx` denote a new such spending transaction.
2. If `tx` is a valid anchoring transaction, then the verifier checks if the chain block at height specified by the anchor has the same hash as specified by the anchor.
4. If the change output is directed to a new anchoring address, the verifier switches to monitoring the new address and stops monitoring the old anchoring address. The verifier checks that the new anchoring address is that inferred by a successful [change proposal](#transitional-transaction).
5. Otherwise, the verification succeeds.

If verification fails, any further updates to the blockchain are considered to be invalid. 

### Retrospective Verification and Blockchain Receipts

One of the goals of anchoring is to provide long-term non-repudiation, including the cases when the blockchain ceases functioning and there is no authoritative source as to the blockchain transactions or blockchain state. This problem is solved with the help of blockchain receipts.

**Blockchain receipt** for a blockchain transaction `tx` is:

- `tx` encoded as per the blockchain spec
- The path in the Merkle tree from `tx` to the transaction root of the block `b`, in which `tx` resides
- Header of `b` (including block header and validators' authorization)
- Header of `b_anc` - the first anchored block after `b`
- Hash of the `tx_anc` - the anchoring transaction for `b_anc`
- Hash link from `b_anc` to `b`

A blockchain receipt for the part of blockchain state is constructed in the same way, but with the state instead of `tx`, and the path in the state tree.

**Blockchain receipts** are retrospectively verified based on the following data:

- Generic blockchain spec (includes transaction and block formats)
- List of initial anchoring pubkeys
- Initial value of `m`

Note that initial anchoring pubkeys and initial `m` SHOULD be committed to the genesis block header in some way, so essentially only the genesis block hash is required.

**TODO: should be update with the respect to broken anchoring chains**

#### Inner blockchain checks

1. Verify that the receipt has all necessary data fields
2. Verify that fields have the correct form, e.g., `tx` is a valid transaction and `b` and `b_anc` are valid block headers
3. Verify that the `b`'s header commits to `tx`
4. Verify that the link from `b_anc` to `b` is valid

#### Anchoring checks

1. Verify that `tx_anc` is a bitcoin transaction
2. Verify that `tx_anc` is an anchoring transaction, without verifying authorization by proper validators yet
3. Verify that `b_anc` is anchored by `tx_anc`
4. Verify that `tx_anc` has proper authorization per the procedure below

Verifying authorization of `tx_anc`:

1. Calculate the initial anchoring address `addr`.
2. Load spending transactions from `addr` ordered as in the Bitcoin Blockchain, until the first transitional anchoring transaction is encountered, or spending txs are depleted. Let `txs` be the list of loaded transactions ordered as in the Bitcoin Blockchain.
3. If `tx_anc` is in `txs`, the check succeeds. XXX: If any transaction in `txs` is not an anchoring transaction, fail.
4. Else, if the last transaction in `txs` is a transitional anchoring transaction, assign `addr` to the new address specified by this transaction, and go to step 2.
5. If the last transaction in `txs` is not a transitional anchoring transaction, fail.

This procedure assumes that the validators had not gone rogue before `tx_anc`. If they had, this is probably public knowledge, so `tx_anc` is not considered valid in any case. 

## Changing validators list

The list of validators' anchoring keys may be changed by a multiple reasons:

- periodic key rotation
- changing the validators’ list: add/replace/remove some validators

Both ways require disabling old anchoring keys and add new ones. As well as the anchoring bitcoin address is a derivative from the list of anchoring public keys, it should be changed accordingly. Pub-keys list is stored in the global configuration; it can be updated by out-of-band means, for example, using [Configuration Update service](configuration.md). We may notice only the following properties:

1. New configuration is spread over nodes. It is still not active.
2. New configuration have additional parameter `height when this configuration should be applied`. It is chosen by administrator. The good sense is to choose height so config would be applied in ~3-6 hours after it was sent into Exonum blockchain.
3. After mentioned height takes place, new configuration is applied by every validator simultaneously. The list of validators finally is changed.

**It is important that pause between configuration appearing and configuration applying is big enough. It should be defined in accordance with necessary number of confirmations for the last LECT.**

### Transitional transaction

Anchoring pubkeys define new Anchoring BTC-address. In order to prolong anchoring chain, new anchoring transaction should spend previous anchoring address UTXO and send it to the new anchoring address. We must be confident such transaction would be written to the blockchain **before** we really change the list of validators. Thus we need suspend anchoring process.

- The anchoring service wait until common LECT is written to the Bitcoin blockchain.
- After common LECT appears and is written to the Bitcoin blockchain, the service waits until it will gather sufficient number of confirmations (ex., `24`).
- Further transitional Anchoring transaction proposal is generated. That transaction moves money to the new anchoring address. 
- As anchoring chain is already moved to the new anchoring address, Exonum nodes wait until new validator set is applied. The anchoring process is resumed after.

Such process could suspend anchoring transaction on fairly a big time. For example, if the service waits until 24 confirmations, total pause could last for 4-6 hours.

If last LECT does not get enough confirmations before the Exonum blockchain moves to the new validators list then anchoring chain is **BROKEN** and could not be prolonged. Anchoring service would log a lot of warnings.

## Recovering broken anchoring

After anchoring chain was broken administrators must generate new funding transaction to the new anchoring address and add it to the global configuration as funding UTXO. New anchoring chain will produced, starting with this funding tx. The very first anchoring transaction from this chain would include optional [anchoring-recovering data chunk](#recovery-data-chunk) in the data output.

## Available API

The service provides the following public API endpoints:

 - [Get actual anchoring address](#actual-address)
 - [Get next anchoring address](#following-address)
 - [Get actual lect for this validator](#actual-lect-for-this-validator)
 - [Get actual lect for another validator](#actual-lect-for-another-validator)
 
All REST endpoints share the same base path, denoted **{base_path}**,
equal to `/api/services/btc_anchoring/v1`.

!!! tip
    See [*Services*](../../architecture/services.md) for a description of
    types of endpoints in services.

 
### Actual address

` GET {base_path}/address/actual`

Returns the current anchoring btc-address

#### Parameters

None.

#### Response

The string with a value of anchoring address:

`2NFGToas8B6sXqsmtGwL1H4kC5fGWSpTcYA`

If the anchoring is executing over the bitcoin mainnet, then anchoring P2SH address starts with `3`.

### Following address

`GET {base_path}/address/following`

If the network plans to [change the validators list in future](#transitional-transaction), then the next anchoring address is returned. Otherwise, `null` is returned. **TODO: yes, null?**
 
#### Parameters

None.

#### Response

The same format as for the actual anchoring address, the string with a value of anchoring address:

`2NFGToas8B6sXqsmtGwL1H4kC5fGWSpTcYA`
 
### Actual LECT for this validator

`GET {base_path}/actual_lect`

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

- **payload/blockhash**: the hash of the anchored Exonum block
- **payload/block_height**: the height of the anchored Exonum block
- **payload/prev_tx_chain**: the tx-id for the anchoring transaction which is spent by the specified LECT. **TODO: yes?**
- **txid**: the hash for the anchoring bitcoin transaction, which is considered to be a LECT.

### Actual LECT for this validator

`GET {base_path}/actual_lect/:id`

The actual LECT for the specified validator is returned, along with the hash of Exonum transaction published this LECT.
#### Parameters

id: unsigned 32-bit integer

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

- **hash**: the hash of Exonum transaction, where the specified validator published this LECT
- **content**: the LECT in the same format as in `actual_lect` API
- **content/payload/blockhash**: the hash of the anchored Exonum block
- **content/payload/block_height**: the height of the anchored Exonum block
- **content/payload/prev_tx_chain**: the tx-id for the anchoring transaction which is spent by the specified LECT. **TODO: yes?**
- **content/txid**: the hash for the anchoring bitcoin transaction, which is considered to be a LECT.
