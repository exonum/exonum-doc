# Anchoring service

The anchoring service is developed to increase product security and provide non-repudiation for Exonum applications. Service publishes assets-blockchain state hash to the bitcoin blockchain. ....

 achieves full accountability of private blockchain maintainers/validators, long-term non-repudiation, and resistance of the system to DoS, including (but not limited to) a complete shutdown of the Exonum blockchain infrastructure.
 
!!! note "Another pages about anchoring service"
	This page describe mostly how the service do work; however, there is a separate page, describing how the service should be [configured and deployed][anchoring-deploy].

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

## Setups

Anchoring requires additional settings to be set. There are both local and global configuration settings. Local are accepted just to the current node, while global are shared between all the validators.

The settings can be updated in the same way as other conriguration parameters do; for example, the global configuration should be updated through the [Configuration Update service](configuration.md)

### Bitcoind node

The service uses third-party bitcoin node to communicate with the bitcoin blockchain network. As for Exonum v 0.1, [Bitcoin Core][bitcoind] is supported only.

You need to specify the following settings to access the bitcoind node:

- bitcoind host
- bitcoind rpc username
- bitcoind rpc password

It is strongly advised to have a separate bitcoind node for every validator; otherwise the single bitcoind node represents a centralisation point and brings a weakness into the anchoring process.

### Anchoring private keys

Every validator should posess its own secp256k1 EC keypair in order to participate in anchoring process. This is the standard (and currently the only suported) key format for bitcoin transactions. While the private keys should be secured by every validator, the public keys are shared among them and are written into Exonum blockchain.

To create an anchoring transactions `+2/3` of validators' signatures are needed.

### Transaction fees

A transaction fee represent a value in satoshis that is set as a fee for every anchoring transaction. It is advised to be a 2x-3x times bigger then average market fee, in order to be sure that anchoring transaction does not hang if the bitcoin network is spammed.

This value is written to the global configuration and is applied by all the validators.

### Anchoring schedule

This parameter defines how often does anchoring should be executed. It defines the difference between block heights for anchored data states.

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

### Multisig address as decentralisation method

Decentralisation during anchoring process is built over internal bitcoin multisignature addresses architecture.

When Exonum network should be anchored, every validator builds an anchoring transaction using [determenistic and uneqivocable algorithm](#build-anchoring-transaction). Its results should are guaranteed to match for every legitimate node. Such a anchoring transaction spend one or more UTXOs from the current anchoring multisig address. Bitcoin allows different validators sign this transactions separately from each other, thus every validator can sign it without regard for other validators.  All signatures are publicated into Exonum blockchain.

Exonum uses `M-of-N` multisig addresses, where `N` is a number of anchoring validators (`N` <= 15 because of bitcoin restrictions) and `M` is the necessary amount of signatures. In Exonum PBFT consensus, `M = 2/3*N + 1` is used as supermajority.

!!! note Example
	If there are `N=10` validators, then `M=7` represents a supermajority. That means, 7 signatures are required to build an anchoring transaction. If `N=4`, then `M=3` signatures are required.

After the necessary amount of signatures is publicated, any participant node can create correct and signed anchoring transaction and broadcast it to the bitcoin blockchain.

### Transaction malleability

As it was told, we need `M` signatures out of `N` validators to spend bitcoins from previous change-output. These signatures are publicly available for every validator (as they are openly written in assets-blockchain). More than `M` signatures can be publicated (and it is common situation); thus there is a special algorithm allowing to select `M` signatures deterministically. If all validators are legitimate, certain transaction is built uneqivocably.

But any Byzantine node could step out from deterministic algorithm and change signature of anchoring transaction. Thus it creates transaction with the same anchor hash (the same data-output) but another tx-id and spread it to the bitcoin network. Such byzantine transactions make a problem: we want to build new anchoring transaction even if previous is still not included in any bitcoin block. But previous transaction could be substituted by byzantine one with another tx-id. That makes all later (already created) anchoring transactions useless.

To handle this problem, the process of selecting appropriate previous transaction is moved under the consensus ([LECT](#lect) section).

### LECT

Every anchoring transaction should spent a previous anchoring tx. By a multiple reasons such a transaction can not be defined determenistically; thus, it is an object for validators' consensus.

Every validator defines which transaction should be spend in its opinion. Such transaction is called Last Expected Correct Transaction (LECT). LECT of all validators are publicated in the Exonum blockchain. While creating a new anchoring transaction, the network chooses common LECT (which is selected by validators' supermajority) and spend its change output.

Every validator should refresh its LECT with a custom schedule.
To get new LECT, the validator uses [bitcoin node's](#bitcoin-node) API. New LECT must have the following properties:

- It is valid anchoring transaction for the current Exonum blockchain
- It may have any amount of confirmations, in particular, 0
- Its change output should be not spent. That means that the specified validator believes there was no following anchoring transactions after this one
- Among all bitcoin transactions satisfying the previous properties, LECT should have the greatest anchored Exonum block height
- If multiple transactions respond to previous conditions, any of them may be choosed as a LECT.

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

### Blockchain-state data chunk

The chunk must be present in every anchoring transaction. 

- 8-byte zero-based unsigned height of the anchored block (i.e., the height of the genesis block is `0`)
- Block hash (variable length)

Block height allows for efficient lookups.

The hash function for the block hash is the function used internally in the blockchain. With SHA-256 is used, the data chunk size is `8 + 32 = 40` bytes. 

### Recovery data chunk

Recovery chunk is be encoded as per Bitcoin Script spec (1-byte chunk length + byte sequence).

The data of the recovery chunk is structured as follows:

- 32-byte bitcoin transaction hash. This hash shows that the current anchoring chain is the prolongation of previously stopped anchoring chain. The possible reasons of such stops are described further.

The recovery output is optional and may appear in the very first bitcoin anchoring transaction only if the previous anchoring chain was failed (as described in the [Recovering the previous chain](#recovering-the-previous-chain)). 

**TODO: what length does recovery chunk have?**

## verification (blockchain receipts)

## transitional transaction

## recovering

## available API

## service transactions for assets-blockchain
