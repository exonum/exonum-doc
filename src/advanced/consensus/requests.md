---
title: Requests in consensus algorithm
---
# Requests in Consensus Algorithm

<!-- cspell:ignore requestor’s -->

**Requests** are used to obtain unknown information from nodes that signal the
presence of such information via consensus messages (for example, via a message
indicating a consensus algorithm [epoch](specification.md#epochs)
greater than the local epoch). The
algorithm for generating and handling requests is an integral part of
[the Exonum consensus algorithm][consensus].

!!! note
    In the following description, +2/3 means more than two thirds of the
    validators number. For example, +2/3 `Precommit`s means a set of valid
    `Precommit` messages, each of which is digitally signed by a different
    validator, and the size of the set is more than 2/3 of the validators
    number.

!!! note
    Auditors, along with validators, request information and respond to
    requests.

## Learning from Consensus Messages

Receiving [a consensus message][consensus#messages] from a node gives the
message recipient
an opportunity to learn certain information about the state of the message
author (a node that has signed the message; the message author may differ from
the peer that the message recipient got the message from), if the author is not
Byzantine. The receiving node saves this information in
[the RequestState structure](#sending-requests).

### Any Consensus Message

- The message author is at the epoch implied by the message.
- The author has blocks corresponding to all lesser epochs.
- The author has +2/3 `Precommit` messages for each of the previous blocks,
  and possibly for the latest [block skip](specification.md#epochs)
  if a block skip was approved at the latest epoch.

### `Prevote`

- The author has a proposal (`Propose` message) referenced by the `Prevote`
  message.
- The author has all transactions mentioned in this proposal.
- If the author indicates the `lock_round` in the message, it has +2/3
  `Prevote` messages for this proposal in the `locked_round` or the round with
  a lower number.

### `Precommit`

- The author has a proposal referenced by the `Precommit` message.
- The author has all transactions mentioned in this proposal.
- The author has +2/3 `Prevote` messages for this proposal in some round with a
  number equal to or lower than the round number mentioned in the `Precommit`.

### `Connect`

- It is possible to access the author by using the address + port
  mentioned in the message.

## Request Messages

Exonum uses Protobuf as its serialization format for communication among full
nodes. All messages in Exonum have a uniform
[structure](../../architecture/transactions.md#messages) with which they should
comply.

According to the Exonum message structure, the consensus requests constitute a
payload of the corresponding consensus messages.

### Field Types

#### exonum.Hash, exonum.PublicKey

`exonum.Hash` and `exonum.PublicKey` types represent SHA-256 hashes and Ed25519
public keys and take 32 bytes.

#### uint32, uint64

`uint32` and `uint64` are non-negative integers of appropriate size (4 and 8
bytes).

#### exonum.BitVec

`exonum.BitVec` is a bit vector containing as many bits as there are validators
in the system.

#### string

`string` is a UTF-8 encoded text.

#### bytes

`bytes` is an arbitrary sequence of bytes.

### `ProposeRequest`

Requests a `Propose` message from a node. It has the following fields:

- **to**: exonum.PublicKey  
  Public key of the node to which the request was sent.
- **epoch**: uint64  
  Epoch for which information is requested.
- **propose_hash**: exonum.Hash  
  Hash of the proposal for which information is requested.

### `TransactionsRequest`

Requests transactions from a node. It has the following fields:

- **to**: exonum.PublicKey  
  Public key of the node to which the request was sent.
- **txs**: Array<exonum.Hash\>  
  List of the hashes of the requested transactions.

### `PrevotesRequest`

Requests `Prevote` messages from a node. It has the following fields:

- **to**: exonum.PublicKey  
  Public key of the node to which the request was sent.
- **epoch**: uint64  
  Epoch for which information is requested.
- **round**: uint32  
  Round number (at the epoch specified in `epoch` field) for which
  information is requested.
- **propose_hash**: exonum.Hash  
  Hash of the proposal for which information is requested.
- **validators**: exonum.BitVec  
  Each bit of this field indicates the need to send a `Prevote` message from
  the corresponding validator (if the bit value is 1, `Prevote` is requested;
  otherwise, `Prevote` is not needed). Indexing of the `validator` bits
  corresponds to indexing of validator public keys in the
  [actual configuration][config#validator-keys].

### `BlockRequest`

Requests a committed block or a block skip from a node.
It has the following fields:

- **to**: exonum.PublicKey  
  Public key of the node to which the request was sent.
- **height**: uint64  
  Height of the blockchain to retrieve.
- **epoch**: uint64  
  Epoch for which to retrieve a block skip as a fallback option.
  `epoch = 0` is used to indicate that the sender is not interested
  in the fallback.

### `PeersRequest`

Requests `Connect` messages from a node.
`PeersRequest` message is sent regularly with the timeout `peers_timeout`
defined in [the global configuration][config#consensus].
It has the following fields:

- **to**: PublicKey  
  Public key of the node to which the request was sent.

## Sending Requests

This algorithm determines the behavior of a node at different stages of the
consensus algorithm if the node needs to request information from other nodes.
The following subsections describe events that cause a specific response.

For each sent request, the node stores a `RequestState` structure,
which includes the number of request attempts made and a list of
[nodes that should have the required information](#learning-from-consensus-messages).
`RequestState` for each request is placed into a hash map where the key is
the identifier
of the requested data (hash for `Propose` and `Transactions`, round and hash  
for `Prevotes`, height and epoch for `Block`). When the requested information is
obtained, the node deletes the `RequestState` for the corresponding request
(cancels the request).

A node sets a timeout for each sent request. The timeout is
implemented as a message to this node itself. This message is queued and
processed when it reaches its queue. Timeout deletion (cancelling timeout)
means its deletion from the message queue.

Cancelling a request means cancelling the corresponding timeout as well.

### Receiving Transaction

If the received transaction is the last one required for a known `Propose`,
cancel the corresponding `TransactionsRequest`.

### Receiving Consensus Message from a Greater Epoch

- Update info about the epoch on the corresponding node.
- Send `BlockRequest` for the current epoch to the message author,
  if such a request was not sent earlier.

All events below are applicable only if the epoch of the message is the same
as the validator’s epoch.

### Receiving `Propose`

- If this `Propose` has been requested, cancel the request. The list of
  [nodes that should have all transactions](#learning-from-consensus-messages)
  mentioned in the `Propose` message is copied from the `RequestState` before
  its deletion to request missing transactions, if necessary.
- If certain transactions from the `Propose` are not known,
  send `TransactionsRequest` to the author of `Propose`. If the author of
  `Propose` does not provide information on the missing transactions, send
  `TransactionsRequest` to the remaining nodes in the `RequestState`.  

### Receiving `Prevote`

- If the node does not have the corresponding `Propose`, send
  `ProposeRequest` to the author of `Prevote`.
- If the sender specified `lock_round`, which is greater than the stored  
  [Proof-of-Lock (PoL)][consensus#locks], send
  `PrevotesRequest` for the locked proposal to the author of `Prevote`.
- If the node has received +2/3 `Prevote` messages for the same proposal and
  round, cancel `PrevotesRequest` for `Prevote` messages
  corresponding to this proposal (if they were requested earlier).

### Receiving `Precommit`

- If the node does not have a corresponding `Propose`, send
  `ProposeRequest` to the author of `Precommit`.
- If the message corresponds to a larger round than the saved PoL,
  send `PrevotesRequest` for this round to the author of `Precommit`.
- If the node has received +2/3 `Precommit` messages for the same proposal,
  cancel the corresponding `PrecommitRequest`(if it was sent earlier).

### Receiving `BlockResponse`

- Request the following block in the blockchain from the node (if one exists)
  which is known to have blocks at a greater blockchain height.
- Alternatively, if there are nodes with the same height and greater epoch,
  send `BlockRequest` to one of them.
- Update current epoch / height after committing the block locally.
- Cancel `BlockRequest` for the epoch at which the block has just been
  committed.

### Peers Timeout

Send a `PeersRequest` request to a random peer (auditor or validator) from the
list of known peers specified in [local configuration][config#peers].

### Move to New Epoch

Cancel all requests.

### Request Timeout

- Delete the node, to which the request was sent, from the list of
  [nodes that should have the requested data][#learning].  
  This list is a part of the `RequestState` structure.
- If the list of nodes having the data to be requested is empty, cancel the
  request.
- Otherwise, make one more request attempt to another node from the list of
  nodes that should have the requested data and start a new timer.

## Requests Processing

This algorithm determines the processing of different types of request messages
received by a node.

### `ProposeRequest`

- If the message corresponds to an epoch that is not equal to the current
  epoch of the node, ignore the message.
- If the node has `Propose` with the corresponding hash at the given epoch,
  send it.

### `TransactionsRequest`

Send all transactions the node has from those that were requested, as
separate messages. Transactions can either be already committed or be in the
pool of unconfirmed transactions.

### `PrevotesRequest`

- If the message does not match the epoch at which the node is, ignore the
  message.
- Send as individual messages all the corresponding `Prevote`s except
  those that the requestor has.

### `BlockRequest`

`BlockResponse` message is sent as the response. Which block or block skip
is sent, depends on the following rules:

- If the `epoch` is set to 0, it is a block at the specified `height`.
- If the `epoch != 0`, it is a block at the specified `height`
  (if it is known to the node), or the latest block skip with the epoch
  greater or equal to the `epoch` mentioned in the message.

### `PeersRequest`

Send all the saved `Connect` messages from peers to the requestor.

[consensus]: ../../architecture/consensus.md
[consensus#messages]: ../../architecture/consensus.md#messages
[consensus#locks]: ../../architecture/consensus.md#locks
[config#validator-keys]: ../../architecture/configuration.md#validator-keys
[config#consensus]: ../../architecture/configuration.md#consensus-algorithm-parameters
[config#peers]: ../../architecture/configuration.md#local-configuration
[#learning]: #learning-from-consensus-messages
