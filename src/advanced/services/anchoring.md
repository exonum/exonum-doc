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

 
### 1.1\. Glossary of Terms

**TODO:**

- Anchoring transaction
- Anchoring (pub)keys
- Validator
- Last Expected Correct Transaction (LECT)
- Auditing node
- Lightweight node
- Funding UTXO

The approach is currently applicable for no more than 15 validators as per the restrictions on standard transactions in Bitcoin.

It is assumed that each validator possesses a key pair for anchoring in a cryptosystem recognized by Bitcoin (currently, only secp256k1 EC cryptosystem). The anchoring pubkeys MUST be known to all blockchain clients. The anchoring pubkeys MAY be certified, e.g., within a X.509 PKI. The anchoring private keys MAY be secured with an HSM.

It is assumed that there exists a blockchain mechanism for agreeing on the changes to the blockchain configuration. In the following specification, this mechanism will be used for the following configuration parameters:

- **Anchoring key set**, which may be caused by key rotation and/or by admitting new validators or removing validators from the validator set
- **Anchoring transaction fee** to be used in all following anchoring transactions until amended by a new configuration change
- **List of funding UTXOs** to be spent in the nearest anchoring transaction

### 2.1\. Design Rationale

#### 2.1.1\. Authorized anchoring


The idea of the anchoring approach described in this spec is simple: As soon as there appears an invalid anchor, the system is **broken**. We don't really care _why_ the system is broken (this MUST be determined by the out-of-band means); the key point that there is **never** a situation when there is an invalid anchor, but the blockchain itself is fine. This hypothetical situation would be detrimental for long-term non-repudiation, and may be confusing for real-time anchor verification as well (Huh? There are two contradicting anchors? Who's in the right here? Who was in the right when it all happened 20 years ago?).
#### 2.1.2\. Feedback from Bitcoin

Due to real life restrictions, Bitcoin blockchain could be forked and some of already sent anchoring transactions could be not written to the main chain of Bitcoin blockchain. Also, on malicious behavior of some validators, new bitcoin block could contain anchoring transaction that is not expected by legitimate nodes. In total, anchoring process SHOULD be flexible enough to depend on certain situation in the bitcoin blockchain and thus is not really deterministic.

In order to get the view of the Bitcoin Blockchain, the validators SHOULD maintain full nodes or SPV nodes.

## 3\. Setup

Let `pk_1`, `pk_2`, `pk_n` and `sk_1`, `sk_2`, `sk_n` denote the anchoring public and private keys of validators (`n <= 15` is the total number of validators). The public keys `pk_i` MUST be ordered alphabetically when using the encoding of a compressed key used in Bitcoin Script (i.e., each public key in this form is encoded as 33 bytes - 0x02 or 0x03 depending on the parity of the y coordinate, plus 32 bytes for the x coordinate, the most significant byte first).

Let m denote the minimal number of validators required for anchoring. For Byzantine fault tolerance, `m = floor(2*n/3)`. For stop fault tolerance, `m = floor(n/2)`. For no fault tolerance, `m = 1`. `m` value SHOULD correspond to the fault tolerance assumptions of the anchored blockchain.

The **locking script** for the multisignature is

```
m pk_1 pk_2 ... pk_n n CHECKMULTISIG
```

The corresponding **unlocking script** is of form

```
0 sig_i_1 sig_i_2 ... sig_i_m
```

where `sig_i_j` is a signature keyed by a public key belonging to a validator `i_j`, and the sequence `i_j` is monotonically increasing.

The locking script can be used to derive the **anchoring address** as per the Bitcoin specification. The anchoring address is used as follows:

- By validators: to determine available funds for anchoring
- By validators, auditors, and lightweight nodes: to monitor anchoring transactions

The **anchoring balance** `bal` is the set of sufficiently confirmed bitcoin UTXOs sent to the anchoring address. The anchoring balance MAY be replenished by the validators or third parties. The using of new funding UTXO SHOULD take in account flexible behavior of anchoring process (see the _Sections 5.1, 8.2_). The replenishment procedure is partly described at the _Section 8.2_.

### 3.1\. Anchoring Schedule

The anchoring basic schedule MUST be agreed upon among the validators (e.g., as a part of consensus rules). Changes to the schedule MUST be announced on the blockchain as configuration changes as specified in _Section 2_.



## 4\. Anchoring Structure

**Anchoring transaction** has the semantics of recording a proof of existence of a specific blockchain state and transaction history, authorized by the current blockchain validators. Additionally, it MAY specify a change in the validator pubkey set (in this case, the transaction is called a **transitional anchoring transaction**). The concrete instantiation of the anchoring transaction is as follows:

- It MUST conform to the Bitcoin transaction specification
- It MUST contain at least two outputs
- The first output, called the **data output**, MUST be the OP_RETURN output structured as described in _Section 4.1_
- The second output, called the **change output**, MUST specify the anchoring address for the next anchor (i.e., it MUST be equivalent to the multisig locking script described above)
- The optional third output, called the **recovery output**. It MAY appear in the very first transaction of anchoring chain if the previous anchoring chain was broken. If exists, then it MUST be the OP_RETURN output structured as described in _Section 4.2_
- The first transaction input MUST contain a multisig witness described above, with signatures covering at least the data output and the change output. If a BFT blockchain is anchored, at most `-1/2` of sigs in the first input MAY NOT cover the data and change outputs. This is because Byzantine validators may mutate these signatures after the anchoring tx is assembled. Signatures not covering the data output and the change output SHOULD be investigated out of band.

### 4.1\. Data output

The data output MUST consist of an OP_RETURN instruction (0x6a) followed by a blockchain-state data chunk encoded as per Bitcoin Script spec (1-byte chunk length + byte sequence).

- 8-byte zero-based unsigned height of the anchored block (i.e., the height of the genesis block is `0`)
- Block hash (variable length)

All integer chunk parts MUST be little-endian, as per the general guidelines of Bitcoin Script.

Block height allows for efficient lookups.

The hash function for the block hash MUST be the function used internally in the blockchain. If SHA-256 is used, the data chunk size is `8 + 32 = 40` bytes. If SHA-512 is used, the data chunk size is `8 + 64 = 72` bytes, which is less than the current maximum size of a data chunk for a standard bitcoin transaction (80 bytes).

### 4.2\. Optional outputs

In addition to the necessary Data output and change output, other outputs MAY present. Such outputs are structured as follows:

- OP_RETURN instruction (0x6a)
- Output version as (one byte). Each type of output should have its own version number.
- Some data chunk. The structure of that chunk depends on a type of the output.

#### 4.2.1\. Recovery output

Output version for recovery output is `01`. Recovery chunk MUST be encoded as per Bitcoin Script spec (1-byte chunk length + byte sequence).

The data of the recovery chunk is structured as follows:

- 32-byte bitcoin transaction hash. This hash shows that the current anchoring chain is the prolongation of previously stopped anchoring chain. The possible reasons of such stops are described further.

The recovery output is optional and MAY appear in the very first bitcoin anchoring transaction only if the previous anchoring chain was failed.

### 4.3\. Anchoring transaction malleability

As it was told, each anchoring bitcoin transaction should spend UTXO from the previous anchoring transaction. That builds an anchoring chain.

In order to spend bitcoins from previous change-output, we need M signatures out of N validators. These signatures are publicly available for every validator (as they are openly written in assets-blockchain). If all validators are legitimate, certain signature is built deterministically. But any Byzantine node could step out from deterministic algorithm and change signature of anchoring transaction. Thus it creates transaction with the same anchor hash (the same data-output) but another tx-id and spread it to the bitcoin network. Such byzantine transactions make a problem: we want to build new anchoring transaction even if previous is still not included in any bitcoin block. But previous transaction could be substituted by byzantine one with another tx-id. That makes all later (already created) anchoring transactions useless. Solution of this problem lies at the _Sections 5.1, 5.2_

## 5\. Last Expected Correct Transaction (LECT)

Each validator MUST keep a chain of the last K anchoring bitcoin transactions. Each transaction spends change-UTXO from the previous tx; the change-UTXO from the last transaction is not spent. K SHOULD be big enough to be sure that all validators agree with the started tx. For example if we try to anchor each 10 minutes K could be equal to 144 as we believe the bitcoin blockchain as irreversible and unchangeable on that scale. Such chains MAY differ for different validators. Each validator appoints the last transaction of that chain to be a Last Expected Correct Transaction (LECT). In the every assets-block each validator's LECT is publicized so everybody know what LECT transactions do validators appoint.

Validators MUST check if their current LECT matches with their LECT published in assets-blockchain with a certain interval (for example, such check MAY be held on each assets-block). If by some reasons its current LECT differs from the one stated in the assets blockchain, the validator MUST re-broadcast message (or a service transaction) to update its LECT value in assets-blockchain.

### 5.1\. Update of Last Expected Correct Transaction by validator

All validators SHOULD sometimes update its LECT according to the new bitcoin blockchain state. Every validator set its own interval between updates according to its network connection and hardware characteristics. Such interval SHOULD be small enough for validator to be up-to-date. At the necessary time validator SHOULD update its anchoring chain. Last transaction of that new chain is defined as new LECT and MUST be propagated to the next block of the assets-blockchain. For example, algorithm of updating could be such:

1. Each validator keeps the current anchoring multisig-address and track for its transactions.
2. Each validator keeps (and respectively updates) the list of the already known anchoring transactions.
3. Validator checks list of unspent UTXOs for the current anchoring multisig-address. Node should check not only confirmed UTXOs but also transactions that are in mempool yet.
4. Each UTXO SHOULD have one of the following types:

  1. Unspent transaction MAY already be known to validator as anchoring one; if so, then it is our LECT.
  2. Unspent transaction MAY look like funding one; if so, we SHOULD check it over the initial funding transaction. That case is the only one when LECT is not anchoring transaction.
  3. Unspent transaction MAY look like anchoring one, but is unknown to validator yet; if so, then we MUST check if it have anchoring transaction as one of its inputs. We check its inputs in the same way as we checked transaction itself.

5. Unspent transaction is neither anchoring one nor funding one; if so, it can not be the LECT.

  Such approach could be implemented using BitcoinCore `listunspent` RPC method. However, there is a weakness for spam: every time we update our LECT we should check every unspent UTXO from the anchoring multisig-address. Malefactor can send a lot of dummy txs that would slow process. Normally there should be strictly one anchoring transaction with unspent change-output. But if we are moving to the new anchoring multisig-address we MAY find no appropriate UTXOs. See _Section 9.3.1_ for details.

### 5.2\. Different interactions between _old LECT_ and _new LECT_

Let us call the last anchoring transaction already known to us as _old LECT_; respectively, we will call result of the previously described procedure as _new LECT_. Please, note that _old | new_ are not about transaction timestamp: _old_ means "we knew that LECT before updating", while _new_ means "the LECT after updating".

1. _old LECT_ is the same as _new LECT_. LECT is still the last tx of anchoring bitcoin. Nothing changed.
2. _new LECT_ is located after _old LECT_ in the anchoring chain. That means other validators anchored new block but the current node for some reason did not participated in it. Validator MUST publish new LECT into assets blockchain (see _Section 5_)
3. _new LECT_ is already included in the list of anchored transactions, but it differs from _old LECT_. For some reasons Bitcoin node left all the following transactions (for example, bitcoin node was rebooted and cleared its mempool). The current node SHOULD re-broadcast these following already created anchoring transactions to the bitcoin node.
4. _new LECT_ is unknown to the current node but it have common root with _old LECT_ (different than _old LECT_ itself). Graphically:

  ```
  tx1 --> tx2 --> ... --> old LECT
  ^^^^^-> new LECT
  ```

  Such situation MAY appear because of _transaction malleability_ (see _Section 4.3_). All previously generated anchoring transactions following `tx2` are useless now and could not be included to the Bitcoin blockchain anymore. Validator MUST publish new LECT into assets blockchain (see _Section 5_)

## 6\. Anchoring Verification

Anchors can be verified both in real time and retrospectively. The real-time verification is simpler, but it is insufficient for long-term non-repudiation (see _Section 2.1_).

### 6.1\. Real-Time Verification

Anchors SHOULD be verified in real time by all parties replicating the blockchain in whole or in parts; in particular, all full nodes and lightweight nodes. Naturally, the validators MUST verify anchors.

The rules for verification is as follows:

1. The verifier MUST monitor all spending transactions from the current anchoring address. Let `tx` denote a new spending transaction from such an address.
2. If `tx` is a valid anchoring transaction as per _Section 4_, then the verifier checks if the chain block at height specified by the anchor has the same hash as specified by the anchor. If not, the verifier MUST fail verification.
3. If `tx` is not a valid anchoring transaction, the verifier SHOULD **TODO: what?**.
4. If the change output is directed to a new anchoring address, the verifier MUST switch to monitoring the new address and SHOULD stop monitoring the old anchoring address. The verifier MUST check that the new anchoring address is that inferred by a successful change proposal (_Section 6.2_) provided the verifier has access to the proposal. If the new anchoring address differs, the verifier MUST fail verification.
5. Otherwise, the verification succeeds.

If verification fails, the verifier MUST consider any further updates to the blockchain invalid. The verifier SHOULD engage an out-of-band protocol to determine the cause(s) of the failure.

OPTIONAL checks that SHOULD alert the verifier (but MAY NOT be the cause of immediate action):

- The same block is anchored multiple times
- A block is anchored in the far past (say, block `#1000` when the verifier is aware of an anchor for block `#1,000,000`)
- A block is anchored in the far future (say, block `#1,000,000` when by the verifier's calculations a block at this height should be created in 10 years)

In the case anchoring txs are absent for a prolonged period of time (e.g., 6 hours), the verifier SHOULD engage in an out-of-band procedure to determine the cause.

### 6.2\. Retrospective Verification and Blockchain Receipts

One of the goals of anchoring is to provide long-term non-repudiation, including the cases when the blockchain ceases functioning and there is no authoritative source as to the blockchain transactions or blockchain state. This problem is solved with the help of blockchain receipts.

**Blockchain receipt** for a blockchain transaction `tx` is:

- `tx` encoded as per the blockchain spec
- The path in the Merkle tree from `tx` to the transaction root of the block `b`, in which `tx` resides
- Header of `b` (including block header and validators' authorization)
- Header of `b_anc` - the first anchored block after `b`
- Hash of the `tx_anc` - the anchoring transaction for `b_anc`
- Hash link from `b_anc` to `b`

A blockchain receipt for the part of blockchain state is constructed in the same way, but with the state instead of `tx`, and the path in the state tree.

In order to minimize the length of hash links, each anchored block MAY reference hashes of all blocks `b` such that they are not referenced by any other anchored block. For example, if blocks at height `0`, `1000`, `2000`, ... are anchored, a block `#2000` may include references to blocks `#1000`, `#1001`, ..., `#1999`. These references MAY be organized as a Merkle tree to yield compact block headers and receipts.

**Blockchain receipts** are retrospectively verified based on the following data:

- Generic blockchain spec (includes transaction and block formats)
- List of initial anchoring pubkeys
- Initial value of `m`

Note that initial anchoring pubkeys and initial `m` SHOULD be committed to the genesis block header in some way, so essentially only the genesis block hash is required.

#### 6.2.1\. Inner blockchain checks

1. Verify that the receipt has all necessary data fields
2. Verify that fields have the correct form, e.g., `tx` is a valid transaction and `b` and `b_anc` are valid block headers
3. Verify that the `b`'s header commits to `tx`
4. Verify that the link from `b_anc` to `b` is valid

#### 6.2.2\. Anchoring checks

1. Verify that `tx_anc` is a bitcoin transaction
2. Verify that `tx_anc` is an anchoring transaction, without verifying authorization by proper validators yet
3. Verify that `b_anc` is anchored by `tx_anc`
4. Verify that `tx_anc` has proper authorization per the procedure below

Verifying authorization of `tx_anc`:

1. Calculate the initial anchoring address `addr`.
2. Load spending transactions from `addr` ordered as in the Bitcoin Blockchain, until the first transitional anchoring transaction. XXX: Is there an efficient way to query spending txs and/or transitional anchoring txs? is encountered, or spending txs are depleted. Let `txs` be the list of loaded transactions ordered as in the Bitcoin Blockchain.
3. If `tx_anc` is in `txs`, the check succeeds. XXX: If any transaction in `txs` is not an anchoring transaction, fail.
4. Else, if the last transaction in `txs` is a transitional anchoring transaction, assign `addr` to the new address specified by this transaction, and go to step 2.
5. If the last transaction in `txs` is not a transitional anchoring transaction, fail.

An additional heuristic MAY be applied: once the minimum block height for transactions in `txs` is significantly greater than `tx_anc`, fail. For the procedure described in _Section 7_, the ordering of anchoring txs on the Bitcoin Blockchain coincides with their generation order. Hence, the verification MUST fail as soon as any transaction in `txs` is later than `tx_anc` and `tx_anc` is not in `txs`.

This procedure assumes that the validators had not gone rogue before `tx_anc`. If they had, this is probably public knowledge, so `tx_anc` is not considered valid in any case. However, additional checks MAY be applied, e.g. to check that there are no two anchors at the same height.

XXX: anchoring some shit is a more viable case, yet we don't consider it. A third party may publish a conflicting block header on the BB (sort of, it takes much place), but how do we find it?

**TODO: suspicious signs, like anchoring schedule, etc.**

### 6.3\. Hybrid Verification

A variant of real-time verification could be adopted for "near" real-time verification, e.g., by syncing full or lightweight nodes. In this case, the latest blockchain state known by the node should not be that far behind the current state, so the verification procedure is simpler than retrospective verification described above.

## 7\. Creating Anchoring Transactions

This section describes generation of anchoring transactions in Exonum-BFT.

- Say `H` is the block height of the block that MUST be anchored (recall that determining the nearest `H` is fully deterministic given the blockchain data). Block `#H` is accepted using generic blockchain rules.
- Starting from this block `#H`, every validator monitors list of current LECTs. As soon as there is a common LECT (that is defined by `+2/3` validators), **anchoring transaction proposal** (the anchoring transaction without validators' sigs) is completely defined and is agreed upon by `+2/3` validators.
- Any proposal of block `#(H+1)` MUST include special type transactions from `+2/3` of validators (the exact number: e.g., 7 in a 10-party consensus), each of which contains signatures on the all inputs of the anchoring transaction proposal of a specific validator. Any block proposal with the incorrect amount of these signatures is invalid and MUST NOT be processed.
- Each signature MUST have `SIGHASH_ALL` sighash type.
- _All_ signatures from a specific validator MUST be valid for the corresponding transaction to be valid
- Based on the signatures, _any_ party with sufficient access to the blockchain can create anchoring transaction and broadcast it to the Bitcoin network. Because of deterministic algorithm of selecting necessary signatures for new anchoring transaction every legitimate node MUST get the same anchoring tx (with the same tx-id).
- Every legitimate validator agreed with the selected LECT (and accordingly signed anchoring transaction proposal) SHOULD update its LECT with the hash of new complete anchoring transaction. Also every such validator MAY send complete anchoring transaction to the Bitcoin network.
- If at the block `#H` there is no common LECT (that is agreed upon `+2/3` validators) than no anchoring happened. Assets-blockchain continue to create new blocks. All validators wait until some of them would update its anchoring chain and common LECT would be found. By the reason of uncertainty in the bitcoin blockchain common LECT could be found even after new time for anchoring comes. New state for anchoring is the last assets-blockchain state we need to anchor. For example now we are at the height `#11000` and anchoring should be held every `1000` blocks. But common LECT appeared only at the height `#12345`. In that case we anchor block `#12000` but there would be no anchor for block `#11000`

### 7.1\. Anchoring Transaction Proposal

An anchoring transaction proposal is constructed as follows:

- It MUST conform to the Bitcoin transaction specification with SegWit activated (except having no signature witnesses for the transaction inputs)
- The inputs are:

  - The change output of the selected common LECT. This input MUST present in every anchoring transaction except the first one.
  - Funding UTXOs agreed upon as configuration changes and not included in a previous anchoring transaction The inputs are ordered using BIP 69 [BIP69]

- The outputs MUST contain a data output and the change output, and the optional allowed outputs only. The data output MUST be first, and the change output MUST be second

- The data output MUST anchor correct information as per _Section 4.1_

- The change output MUST reroute funds to the next anchoring address iff the new anchoring is defined by the accepted configuration change proposal. Otherwise, the change output MUST put funds to the same anchoring address

- The amount of funds MUST be exactly the sum of inputs minus the transaction fee, specified as per the blockchain configuration

The whole procedure MAY be automated as a smart contract, which outputs the anchoring transaction proposal.

## 8\. Assets transaction zonation

Due to uncertainty in the status of the last anchoring transactions, blocks of the assets blockchain could be divided into zones according to their anchoring status confidence.

- Green zone: blocks whose first anchoring transactions have enough confirmations in the bitcoin blockchain and thus could be not deleted (for example, >= 144 confirmations)
- Yellow zone: blocks whose anchoring transactions are already written to the blockchain but have small number of confirmations. They are very unlikely to be deleted.
- Orange zone: blocks whose anchoring transactions is already generated and sent to the Bitcoin blockchain but still have 0 confirmations. In some cases such anchors could be removed.
- Red zone: blocks that appeared after last anchoring transaction was generated. They are still not anchored at all.

## 9\. Changing Configuration

### 9.1\. Fee value

There is no constraints as to the fee value, other than being non-negative. Sound values SHOULD be determined based on the sufficiently confirmed part of the Bitcoin Blockchain (so that it is shared among all validators).

The fee value is applied to all following anchoring transactions after it is accepted.

### 9.2\. Funding UTXOs

A funding UTXO is referred to as a pair `(txid, outnum)`. It MUST be locked with the locking script of the anchoring address.

1. It MUST be added by administrators through configuration changing manually.
2. Each validator monitors configuration changes.
3. After new configuration is accepted by every node (it takes place on the height `H` specified by administrator; accepting new configuration is out of the scope for this document) we believe new funding transaction can be used. It should have enough confirmations to this moment. However, administrator is responsible for this and nodes do not check number of confirmations for UTXOs.
4. Each validator checks last funding-txs defined in configuration and filters only such UTXOs that have not being spent yet.
5. The whole system add funding UTXO as a second input for the next anchoring transaction.

Such approach solves following questions:

1. Each funding UTXO MUST NOT be spent twice;
2. Each funding UTXO MUST be spent only after a sufficient number of confirmations (guaranteed by administrator);
3. Sometimes because of byzantine transaction or Bitcoin forks validator could throw out some already generated anchoring transactions. If one of such transactions is spending funding UTXO than that UTXO would be re-applied to the very first new anchoring transaction (after throwing out previous ones)

### 9.3\. Anchoring pubkeys

Anchoring pubkeys MAY be changed in the course of periodic key rotation. Alternatively, they MUST be changed when the validator set changes. The keys MUST be specified in the compressed 33-bytes form, as in Bitcoin. The validity of anchoring pubkeys is governed by generic Bitcoin rules. Further validity SHOULD be established by out-of-band means. Validator set is changed by applying a new configuration. Such configuration is generated by administrators manually and is out of the scope. We may note only the following properties:

1. New configuration is spread over nodes. It is still not active.
2. New configuration have additional parameter `height when this configuration should be applied`. It is chosen by administrator. The good sense is to choose height so config would be applied in ~3-6 hours after it was sent into Exonum blockchain.
3. After mentioned height takes place, new configuration is applied by every validator simultaneously.

**It is important that pause between configuration appearing and configuration applying is big enough. It should be defined in accordance with necessary number of confirmations for the last LECT.**

#### 9.3.1\. Transitional transaction

Anchoring pubkeys define new Anchoring BTC-address. In order to prolong anchoring chain, new anchoring transaction should spend previous anchoring address UTXO and send it to the new anchoring address. We MUST be confident such transaction would be written to the blockchain **before** we really change the list of validators. Thus we need suspend anchoring process.

- We SHOULD wait until last already existed anchoring BTC transaction is written to the Bitcoin blockchain. We do not need all really generated txs to be written; it's sufficient that common LECT would be written.
- After common LECT appears and is written to the Bitcoin blockchain, we MUST wait until it will gather sufficient number of confirmations (ex., `24`).
- Further we SHOULD generate Anchoring transaction proposal that would move money to the new anchoring address. Lets call such anchoring transaction as transitional.
- As anchoring chain is already moved to the new anchoring address we MUST wait until new validator set is applied.
- Anchoring process SHOULD be resumed. We do not wait until transitional transaction get enough confirmations.

Such process could suspend anchoring transaction on fairly a big time. For example, if we would wait until 24 confirmations, total pause could last for 4-6 hours.

If last LECT do not get enough confirmations before we move to the new validators list then anchoring chain is **BROKEN** and could not be prolonged. Anchoring service would log a lot of warnings.

#### 9.3.2\. Recovering broken anchoring

After anchoring chain was broken (_Section 9.3_) administrators MUST generate new funding transaction to the new anchoring address and spread it through Exonum blockchain. New anchoring chain WOULD be produced. The very first anchoring transaction from this chain would include optional anchoring-recovering data chunk in the data output.

## 10\. Pushing Anchoring Transactions onto Bitcoin Blockchain

A completed anchoring transaction is a (transitional) anchoring tx proposal supplied with at least `m` anchoring signatures for each input.

- A completed anchoring transaction SHOULD be pushed to the Bitcoin network by the proposer of the block at height `H+1`.
- If a validator has more sigs for a completed anchoring tx than necessary, the validator SHOULD use sigs belonging to the anchoring pubkeys with the least indices as specified by the ordering in _Section 3_. Note that as a result, the validator MAY omit his own signatures from the transaction.
- If a completed tx is not pushed to the network for 1 minute (**TODO: parameter?**) after a validator receives data necessary for its creation, the validator SHOULD push the completed tx on his own.

Note that a completed anchoring transaction MAY reference UTXOs created by previous anchoring transactions, which are not yet confirmed. This situation is normally processed by the Bitcoin nodes; a chain of unconfirmed transactions is stored in the mempool and is gradually confirmed. There are limits on the length of unconfirmed transaction chains dictated by the node policies (i.e., these rules are local and configurable, and not a part of consensus). By default, the maximum number of unconfirmed transaction ancestors/descendants is 25 [BtcMainH]. This SHOULD be enough for the anchoring intervals mentioned in _Section 3.1_.

As alias for the new Anchoring transaction could be created by byzantine node (i.e. transaction with the same outputs, but different list (or order) of signatures, thus having new tx-id) there is no guarantee that transaction would be written to the Bitcoin blockchain sometime.

Moreover, as new Anchoring transaction is based on the selected LECT that could be still in the mempool and could be substituted by another byzantine transaction, there is no guarantee that this anchored block would be really anchored sometime.

Sometimes bitcoin transactions do not want to confirm; that's a harsh reality of life. The following mechanisms SHOULD be used to minimize the risk of non-confirming anchoring transactions:

- Transaction fees SHOULD be market-driven and MAY be greater than that (e.g., 2x market value)
- If the newly created anchoring transaction cannot be broadcast to the Bitcoin network because it exceeds the unconfirmed tx depth, it MUST be stored by all validators and broadcast after the first of anchoring transactions is confirmed
- Unconfirmed anchoring transactions SHOULD be periodically re-broadcast as per generic recommendations
- The validators MAY conclude a SLA agreement with one or more bitcoin miners. (In this case, transaction fees MAY be not market-driven, and even can be zero.)

If no anchoring transactions are confirmed for a prolonged period of time (**TODO: 3-6 hours?**), the situation MUST be investigated out of band. With overwhelming probability this situation would be caused not by insufficient fee, but rather by transaction censorship.

## 11\. Anchoring states.

In total, Anchoring service may appear in one of the following states.

1. _Anchoring_. When everything is going as usual, we are not moving to new validators set, create anchors at the necessary Exonum blockchain heights, update our LECTs, etc.
2. _Transition_. If new validator set should be applied then we wait until last common LECT receives efficient amount of confirmations. During this waiting (and until we are really moved to new validator set) Anchoring service is in the _Transition_ state.
3. _Broken_. If new validator set is applied before last common LECT get efficient number of confirmations then we fall into the _Broken_ state. We have this state until new funding transaction appears.

## 12\. Example

**TODO: example of an anchoring transaction.**

## 13\. Bugs and problems

This specification is not ideal and introduces some weak points.

1. Transaction malleability.<br>
  Let us have an anchoring chain.

  ```
  tx1 --> tx2 --> tx3 --> tx4
  ```

  `tx2..tx4` have 0 confirmations that is they where not added to any bitcoin block. If so, Byzantine node can create and broadcast over the bitcoin network `tx2_new` transaction using `transaction malleability`. If this transaction is written to the bitcoin blockchain then anchoring txs `tx3..tx4` disappear, because they would never be accepted. So, anchoring chain will look like this:

  ```
  tx1 --> tx2 --> tx3 --> tx4
  ^^^^^-> tx2_new --------------> tx_5
  ```

  And there is a big gap inside this chain. Assets-blockchain blocks anchored in `tx3`, `tx4` temporarily loose its anchors. Eventually we can assume blocks really anchored only if according anchoring transaction receives sufficient amount of confirmations.

2. Service should be paused during list of validators pubkeys changing<br>
  We change anchoring multisig-address when the list of validators pubkeys changing. The network should wait until common LECT receives sufficient amount of confirmations before moving to the new multisig-address. The certain time depends on the necessary amount of confirmations and may be placed in the range of 1-24 hours. New blocks will be not anchored in this time. See details at _Section 9.3_.

3. Broken anchoring chain<br>
  This is an enhancement of the previous point. If the common LECT would fail in receiving confirmations and the network moves to the new pubkeys list earlier, then the old anchoring chain would be broken and we would not prolong it. The service should start new anchoring chain not connected with the previous one; it looks like service is totally turned off and then turned on.

4. UTXOs spam<br>
  LECT updating now is implemented using BitcoinCore `listunspent` RPC method. Malefactor can spam our anchoring address using thousands of small txs. We will repeat checking all this transactions at every round.

5. Administrators responsibility

  1. Funding txs confirmations<br>
    Funding txs should take sufficient amount of confirmations before it could be safely used in the anchoring chain. But this is not checked by the validators and is up to administrators.
  2. Fees Just now amount of fees is fixed at the network config.

  But it is better to use adaptive techniques when the fee size is calculated according to the current bitcoin blockchain situation. If blockchain is flooded with transactions we may want to increase fee accordingly to guarantee our anchoring transactions are accepted quickly.

6. Common LECT may not be found<br>
  Every validator tracks for the LECT independently from each other. We need `+2/3` validators agree upon common LECT in order to build the next anchoring transaction. But because of bitcoin forks and `transaction malleability` sometimes nodes can not choose the common LECT. The problem will be solved only after bitcoin network set one of the forked chains as `orphaned` one.

7. Signatures checking Validator believes to Bitcoin node. It does not check any signatures for the bitcoin transactions received through RPC.

## References

- [LinkedTS]
- [Bitfury] Alexey Ostrovskiy, Yuriy Yanovich. On Blockchain Auditability (publication draft)
- [RFC2119]
- [BtcMainH] <https://github.com/bitcoin/bitcoin/blob/3665483be7be177dfa6cb608818e04f68f173c53/src/main.h#L65>
- [BIP69] <https://github.com/bitcoin/bips/blob/master/bip-0069.mediawiki>
