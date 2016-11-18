Anchoring using Bitcoin multisignatures
==============================

Type: Process specification

Status: Initial draft

Author: Alex Ostrovski, Bitfury Group

## Copyright

(c) 2016, Bitfury Group

## Abstract

This document describes the use of native Bitcoin multisignatures to anchor
a private/permissioned blockchain with BFT consensus (i.e., known blockchain
maintainers) onto the Bitcoin Blockchain. The anchoring achieves full 
accountability of private blockchain maintainers/validators (cf. accountability 
of the linked timestamping service as per [LinkedTS]), long-term non-
repudiation, and resistance of the system to DoS, including (but not limited to) 
a complete shutdown of the private blockchain infrastructure.

**NB.** This document *does not* describe how anchoring (which tries 
to conform to this specification) is implemented in Exonum. 
We have [a separate document](/anchoring-impl) for that.

## 1. Introduction

Private blockchain infrastructure necessitates additional measures for 
accountability of the blockchain validators. In public PoW blockchains (e.g.,
Bitcoin), accountability is purely economic and is based on game theory and 
equivocation or retroactive modifications being economically costly.
Not so in private blockchains, where these two behaviors are a real threat
per any realistic threat model that assumes that the blockchain is of use not
only to the system validators, but also to third parties (e.g., regulators,
auditors, and/or end clients in the case of a financial service blockchain). 
See [BFAudit] for a more detailed research on the topic.

This documents proposes a protocol for blockchain anchoring onto the Bitcoin 
Blockchain that utilizes the native Bitcoin capabilities of creating multisig
transactions (i.e., transactions authorized by multiple entities). This is
in contrast with other two approaches described in [BFAudit]:

  * Anchors produced by a single blockchain maintainer (used, e.g., in Factom)
  * Anchors produced using threshold ECDSA signatures. To create a threshold
    signature, the validators initiate a Byzantine fault-tolerant computation
	which results in a single ECDSA signature over the predetermined message
	keyed by a public key which may be deterministically computed in advance 
	based on public keys of the validators.
	
### 1.1. Glossary of Terms

**TODO:**

  * Anchoring transaction
  * Anchoring (pub)keys
  * Validator
  * Auditing node
  * Lightweight node
  * Funding UTXO
  
### 1.2. Requirements Language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in RFC 2119 [RFC2119].
	
## 2. Assumptions and Limitations

It is assumed that one can readily create multisig transactions in Bitcoin. 
The exact nature of these transactions (e.g., whether they utilize
SegWit or P2SH) is outside the scope of this specification. Thus, the 
**locking script** and **unlocking script** will refer to their meaning as if
multisig transactions were created without SegWit or P2SH.

We assume that SegWit is deployed in Bitcoin.

The approach is currently applicable for no more than 15 validators as per
the restrictions on standard transactions in Bitcoin.

It is assumed that each validator possesses a key pair for anchoring in a 
cryptosystem recognized by Bitcoin (currently, only secp256k1 EC cryptosystem). 
The anchoring pubkeys MUST be known to all blockchain clients. The anchoring
pubkeys MAY be certified, e.g., within a X.509 PKI. The anchoring private keys 
MAY be secured with an HSM.

It is assumed that there exists a blockchain mechanism for agreeing on the changes 
to the blockchain configuration. In the following specification, this mechanism
will be used for the following configuration parameters:

  * **Anchoring key set**, which may be caused by key rotation and/or by admitting
    new validators or removing validators from the validator set
  * **Anchoring transaction fee** to be used in all following anchoring transactions
    until amended by a new configuration change
  * **List of funding UTXOs** to be spent in the nearest anchoring transaction
  
Configuration change is outside the scope of this specification. Generally, 
configuration changes MAY be organized as follows:

 1. **Proposal:** A validator submitting a proposal containing one or more configuration parameters to be changed 
    and their values after the change. The proposal SHOULD also contain its validity 
    conditions. For example, a majority of proposals MUST become invalid after 
    the validator set is changed; proposals MAY have a limited timespan defined in terms 
    of block height and/or block timestamp
 2. **Voting:** Voting among validators for submitted block proposals. Once the required (super)majority of
    validators have voted in favor of the proposal, it is *locked-in* and activated with the
    specified delay (e.g., in the next block).
    
Both proposal submission and voting MAY be implemented as specific transaction types/calls to 
the smart contract(s).

### 2.1. Design Rationale

#### 2.1.1. Authorized anchoring

The anchoring SHOULD prevent equivocation and history revisions by a colluding majority
of blockchain validators [BFAudit]. The anchoring also provides long-term non-repudiation,
even in the case that the majority of information about the anchored blockchain
is lost or is unreliable. For this second use case, anchoring MUST be used
together with blockchain receipts.

The idea of the anchoring approach described in this spec is simple: As soon as
there appears an invalid anchor, the system is **broken**. We don't really care
*why* the system is broken (this MUST be determined by the out-of-band means);
the key point that there is **never** a situation when there is an invalid anchor,
but the blockchain itself is fine. This hypothetical situation would be
detrimental for long-term non-repudiation, and may be confusing for real-time
anchor verification as well (Huh? There are two contradicting anchors? 
Who's in the right here? Who was in the right when it all happened 20 years ago?). 
Compare with *weak subjectivity*, which essentially relies 
on the same bullshit logic: that the system state sometimes MUST be determined 
by out-of-band means.

TODO: remove *shit*

#### 2.1.2. No feedback from Bitcoin

We design the anchoring process in such a way that the feedback from the Bitcoin Blockchain
is minimized; all possible decisions are made based on the anchored blockchain. 
In particular:

  * The anchoring schedule is deterministic and agreed upon by all validators
  * The whole anchoring transaction (except for anchoring signatures) is deterministically
    assembled based on the blockchain information

## 3. Setup

Let `pk_1`, `pk_2`, `pk_n` and `sk_1`, `sk_2`, `sk_n` denote the anchoring public 
and private keys of validators (`n <= 15` is the total number of validators). 
The public keys `pk_i` MUST be ordered alphabetically when using the encoding of 
a compressed key used in Bitcoin Script (i.e., each public key in this form is encoded 
as 33 bytes - 0x02 or 0x03 depending on the parity of the y coordinate, plus 32 bytes
for the x coordinate, the most significant byte first).

Let m denote the minimal number of validators required for anchoring. For Byzantine 
fault tolerance, `m = floor(2*n/3)`. For stop fault tolerance, `m = floor(n/2)`.
For no fault tolerance, `m = 1`. `m` value SHOULD correspond to the fault tolerance
assumptions of the anchored blockchain.

The **locking script** for the multisignature is

```none
m pk_1 pk_2 ... pk_n n CHECKMULTISIG
```

The corresponding **unlocking script** is of form

```none
0 sig_i_1 sig_i_2 ... sig_i_m
```

where `sig_i_j` is a signature keyed by a public key belonging to a validator `i_j`, 
and the sequence `i_j` is monotonically increasing.

The locking script can be used to derive the **anchoring address** as per the Bitcoin 
specification. The anchoring address is used as follows:

  * By validators: to determine available funds for anchoring
  * By validators, auditors, and lightweight nodes: to monitor anchoring 
    transactions
	
The **anchoring balance** `bal` is the set of sufficiently confirmed bitcoin UTXOs sent 
to the anchoring address. The anchoring balance MAY be replenished by the validators
or third parties. The replenishment procedure is outside the scope of this 
specification.

### 3.1. Anchoring Schedule

The anchoring schedule MUST be agreed upon among the validators (e.g., as a part of
consensus rules). Changes to the schedule MUST be announced on the blockchain
as configuration changes as specified in Section 2.

It is RECOMMENDED to anchor with fixed interval between block heights 
(e.g., blocks #1000, #2000, #3000, ...). The interval SHOULD be chosen in a way that
under normal conditions the interval between anchored blocks is between 10 minutes 
and 1 hour. 

Consider the following example: there is a BFT blockchain with the normal
interval between blocks equal to 3 seconds. If the blockchain is anchored each 1000
blocks, the interval between anchoring transactions is approximately 3000 seconds,
or 50 minutes, i.e., within acceptable limits. The same blockchain could be anchored
each 500 blocks (=25 minutes), or 200 blocks (=10 minutes).

## 4. Anchoring Structure

**Anchoring transaction** has the semantics of recording a proof of existence of a 
specific blockchain state and transaction history, authorized by the current
blockchain validators. Additionally, it MAY specify a change in the validator pubkey set
(in this case, the transaction is called a **transitional anchoring transaction**).
The concrete instantiation of the anchoring transaction is as follows:

  * It MUST conform to the Bitcoin transaction specification
  * It MUST contain at least two outputs
  * The first output, called the **data output**, MUST be the OP_RETURN output 
    structured as described in Section 4.1
  * The second output, called the **change output**, MUST specify the anchoring address
    for the next anchor (i.e., it MUST be equivalent to the multisig locking script
	described above)
  * The first transaction input MUST contain a multisig witness described above,
    with signatures covering at least the data output and the change output.
    If a BFT blockchain is anchored, at most `-1/2` of sigs in the first input MAY 
    NOT cover the data and change outputs. This is because Byzantine
    validators may mutate these signatures after the anchoring tx is assembled.
    Signatures not covering the data output and the change output SHOULD be investigated
    out of band. 
	
### 4.1. Data output

The data output MUST consist of an OP_RETURN instruction (0x6a) followed by a single data
chunk encoded as per Bitcoin Script spec (1-byte chunk length + byte sequence). 
The data chunk is structured as follows:
  
  * 8-byte zero-based unsigned height of the anchored block (i.e., the height of
    the genesis block is `0`)
  * Block hash (variable length)

All integer chunk parts MUST be little-endian, as per the general guidelines 
of Bitcoin Script.

Block height allows for efficent lookups.

The hash function for the block hash MUST be the function used internally in the blockchain.
If SHA-256 is used, the data chunk size is `8 + 32 = 40` bytes. If SHA-512 is used,
the data chunk size is `8 + 64 = 72` bytes, which is less than the current maximum size 
of a data chunk for a standard bitcoin transaction (80 bytes).
	
## 5. Anchoring Verification

Anchors can be verified both in real time and retrospectively. The real-time verification is
simpler, but it is insufficient for long-term non-repudiation (see Section 2.1).

### 5.1. Real-Time Verification

Anchors SHOULD be verified in real time by all parties replicating the blockchain in whole or
in parts; in particular, all full nodes and lightweight nodes. Naturally, the validators 
MUST verify anchors.

The rules for verification is as follows:

 1. The verifier MUST monitor all spending transactions from the current anchoring address.
    Let `tx` denote a new spending transaction from such an address. 
 2. If `tx` is a valid anchoring transaction as per Section 4, then the verifier checks
    if the chain block at height specified by the anchor has the same hash as specified by the anchor. 
    If not, the verifier MUST fail verification.
 3. If `tx` is not a valid anchoring transaction, the verifier SHOULD TODO: what?.
 4. If the change output is directed to a new anchoring address, the verifier MUST switch to
    monitoring the new address and SHOULD stop monitoring the old anchoring address. 
	The verifier MUST check that the new anchoring address is that inferred by a successful 
	change proposal (Section 6.2) provided the verifier has access to the proposal. If the new 
	anchoring address differs, the verifier MUST fail verification.
 5. Otherwise, the verification succeeds.
 
If verification fails, the verifier MUST consider any further updates to the blockchain invalid.
The verifier SHOULD engage an out-of-band protocol to determine the cause(s) of the failure.

OPTIONAL checks that SHOULD alert the verifier (but MAY NOT be the cause of immediate action):

  * A block is anchored at height that should not be anchored (e.g., block #1234 if normally 
    blocks #1000, #2000, ... are anchored)
  * The same block is anchored multiple times
  * A block is anchored in the far past (say, block #1000 when the verifier is aware of an anchor 
    for block #1,000,000)
  * A block is anchored in the far future (say, block #1,000,000 when by the verifier's 
    calculations a block at this height should be created in 10 years)
	
In the case anchoring txs are absent for a prolonged period of time (e.g., 6 hours), the verifier
SHOULD engage in an out-of-band procedure to determine the cause.
	
### 5.2. Retrospective Verification and Blockchain Receipts

One of the goals of anchoring is to provide long-term non-repudiation, including the cases
when the blockchain ceases functioning and there is no authoritative source as to the blockchain
transactions or blockchain state. This problem is solved with the help of blockchain receipts.

**Blockchain receipt** for a blockchain transaction `tx` is:
  
  * `tx` encoded as per the blockchain spec
  * The path in the Merkle tree from `tx` to the transaction root of the block `b`, in which
    `tx` resides
  * Header of `b` (including block header and validators' authorization)
  * Header of `b_anc` - the first anchored block after `b`
  * Hash of the `tx_anc` - the anchoring transaction for `b_anc`
  * Hash link from `b_anc` to `b`
  
A blockchain receipt for the part of blockchain state is constructed in the same way,
but with the state instead of `tx`, and the path in the state tree.
  
In order to minimize the length of hash links, each anchored block MAY reference hashes of 
all blocks `b` such that they are not referenced by any other anchored block.
For example, if blocks at height 0, 1000, 2000, ... are anchored, a block #2000 may
include references to blocks #1000, #1001, ..., #1999. These references MAY be organized
as a Merkle tree to yield compact block headers and receipts.

**Blockchain receipts** are retrospectively verified based on the following data:

  * Generic blockchain spec (includes transaction and block formats)
  * List of initial anchoring pubkeys
  * Initial value of `m`
  
Note that initial anchoring pubkeys and initial `m` SHOULD be committed 
to the genesis block header in some way, so essentially only the genesis block hash 
is required.

#### 5.2.1. Inner blockchain checks

 1. Verify that the receipt has all necessary data fields
 2. Verify that fields have the correct form, e.g., `tx` is a valid transaction
    and `b` and `b_anc` are valid block headers
 3. Verify that the `b`'s header commits to `tx`
 4. Verify that the link from `b_anc` to `b` is valid
  
#### 5.2.2. Anchoring checks

 5. Verify that `tx_anc` is a bitcoin transaction
 6. Verify that `tx_anc` is an anchoring transaction, without verifying authorization
    by proper validators yet
 7. Verify that `b_anc` is anchored by `tx_anc`
 6. Verify that `tx_anc` has proper authorization per the procedure below
 
Verifying authorization of `tx_anc`:

 1. Calculate the initial anchoring address `addr`.
 2. Load spending transactions from `addr` ordered as in the Bitcoin Blockchain,
    until the first transitional anchoring transaction.
    XXX: Is there an efficient way to query spending txs and/or transitional anchoring txs?
	is encountered, or spending txs are depleted. Let `txs` be the list of loaded 
	transactions ordered as in the Bitcoin Blockchain.
 3. If `tx_anc` is in `txs`, the check succeeds. 
    XXX: If any transaction in `txs` is not an anchoring transaction, fail. 
 4. Else, if the last transaction in `txs` is a transitional anchoring transaction,
    assign `addr` to the new address specified by this transaction, and go to step 2.
 5. If the last transaction in `txs` is not a transitional anchoring transaction,
    fail.
    
An additional heuristic MAY be applied: once the minimum block height for
transactions in `txs` is significantly greater than `tx_anc`, fail.
For the procedure described in Section 6, the ordering of anchoring txs on the Bitcoin
Blockchain coincides with their generation order. Hence, the verification MUST
fail as soon as any transaction in `txs` is later than `tx_anc` and `tx_anc` is
not in `txs`.

This procedure assumes that the validators had not gone rogue before `tx_anc`.
If they had, this is probably public knowledge, so `tx_anc` is not considered valid
in any case. However, additional checks MAY be applied, e.g. to check that there are
no two anchors at the same height.

XXX: anchoring some shit is a more viable case, yet we don't consider it.
A third party may publish a conflicting block header on the BB (sort of, it takes 
much place), but how do we find it? 
    
TODO: suspicious signs, like anchoring schedule, etc.

### 5.3. Hybrid Verification

A variant of real-time verification could be adopted for "near" real-time verification,
e.g., by synching full or lightweight nodes. In this case, the latest blockchain state
known by the node should not be that far behind the current state, so the verification
procedure is simpler than retrospective verification described above.

## 6. Creating Anchoring Transactions

This section describes generation of anchoring transactions in Exonum-BFT.

  * Say `H` is the block height of the block that MUST be anchored (recall that determining
    the nearest `H` is fully deterministic given the blockchain data).
    Block `#H` is accepted using generic blockchain rules. Given this block, the
    **anchoring transaction proposal** (the anchoring transaction without validators' sigs) 
    is completely defined and is agreed upon by all validators.
  * Any proposal of block `#(H+1)` MUST include special type transactions from `+2/3`
    of validators (the exact number: e.g., 7 in a 10-party consensus), 
    each of which contains signatures on the all inputs of the 
    anchoring transaction proposal of a specific validator. Any block proposal with
    the incorrect amount of these signatures is invalid and MUST NOT be processed.
  * Each signature MUST have `SIGHASH_ALL` sighash type.
  * *All* signatures from a specific validator MUST be valid for the corresponding transaction
    to be valid
  * Based on the signatures, *any* party with sufficient access to the blockchain can create
    the only anchoring transaction and broadcast it to the Bitcoin network.

### 6.1. Anchoring Transaction Proposal

An anchoring transaction proposal is constructed as follows:

  * It MUST conform to the Bitcoin transaction specification with SegWit activated 
    (except having no signature witnesses for the transaction inputs)
  * The inputs are:
      * The change output of the previous anchoring tx. TODO: very first anchoring tx
      * Funding UTXOs agreed upon as configuration changes and not included in a previous
        anchoring transaction
    The inputs are ordered using BIP 69 [BIP69]
  * The outputs are MUST contain a data output and the change output, and no other outputs.
    The data output MUST be first, and the change output MUST be second
  * The data output MUST anchor correct information as per Section 4.1
  * The change output MUST reroute funds to the next anchoring address iff the new anchoring
    is defined by the accepted configuration change proposal. Otherwise, the change output
    MUST put funds to the same anchoring address
  * The amount of funds MUST be exactly the sum of inputs minus the transaction fee, specified
    as per the blockchain configuration

The whole procedure MAY be automated as a smart contract, which outputs the anchoring
transaction proposal.

### 6.2. Changing Configuration

#### 6.2.1. Fee value

There is no constraints as to the fee value, other than being non-negative. 
Sound values SHOULD be determined
based on the sufficiently confirmed part of the Bitcoin Blockchain (so that it is shared
among all validators).

The fee value is applied to all following anchoring transactions after it is accepted.

#### 6.2.2. Funding UTXOs

A funding UTXO is referred to as a pair `(txid, outnum)`. It MUST be locked
with the locking script of the anchoring address. It MUST have a sufficient number of
confirmations (e.g., `24`), which MUST be a part of the blockchain configuration.

Looking for funding UTXOs is the only feedback from the Bitcoin Blockchain in the described
approach. In order to get the view of the Bitcoin Blockchain, the validators SHOULD
maintain full nodes or SPV nodes.

The accepted funding UTXOs MUST be added to the next anchoring transaction. After this,
they MUST NOT be added to the following anchoring transactions.

#### 6.2.3. Anchoring pubkeys 

Anchoring pubkeys MAY be changed in the course of periodic key rotation. Alternatively,
they MUST be changed when the validator set changes. The keys MUST be specified
in the compressed 33-bytes form, as in Bitcoin. The validity of anchoring
pubkeys is governed by generic Bitcoin rules. Further validity SHOULD be established
by out-of-band means.

### 6.3. Pushing Anchoring Transactions onto Bitcoin Blockchain

A completed anchoring transaction is a (transitional) anchoring tx proposal
supplied with at least `m` anchoring signatures for each input.

  * A completed anchoring transaction SHOULD be pushed
    to the Bitcoin network by the proposer of the block at height `H+1`.
  * If a validator has more sigs for a completed anchoring tx than necessary,
    the validator SHOULD use sigs belonging to the anchoring pubkeys with the least indices
    as specified by the ordering in Section 3. Note that as a result, the validator
    MAY omit his own signatures from the transaction.
  * If a completed tx is not pushed to the network for 1 minute (TODO: parameter?) 
    after a validator receives data necessary for its creation, 
    the validator SHOULD push the completed tx on his own.

As the anchoring transaction is created after the anchored block is finalized, 
only one anchoring tx proposal can gather enough signatures (or else the system is 
working improperly, anchoring keys are compromised, etc.).

A transaction with differing multisig witnesses may be pushed by different
validators (including: by different block proposers at height `H+1`). 
This does not harm the system; consensus on the Bitcoin Blockchain
ensures that only one of these transactions will be recorded. We assume SegWit is
deployed (*fingers crossed*). This means **all** anchoring transactions from different
validators will have the same hash and will be treated as the same tx; thus,
there is need to care that hashes of previous anchoring txs may change.

Note that a completed anchoring transaction MAY reference UTXOs created 
by previous anchoring transactions, which are not yet confirmed. This situation is
normally processed by the Bitcoin nodes; a chain of unconfirmed transactions is
stored in the mempool and is gradually confirmed. There are limits on the length
of unconfirmed transaction chains dictated by the node policies (i.e., 
these rules are local and configurable, and not a part of consensus). By default, 
the maximum number of unconfirmed transaction ancestors/descendants is 25 [BtcMainH]. 
This SHOULD be enough for the anchoring intervals mentioned in Section 3.1.

Sometimes bitcoin transactions do not want to confirm; that's a harsh reality of life.
The following mechanisms SHOULD be used to minimize the risk of non-confirming 
anchoring transactions:

  * Transaction fees SHOULD be market-driven and MAY be greater than that (e.g., 
    2x market value)
  * If the newly created anchoring transaction cannot be broadcast to the Bitcoin network
    because it exceeds the unconfirmed tx depth, it MUST be stored by all validators and broadcast
	after the first of anchoring transactions is confirmed
  * Unconfirmed anchoring transactions SHOULD be periodically re-broadcast as per generic
    recommendations
  * The validators MAY conclude a SLA agreement with one or more bitcoin miners.
    (In this case, transaction fees MAY be not market-driven, and even can be zero.)
	
If no anchoring transactions are confirmed for a prolonged period of time (TODO: 3-6 hours?),
the situation MUST be investigated out of band. With overwhelming probability this situation
would be caused not by insufficient fee, but rather by transaction censorship.

## 7. Example

TODO: example of an anchoring transaction.

## References

  * [LinkedTS]
  * [Bitfury] Alexey Ostrovskiy, Yuriy Yanovich. On Blockchain Auditability
    (publication draft)
  * [RFC2119]
  * [BtcMainH] https://github.com/bitcoin/bitcoin/blob/3665483be7be177dfa6cb608818e04f68f173c53/src/main.h#L65
  * [BIP69] https://github.com/bitcoin/bips/blob/master/bip-0069.mediawiki
