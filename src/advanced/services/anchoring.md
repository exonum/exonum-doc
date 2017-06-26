# Anchoring using Bitcoin multisignatures

**NB.** This document does not describe how anchoring (which tries to conform to this specification) is implemented in Exonum. We have [a separate document](anchoring-impl.md) for that.

```none
Type: Process specification
Authors: Alex Ostrovski, Bitfury Group
Viacheslav Kukushkin, Bitfury Group
```

## Abstract

This document describes the use of native Bitcoin multisignatures to anchor a private/permissioned blockchain with BFT consensus (i.e., known blockchain maintainers) onto the Bitcoin Blockchain. The anchoring achieves full accountability of private blockchain maintainers/validators (cf. accountability of the linked timestamping service as per [LinkedTS]), long-term non-repudiation, and resistance of the system to DoS, including (but not limited to) a complete shutdown of the private blockchain infrastructure. **TODO: does new anchoring really supports all these advantages?**

## 1\. Introduction

Private blockchain infrastructure necessitates additional measures for accountability of the blockchain validators. In public PoW blockchains (e.g., Bitcoin), accountability is purely economic and is based on game theory and equivocation or retroactive modifications being economically costly. Not so in private blockchains, where these two behaviors are a real threat per any realistic threat model that assumes that the blockchain is of use not only to the system validators, but also to third parties (e.g., regulators, auditors, and/or end clients in the case of a financial service blockchain). See [BFAudit] for a more detailed research on the topic.

This documents proposes a protocol for blockchain anchoring onto the Bitcoin Blockchain that utilizes the native Bitcoin capabilities of creating multisig transactions (i.e., transactions authorized by multiple entities). This is in contrast with other two approaches described in [BFAudit]:

- Anchors produced by a single blockchain maintainer (used, e.g., in Factom)
- Anchors produced using threshold ECDSA signatures. To create a threshold signature, the validators initiate a Byzantine fault-tolerant computation which results in a single ECDSA signature over the predetermined message keyed by a public key which may be deterministically computed in advance based on public keys of the validators.

### 1.1\. Glossary of Terms

**TODO:**

- Anchoring transaction
- Anchoring (pub)keys
- Validator
- Last Expected Correct Transaction (LECT)
- Auditing node
- Lightweight node
- Funding UTXO

### 1.2\. Requirements Language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119 [RFC2119].

## 2\. Assumptions and Limitations

It is assumed that one can readily create multisig transactions in Bitcoin. The exact nature of these transactions (e.g., whether they utilize SegWit or P2SH) is outside the scope of this specification. Thus, the **locking script** and **unlocking script** will refer to their meaning as if multisig transactions were created without SegWit or P2SH.

We assume that SegWit is not deployed in Bitcoin. Non-implementing SegWit makes anchoring process more difficult and non-deterministic. If you are interested in SegWit version (or SegWit is implemented in certain blockchain), please, refer to [Anchoring specification: SegWit]()

The approach is currently applicable for no more than 15 validators as per the restrictions on standard transactions in Bitcoin.

It is assumed that each validator possesses a key pair for anchoring in a cryptosystem recognized by Bitcoin (currently, only secp256k1 EC cryptosystem). The anchoring pubkeys MUST be known to all blockchain clients. The anchoring pubkeys MAY be certified, e.g., within a X.509 PKI. The anchoring private keys MAY be secured with an HSM.

It is assumed that there exists a blockchain mechanism for agreeing on the changes to the blockchain configuration. In the following specification, this mechanism will be used for the following configuration parameters:

- **Anchoring key set**, which may be caused by key rotation and/or by admitting new validators or removing validators from the validator set
- **Anchoring transaction fee** to be used in all following anchoring transactions until amended by a new configuration change
- **List of funding UTXOs** to be spent in the nearest anchoring transaction

Configuration change is outside the scope of this specification. Generally, configuration changes MAY be organized as follows:

1. **Proposal:** A validator submitting a proposal containing one or more configuration parameters to be changed and their values after the change. The proposal SHOULD also contain its validity conditions. For example, a majority of proposals MUST become invalid after the validator set is changed; proposals MAY have a limited timespan defined in terms of block height and/or block timestamp
2. **Voting:** Voting among validators for submitted block proposals. Once the required (super)majority of validators have voted in favor of the proposal, it is _locked-in_ and activated with the specified delay (e.g., in the next block).

Both proposal submission and voting MAY be implemented as specific transaction types/calls to the smart contract(s).

### 2.1\. Design Rationale

#### 2.1.1\. Authorized anchoring

The anchoring SHOULD prevent equivocation and history revisions by a colluding majority of blockchain validators [BFAudit]. The anchoring also provides long-term non-repudiation, even in the case that the majority of information about the anchored blockchain is lost or is unreliable. For this second use case, anchoring MUST be used together with blockchain receipts.

The idea of the anchoring approach described in this spec is simple: As soon as there appears an invalid anchor, the system is **broken**. We don't really care _why_ the system is broken (this MUST be determined by the out-of-band means); the key point that there is **never** a situation when there is an invalid anchor, but the blockchain itself is fine. This hypothetical situation would be detrimental for long-term non-repudiation, and may be confusing for real-time anchor verification as well (Huh? There are two contradicting anchors? Who's in the right here? Who was in the right when it all happened 20 years ago?).

#### 2.1.2\. Feedback from Bitcoin

Due to real life restrictions, Bitcoin blockchain could be forked and some of already sent anchoring transactions could be not written to the main chain of Bitcoin blockchain. Also, on malicious behavior of some validators, new bitcoin block could contain anchoring transaction that is not expected by legitimate nodes. In total, anchoring process SHOULD be flexible enough to depend on certain situation in the bitcoin blockchain and thus is not really deterministic.

In order to get the view of the Bitcoin Blockchain, the validators SHOULD maintain full nodes or SPV nodes.

## 3\. Setup

Let `pk_1`, `pk_2`, `pk_n` and `sk_1`, `sk_2`, `sk_n` denote the anchoring public and private keys of validators (`n <= 15` is the total number of validators). The public keys `pk_i` MUST be ordered alphabetically when using the encoding of a compressed key used in Bitcoin Script (i.e., each public key in this form is encoded as 33 bytes - 0x02 or 0x03 depending on the parity of the y coordinate, plus 32 bytes for the x coordinate, the most significant byte first).

Let `m` denote the minimal number of validators required for anchoring. For Byzantine fault tolerance, `m = floor(2*n/3)`. For stop fault tolerance, `m = floor(n/2)`. For no fault tolerance, `m = 1`. `m` value SHOULD correspond to the fault tolerance assumptions of the anchored blockchain.

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

It is RECOMMENDED to anchor with fixed interval between block heights (e.g., blocks `#1000`, `#2000`, `#3000`, ...). The interval SHOULD be chosen in a way that under normal conditions the interval between anchored blocks is between 10 minutes and 1 hour.

Consider the following example: there is a BFT blockchain with the normal interval between blocks equal to 3 seconds. If the blockchain is anchored each 1000 blocks, the interval between anchoring transactions is approximately 3000 seconds, or 50 minutes, i.e., within acceptable limits. The same blockchain could be anchored each 500 blocks (=25 minutes), or 200 blocks (=10 minutes).

Sometimes anchoring process timetable could differ from ideal. Such variations could be triggered by byzantine behavior of nodes, forking of bitcoin blockchain, or changing list of validators (anchoring PubKeys, see _Section 9.3_). For example, at the necessary height (`#1000` because of bitcoin blockchain fork nodes could not agree upon which anchoring transaction is the last one (and should be spent in the next anchoring tx). If so, nodes will wait until bitcoin network do not resolve its fork. Such situation is described in more details in the _Section 7_.

## 4\. Anchoring Structure

**Anchoring transaction** has the semantics of recording a proof of existence of a specific blockchain state and transaction history, authorized by the current blockchain validators. Additionally, it MAY specify a change in the validator pubkey set (in this case, the transaction is called a **transitional anchoring transaction**). The concrete instantiation of the anchoring transaction is as follows:

- It MUST conform to the Bitcoin transaction specification
- It MUST contain at least two outputs
- The first output, called the **data output**, MUST be the OP_RETURN output structured as described in _Section 4.1_
- The second output, called the **change output**, MUST specify the anchoring address for the next anchor (i.e., it MUST be equivalent to the multisig locking script described above)
- The first transaction input MUST contain a multisig witness described above, with signatures covering at least the data output and the change output. If a BFT blockchain is anchored, at most `-1/2` of sigs in the first input MAY NOT cover the data and change outputs. This is because Byzantine validators may mutate these signatures after the anchoring tx is assembled. Signatures not covering the data output and the change output SHOULD be investigated out of band.

### 4.1\. Data output

The data output MUST consist of the following parts:

- an OP_RETURN instruction (`0x6a`)
- `EXONUM` at the ASCII-code (`0x45 0x58 0x4f 0x4e 0x55 0x4d`)
- a version of the current data output, 1 byte
- blockchain-state data chunk, encoded as described further
- (optional) a recovering data chunk, encoded as described further

Every data chunk MUST be encoded as per Bitcoin Script spec (1-byte chunk length + byte sequence). All integer chunk parts MUST be little-endian, as per the general guidelines of Bitcoin Script. 

- **TODO: is there any separator byte between two chunks?**
- **TODO: shouldn't all this detailed information be located at the implementation page?**
- **TODO: does every chunk includes its own length or there is a one data-output length value right after `OP_RETURN`?**

#### 4.2.1. Blockchain-state data chunk

The chunk MUST be present in every anchoring transaction. 

- 8-byte zero-based unsigned height of the anchored block (i.e., the height of the genesis block is `0`)
- Block hash (variable length)

Block height allows for efficient lookups.

The hash function for the block hash MUST be the function used internally in the blockchain. With SHA-256 is used, the data chunk size is `8 + 32 = 40` bytes. 

#### 4.2.1\. Recovery data chunk

Recovery chunk MUST be encoded as per Bitcoin Script spec (1-byte chunk length + byte sequence).

The data of the recovery chunk is structured as follows:

- 32-byte bitcoin transaction hash. This hash shows that the current anchoring chain is the prolongation of previously stopped anchoring chain. The possible reasons of such stops are described further.

The recovery output is optional and MAY appear in the very first bitcoin anchoring transaction only if the previous anchoring chain was failed (as described in the **TODO: failure section**).

**TODO: what length does recovery chunk have?**

### 4.3\. Anchoring transaction malleability

As it was told, each anchoring bitcoin transaction should spend UTXO from the previous anchoring transaction. That builds an anchoring chain.

In order to spend bitcoins from previous change-output, we need `M` signatures out of `N` validators. These signatures are publicly available for every validator (as they are openly written in assets-blockchain). If all validators are legitimate, certain signature is built deterministically. However, any Byzantine node could step out from deterministic algorithm and change signature of anchoring transaction. Thus it creates transaction with the same anchor hash (the same data-output) but another tx-id and spread it to the bitcoin network. Such byzantine transactions make a problem: we want to build new anchoring transaction even if previous is still not included in any bitcoin block. But previous transaction could be substituted by byzantine one with another tx-id. That makes all later (already created) anchoring transactions useless. Solution of this problem lies at the **TODO: update, set a link** _Sections 5.1, 5.2_

## 6\. Anchoring Verification

Anchors can be verified both in real time and retrospectively. The real-time verification is simpler, but it is insufficient for long-term non-repudiation (see _Section 2.1_).

### 6.1\. Real-Time Verification

Anchors SHOULD be verified in real time by all parties replicating the blockchain in whole or in parts; in particular, all full nodes and lightweight nodes. Naturally, the validators MUST verify anchors.

The rules for verification is as follows:


**TODO: rewrite rules**

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

**TODO: is it really built?**

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

## 5\. Last Expected Correct Transaction

Before diving into the details of how anchoring transaction is built, the Last Expected Correct Transaction (LECT) should be introduced.

Every anchoring transaction spends change-output from the previous tx. Thus, the validators should make a consensus over which transaction is previous one ans thereby should be spent. The difference between the validators' opinions is caused by the matter and uncertainty of the bitcoin blockchain state.

Every node from time to time MUST check the bitcoin blockchain state and define which bitcoin transaction is the last one in the current anchoring chain. Such transaction is called a LECT for the specified validator. The following properties should be persisted for the LECT:

- It is valid anchoring transaction for the curren Exonum blockchain
- It may have any amount of confirmations, in particular, 0
- Its change output should be not spent. That means that the specified validator believes there was no following anchoring transactions after this one
- Among all bitcoin transactions satisfying the previous properties, LECT should have the greatest anchored Exonum block height
- If multiple transactions respond to previous conditions, any of them may be choosed as a LECT.

The identification process is out of scope for this specification and depends on the way validators communicate with the bitcoin network.

!!! note "Exonum implementation"
	See [Anchoring Implementation](anchoring-impl.md) to know how the anchoring service is implemented in the Exonum.

The LECTs' registry is maintained in the Exonum blockchain. Every validator should publicate its new LECT every time it is changed; therefore, all the validators' LECTs are publicly known to everybody.

## 7\. Creating Anchoring Transactions

This section describes generation of anchoring transactions in Exonum-BFT.

- Say `H` is the block height of the block that MUST be anchored (recall that determining the nearest `H` is fully deterministic given the blockchain data). Block `#H` is accepted using generic blockchain rules.
- Starting from this block `#H`, every validator monitors list of current LECTs. As soon as there is a common LECT (that is defined by `+2/3` validators), **anchoring transaction proposal** (the anchoring transaction without validators' sigs) is completely defined and is agreed upon by `+2/3` validators.
- Any proposal of block `#(H+1)` MUST include special type transactions from `+2/3` of validators (the exact number: e.g., 7 in a 10-party consensus), each of which contains signatures on the all inputs of the anchoring transaction proposal of a specific validator.
- Each signature MUST have `SIGHASH_ALL` sighash type.
- _All_ signatures from a specific validator MUST be valid for the corresponding transaction to be valid
- Based on the signatures, _any_ party with sufficient access to the blockchain can create anchoring transaction and broadcast it to the Bitcoin network. Because of deterministic algorithm of selecting necessary signatures for new anchoring transaction every legitimate node MUST get the same anchoring tx (with the same tx-id).
- Every legitimate validator agreed with the selected LECT (and accordingly signed anchoring transaction proposal) SHOULD update its LECT with the hash of new complete anchoring transaction. However, until such update is publicized and is written to the Exonum blockchain, validator MAY NOT count new LECT as active one.
- Also every legitimate validator agreed with the selected LECT MAY send complete anchoring transaction to the Bitcoin network.
- If at the block `#H` there is no common LECT (that is agreed upon `+2/3` validators) than no anchoring happened. Assets-blockchain continue to create new blocks. All validators wait until some of them would update its anchoring chain and common LECT would be found. By the reason of uncertainty in the bitcoin blockchain common LECT could be found even after new time for anchoring comes. New state for anchoring is the last assets-blockchain state we need to anchor. 

!!! note "Example"
	The Exonum network is at the height `#11000` and anchoring should be held every `1000` blocks. But common LECT appeared only at the height `#12345`. In that case block `#12000` would be anchored, however there would be no anchor for block `#11000`

### 7.1\. Anchoring Transaction Proposal

An anchoring transaction proposal is constructed as follows:

- It MUST conform to the Bitcoin transaction specification.
- The inputs are:

  - The change output of the selected common LECT. This input MUST present in every anchoring transaction except the first one. This input MUST have `#0` position.
  - Funding UTXOs agreed upon as configuration changes and not included in a previous anchoring transaction.

- The outputs MUST contain a data output and the change output only. The data output MUST be first, and the change output MUST be second

- The data output MUST anchor correct information as per _Section 4.1_

- The change output MUST reroute funds to the next anchoring address iff the new anchoring is defined by the accepted configuration change proposal. Otherwise, the change output MUST put funds to the same anchoring address

- The amount of funds MUST be exactly the sum of inputs minus the transaction fee, specified as per the blockchain configuration

The whole procedure MAY be automated as a smart contract, which outputs the anchoring transaction proposal.

## 8\. Assets transaction zonation

Due to uncertainty in the status of the last anchoring transactions, blocks of the assets blockchain could be divided into zones according to their anchoring status confidence.

- Green zone: blocks whose first anchoring transactions have enough confirmations in the bitcoin blockchain and thus could be not deleted (for example, `>= 144` confirmations)
- Yellow zone: blocks whose anchoring transactions are already written to the blockchain but have small number of confirmations. They are very unlikely to be deleted.
- Orange zone: blocks whose anchoring transactions is already generated and sent to the Bitcoin blockchain but still have 0 confirmations. In some cases such anchors could be removed.
- Red zone: blocks that appeared after last anchoring transaction was generated. They are still not anchored at all.

## 9\. Changing Configuration

### 9.1\. Fee value

There is no constraints as to the fee value, other than being non-negative. The mentioned value is stored at the global Exonum configuration as a constant as therefore is shared amon all validators.

The update is done through the common Global Configuration Update process and is out of scope of this specification.

The fee value is applied to all following anchoring transactions after it is accepted.

### 9.2\. Funding UTXOs

A funding UTXO is referred to as a pair `(txid, outnum)`. It MUST be locked with the locking script of the anchoring address.

1. It MUST be added by administrators through configuration changing manually.
2. Each validator monitors configuration changes.
3. After new configuration is accepted by every node (it takes place on the height `H` specified by administrator; accepting new configuration is out of the scope for this document) new funding transaction can be used. It should have enough confirmations to this moment. However, administrator is responsible for this and nodes do not check number of confirmations for UTXOs.
4. Each validator checks funding tx defined in configuration if it has not being spent yet.
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

- We SHOULD wait until common LECT is written to the Bitcoin blockchain. We do not need all really generated txs to be written
- After common LECT appears and is written to the Bitcoin blockchain, we MUST wait until it will gather sufficient number of confirmations (ex., `24`).
- Further we SHOULD generate Anchoring transaction proposal that would move money to the new anchoring address. Lets call such anchoring transaction as transitional.
- As anchoring chain is already moved to the new anchoring address we MUST wait until new validator set is applied. The anchoring process SHOULD be resumed after it.

Such process could suspend anchoring transaction on fairly a big time. For example, if we would wait until 24 confirmations, total pause could last for 4-6 hours.

If last LECT do not get enough confirmations before we move to the new validators list then anchoring chain is **BROKEN** and could not be prolonged. Anchoring service would log a lot of warnings.

#### 9.3.2\. Recovering broken anchoring

After anchoring chain was broken (_Section 9.3_) administrators MUST generate new funding transaction to the new anchoring address and spread it through Exonum blockchain. New anchoring chain WOULD be produced. The very first anchoring transaction from this chain would include optional anchoring-recovering data chunk in the data output.

## 10\. Pushing Anchoring Transactions onto Bitcoin Blockchain

A completed anchoring transaction is a (transitional) anchoring tx proposal supplied with at least `m` anchoring signatures for each input.

- A completed anchoring transaction SHOULD be pushed to the Bitcoin network by the every validator agreeing upon it after a validator receives data necessary for its creation.
- If a validator has more sigs for a completed anchoring tx than necessary, the validator SHOULD use sigs belonging to the anchoring pubkeys with the least indices as specified by the ordering in _Section 3_. Note that as a result, the validator MAY omit his own signatures from the transaction.

Note that a completed anchoring transaction MAY reference UTXOs created by previous anchoring transactions, which are not yet confirmed. This situation is normally processed by the Bitcoin nodes; a chain of unconfirmed transactions is stored in the mempool and is gradually confirmed. There are limits on the length of unconfirmed transaction chains dictated by the node policies (i.e., these rules are local and configurable, and not a part of consensus). By default, the maximum number of unconfirmed transaction ancestors/descendants is 25 [BtcMainH]. This SHOULD be enough for the anchoring intervals mentioned in _Section 3.1_.

As alias for the new Anchoring transaction could be created by byzantine node (i.e. transaction with the same outputs, but different list of signatures, thus having new tx-id) there is no guarantee that transaction would be written to the Bitcoin blockchain sometime.

Moreover, as new Anchoring transaction is based on the selected LECT that could be still in the mempool and could be substituted by another byzantine transaction, there is no guarantee that this anchored block would be really anchored sometime.

Sometimes bitcoin transactions do not want to confirm; that's a harsh reality of life. The following mechanisms SHOULD be used to minimize the risk of non-confirming anchoring transactions:

- Transaction fees SHOULD be market-driven and MAY be greater than that (e.g., 2x market value)
- If the newly created anchoring transaction cannot be broadcast to the Bitcoin network because it exceeds the unconfirmed tx depth, it MUST be stored by all validators and broadcast after the first of anchoring transactions is confirmed
- Unconfirmed anchoring transactions SHOULD be periodically re-broadcast as per generic recommendations
- The validators MAY conclude a SLA agreement with one or more bitcoin miners. (In this case, transaction fees MAY be not market-driven, and even can be zero.)

If no anchoring transactions are confirmed for a prolonged period of time (**TODO: 3-6 hours?**), the situation MUST be investigated out of band. With overwhelming probability this situation would be caused not by insufficient fee, but rather by transaction censorship.


## 12\. Example

**TODO: example of an anchoring transaction.**

## 13\. Bugs and problems

This specification is not ideal and introduces some weak points.

### 13.1. Transaction malleability

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

### 13.2. Service should be paused during list of validators pubkeys changing.

We change anchoring multisig-address when the list of validators pubkeys changing. The network should wait until common LECT receives sufficient amount of confirmations before moving to the new multisig-address. The certain time depends on the necessary amount of confirmations and may be placed in the range of 1-24 hours. New blocks will be not anchored in this time. See details at _Section 9.3_.

### 13.3. Broken anchoring chain

This is an enhancement of the previous point. If the common LECT would fail in receiving confirmations and the network moves to the new pubkeys list earlier, then the old anchoring chain would be broken and we would not prolong it. The service should start new anchoring chain not connected with the previous one; it looks like service is totally turned off and then turned on.


### 13.6. Common LECT may not be found

Every validator tracks for the LECT independently from each other. We need `+2/3` validators agree upon common LECT in order to build the next anchoring transaction. But because of bitcoin forks and `transaction malleability` sometimes nodes can not choose the common LECT. The problem will be solved only after bitcoin network set one of the forked chains as `orphaned` one.



## References

- [LinkedTS]
- [Bitfury] Alexey Ostrovskiy, Yuriy Yanovich. On Blockchain Auditability (publication draft)
- [RFC2119]
- [BtcMainH] <https://github.com/bitcoin/bitcoin/blob/3665483be7be177dfa6cb608818e04f68f173c53/src/main.h#L65>
- [BIP69] <https://github.com/bitcoin/bips/blob/master/bip-0069.mediawiki>
