# Anchoring using Bitcoin multisignatures. Exonum implementation

This page describes how anchoring service is implemented in the Exonum. The formal specification is located [here](anchoring.md); however, some key points of the implementation code are worth to be mentioned additionally.

## Bitcoin node

Currently, anchoring service relies on the backward [`Bitcoind`][bitcoind-node] node. Its [RPC API][bitcoind-rpc] is used to communicate with the bitcoin network.

## LECT maintaining

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

## Implementation problems

### 13.7. Signatures checking Validator believes to Bitcoin node

It does not check any signatures for the bitcoin transactions received through RPC.

### 13.5. Administrators responsibility

#### 13.5.1. Funding txs confirmations

Funding txs should take sufficient amount of confirmations before it could be safely used in the anchoring chain. But this is not checked by the validators and is up to administrators.

#### 13.5.2. Fees 

Just now amount of fees is fixed at the network config. But it is better to use adaptive techniques when the fee size is calculated according to the current bitcoin blockchain situation. If blockchain is flooded with transactions we may want to increase fee accordingly to guarantee our anchoring transactions are accepted quickly.

### 13.4. UTXOs spam

  LECT updating now is implemented using BitcoinCore `listunspent` RPC method. Malefactor can spam our anchoring address using thousands of small txs. We will repeat checking all this transactions at every round.

 ## 11\. Anchoring states.

In total, Anchoring service may appear in one of the following states.

1. _Anchoring_. When everything is going as usual, we are not moving to new validators set, create anchors at the necessary Exonum blockchain heights, update our LECTs, etc.
2. _Waiting_. If new validator set should be applied then we wait until last common LECT receives efficient amount of confirmations. During this waiting (and until we are really moved to new validator set) Anchoring service is in the _Waiting_ state.
3. _Transition_. After the network moves to the new anchoring bitcoin address, it remains in the _Transition_ status until transferring transaction get enough confirmations. The difference between _Transition_ and _Anchoring_ is that transferring transaction may be loosed and thus attention is kept.
3. _Broken_. If new validator set is applied before last common LECT get efficient number of confirmations then we fall into the _Broken_ state. We have this state until new funding transaction appears.

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