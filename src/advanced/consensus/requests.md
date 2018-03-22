---
title: Requests in consensus algorithm
---
# Requests in Consensus Algorithm

<!-- cspell:ignore requestor’s -->

**Requests** are used to obtain unknown information from nodes that signal the
presence of such information via consensus messages (for example, via a message
indicating a blockchain height greater than the local blockchain height). The
algorithm for generating and handling requests is an integral part of
[the Exonum consensus algorithm][consensus].

!!! note
    In the following description, +2/3 means more than two thirds of the
    validators number. For example, +2/3 `Precommit`s means a set of valid
    `Precommit` messages, each of which is digitally signed by a different
    validator, and the size of the set is more than 2/3 of the validators
    number.

!!! note
    Auditors, along with validators, request information and respond to requests.

## Learning from Consensus Messages

Receiving [a consensus message][consensus#messages] from a node gives the
message recipient
an opportunity to learn certain information about the state of the message
author (a node that has signed the message; the message author may differ from
the peer that the message recipient got the message from), if the author is not
Byzantine. The receiving node saves this information in
[the RequestState structure](#sending-requests).

### Any Consensus Message

- The message author is at the height implied by the message;
- The author has blocks corresponding to all lesser heights;
- The author has +2/3 `Precommit` messages for each of the previous blocks.

### `Prevote`

- The author has a proposal (`Propose` message) referenced by the `Prevote`
  message;
- The author has all transactions mentioned in this proposal;
- If the author indicates the `lock_round` in the message, it has +2/3 `Prevote`
  messages for this proposal in the `locked_round` or the round with a lower
  number.

### `Precommit`

- The author has a proposal referenced by the `Precommit` message;
- The author has all transactions mentioned in this proposal;
- The author has +2/3 `Prevote` messages for this proposal in some round with a
  number equal to or lower than the round number mentioned in the `Precommit`.

### `Connect`

- It is possible to access the author by using the IP address + port
  mentioned in the message.

## Request Messages

### Field Types

`Hash` and `PublicKey` types represent SHA-256 hashes and Ed25519 public keys
and take 32 bytes.

`u32` and `u64` are non-negative integers of appropriate size (4 and 8 bytes).

`BitVec` is a bit vector containing as many bits as there are validators in
the system.

### `ProposeRequest`

Requests a `Propose` message from a node. It has the following fields:

- **from**: PublicKey  
  Requestor’s public key.
- **to**: PublicKey  
  Public key of the node to which the request was sent.
- **height**: u64  
  Height of the blockchain for which information is requested.
- **propose_hash**: Hash  
  Hash of the proposal for which information is requested.

### `TransactionsRequest`

Requests transactions from a node. It has the following fields:

- **from**: PublicKey  
  Requestor’s public key.
- **to**: PublicKey  
  Public key of the node to which the request was sent.
- **txs**: Array<Hash\>  
  List of the hashes of the requested transactions.

### `PrevotesRequest`

Requests `Prevote` messages from a node. It
has the following fields:

- **from**: PublicKey  
  Requestor’s public key.
- **to**: PublicKey  
  Public key of the node to which the request was sent.
- **height**: u64  
  Blockchain height for which information is requested.
- **round**: u32  
  Round number (at the blockchain height specified in `height` field) for which
  information is requested.
- **propose_hash**: Hash  
  Hash of the proposal for which information is requested.
- **validators**: BitVec  
  Each bit of this field indicates the need to send a `Prevote` message from
  the corresponding validator (if the bit value is 1, `Prevote` is requested; otherwise,
  `Prevote` is not needed). Indexing of the `validator` bits corresponds to
  indexing of the validator public keys in the
  [actual configuration][config#genesis].

### `BlockRequest`

Requests a committed block from a node. It has the following fields:

- **from**: PublicKey  
  Requestor’s public key.
- **to**: PublicKey  
  Public key of the node to which the request was sent.
- **height**: u64  
  Height of the blockchain for which information is requested.

### `PeersRequest`

Requests `Connect` messages from a node.
`PeersRequest` message is sent regularly with the timeout `peers_timeout`
defined in [the global configuration][config#global-parameters].
It has the following fields:

- **from**: PublicKey  
  Requestor’s public key.
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
of the requested data (hash for `Propose` and `Transactions`, round and hash for
`Prevotes`, height for `Block`). When the requested information is obtained, the node
deletes the `RequestState` for the corresponding request (cancels request).

A node sets a timeout for each sent request. The timeout is
implemented as a message to this node itself. This message is queued and
processed when it reaches its queue. Timeout deletion (cancelling timeout) means
its deletion from the message queue.

Cancelling a request means cancelling the corresponding timeout as well.

### Receiving Transaction

If this is the last transaction required for a known `Propose`,
cancel the corresponding `TransactionsRequest`.

### Receiving Consensus Message from a Bigger Height

- Update info about the height of the blockchain on the corresponding node
- Send `BlockRequest` for the current height (height of the latest
  committed block + 1) to the message author, if such a request was not
  sent earlier.

All events below are applicable only if the height of the message is the same as
the validator’s height.

### Receiving `Propose`

- If this `Propose` was requested, cancel the request. The list of
  [nodes that should have all transactions](#learning-from-consensus-messages)
  mentioned in the `Propose` message is copied from the `RequestState` before
  its deletion to request missing transactions, if necessary;
- If certain transactions from the `Propose` are not known,
  send `TransactionsRequest` to the author of `Propose`. Set the nodes in
  `RequestState` for this request as calculated at the previous step.

### Receiving `Prevote`

- If the node does not have the corresponding `Propose`, send
  `ProposeRequest` to the author of `Prevote`;
- If the sender specified `lock_round`, which is greater than the stored  
  [Proof-of-Lock (PoL)][consensus#locks], send
  `PrevotesRequest` for the locked proposal to the author of `Prevote`;
- If the node has received +2/3 `Prevote` messages for the same proposal and
  round, cancel `PrevotesRequest` for `Prevote` messages
  corresponding to this proposal (if they were requested earlier).

### Receiving `Precommit`

- If the node does not have a corresponding `Propose`, send
  `ProposeRequest` to the author of `Precommit`;
- If the message corresponds to a larger round than the saved PoL,
  send `PrevotesRequest` for this round to the author of `Precommit`;
- If the node has received +2/3 `Precommit` messages for the same proposal, cancel
  the corresponding `PrecommitRequest`(if it was sent earlier).

### Receiving `BlockResponse`

- Request the following block in the blockchain from the node (if one exists)
  that sent any message from the height greater than the current height + 1. If
  there
  are several such nodes, request is sent to the one from which the message from
  the height greater than current height + 1 was delivered first;
- Update current height after committing the block locally;
- Cancel `BlockRequest` for the height at which the block has just been committed.

### Peers Timeout

Send a `PeersRequest` request to a random peer (auditor or validator) from the
list of known peers specified in [local configuration][config#local-parameters].

### Move to New Height

Cancel all requests.

### Request Timeout

- Delete the node, to which the request was sent, from the list of
  [nodes that should have the requested data](#learning-from-consensus-messages).  This list is a part of the `RequestState` structure;
- If the list of nodes having the data to be requested is empty, cancel the
  request;
- Otherwise, make one more request attempt to another node from the list of
  nodes that should have the requested data and start a new timer.

## Requests Processing

This algorithm determines the processing of different types of request messages
received by a node.

### `ProposeRequest`

- If the message corresponds to a height that is not equal to the current height
  of the node, ignore the message;
- If the node has `Propose` with the corresponding hash at the given height,
  send it.

### `TransactionsRequest`

Send all transactions the node has from those that were requested, as
separate messages. Transactions can either be already committed or be in the
pool of unconfirmed transactions.

### `PrevotesRequest`

- If the message does not match the height at which the node is, ignore the
  message;
- Send as individual messages all the corresponding `Prevote`s except
  those that the requestor has.

### `BlockRequest`

- If the message corresponds to a height not less than that of the node,
  ignore the message;
- Form a `BlockResponse` message from the blockchain data and send it to the
  requestor.

### `PeersRequest`

Send all the saved `Connect` messages from peers to the requestor.

[consensus]: ../../architecture/consensus.md
[consensus#messages]: ../../architecture/consensus.md#messages
[consensus#locks]: ../../architecture/consensus.md#locks
[config#genesis]: ../../architecture/configuration.md#genesis
[config#global-parameters]: ../../architecture/configuration.md#global-parameters
[config#local-parameters]: ../../architecture/configuration.md#local-parameters
